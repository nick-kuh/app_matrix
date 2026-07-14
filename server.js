import express from 'express';
import cookieParser from 'cookie-parser';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomBytes, createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'shark';
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 500000);

// duracao do timer individual de investimento (por jogador), em ms
const INVEST_WINDOW_MS = 90 * 1000;
// pequeno slack pra atrasos de rede/relogio na checagem do server
const INVEST_SLACK_MS = 2000;

// Areas fixas (mesmas do oraculo do telao + OUTROS pra quem nao esta em nenhuma)
const AREAS_LIST = [
  'CONSUMER',
  'CUSTOMER DEVELOPMENT',
  'FOCUS MARKET',
  'DATAHUB',
  'STRATEGY',
  'MAKE (BUSINESS OP)',
  'OUTROS',
];

// Agentes: nome + area + multiplicador do saldo.
// A area AGENTES nao bate com nenhum case, entao agentes podem investir em todos.
const DIRECTORS = {
  claudia: { name: 'AGENTE CLAUDIA MEIRA', area: 'AGENTES', balanceMult: 2 },
  felipe:  { name: 'AGENTE FELIPE RESCK',  area: 'AGENTES', balanceMult: 2 },
  ia:      { name: 'AGENTE IA',            area: 'AGENTES', balanceMult: 2 },
};

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ---------- storage ----------

function emptyDb() {
  return {
    teams: [],        // [{id, name, area, balance, createdAt, investingStartedAt, finalizedAt}]
    sessions: {},     // { sid: teamId }
    cases: [],
    investments: [],  // [{id, teamId, caseId, amount, createdAt}]
    areas: [],
    startingBalance: STARTING_BALANCE,
    gameState: 'presenting', // presenting | investing | revealing | revealed
  };
}

let db = emptyDb();

if (existsSync(DATA_FILE)) {
  try {
    db = { ...emptyDb(), ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
    // garante os campos novos em times antigos
    for (const t of db.teams) {
      if (t.investingStartedAt === undefined) t.investingStartedAt = null;
      if (t.finalizedAt === undefined) t.finalizedAt = null;
    }
  } catch (e) {
    console.error('data.json corrompido, recomeçando', e);
    db = emptyDb();
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  }, 100);
}

const hash = (s) => createHash('sha256').update(s).digest('hex');
const newId = () => randomBytes(8).toString('hex');

save();

// ---------- SSE broadcaster ----------

const sseClients = new Set();
function broadcast(type, payload) {
  const data = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(data); } catch {}
  }
}

// ---------- app ----------

const app = express();

// Render/Railway/Heroku ficam atrás de proxy — sem isso o Express não sabe que
// a request é HTTPS, o que impede cookie 'secure' de ser setado corretamente e
// pode deixar o admin sem conseguir logar em produção.
app.set('trust proxy', 1);

app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Detecta se a request veio via HTTPS (funciona com trust proxy). Cookies
// 'secure' precisam disso em produção — sem isso o browser rejeita o cookie
// e o login do admin não persiste.
function cookieOpts(req, extra = {}) {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    ...extra,
  };
}

// ---------- auth ----------

function currentTeam(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  const teamId = db.sessions[sid];
  if (!teamId) return null;
  return db.teams.find((t) => t.id === teamId) || null;
}

function requireTeam(req, res, next) {
  const t = currentTeam(req);
  if (!t) return res.status(401).json({ error: 'not_authenticated' });
  req.team = t;
  next();
}

function requireAdmin(req, res, next) {
  if (req.cookies?.admin !== hash(ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'admin_required' });
  }
  next();
}

// ---------- game state helpers ----------

// Considera um jogador "ativo" (participando da rodada em curso)
function isRoundParticipant(t) {
  return !!t.investingStartedAt;
}

function participantsSummary() {
  const participants = db.teams.filter(isRoundParticipant);
  const finalized = participants.filter((t) => !!t.finalizedAt).length;
  return {
    total: participants.length,
    finalized,
    readyToReveal: participants.length > 0 && finalized === participants.length,
  };
}

function currentGameState() {
  const s = participantsSummary();
  return {
    state: db.gameState,
    participantsTotal: s.total,
    participantsFinalized: s.finalized,
    readyToReveal: s.readyToReveal,
  };
}

function broadcastGameState() {
  broadcast('game-state', currentGameState());
}

app.get('/api/game-state', (req, res) => {
  res.json(currentGameState());
});

app.get('/api/areas', (req, res) => {
  res.json({ areas: AREAS_LIST });
});

// ---------- login (participante) ----------

app.post('/api/team-login', (req, res) => {
  if (db.gameState !== 'investing') {
    return res.status(400).json({ error: 'fase_invalida' });
  }
  const name = String(req.body?.name || '').trim();
  const areaRaw = String(req.body?.area || '').trim().toUpperCase();
  if (!name) return res.status(400).json({ error: 'nome_obrigatorio' });
  if (!areaRaw) return res.status(400).json({ error: 'area_obrigatoria' });
  if (!AREAS_LIST.includes(areaRaw)) return res.status(400).json({ error: 'area_invalida' });

  const now = Date.now();
  const team = {
    id: newId(),
    name,
    area: areaRaw,
    balance: db.startingBalance,
    createdAt: now,
    investingStartedAt: now,
    finalizedAt: null,
  };
  db.teams.push(team);

  const sid = newId() + newId();
  db.sessions[sid] = team.id;
  save();
  res.cookie('sid', sid, cookieOpts(req, { maxAge: 30 * 24 * 3600 * 1000 }));
  broadcastGameState();
  res.json({
    id: team.id,
    name: team.name,
    area: team.area,
    balance: team.balance,
    investingStartedAt: team.investingStartedAt,
    investWindowMs: INVEST_WINDOW_MS,
    isDirector: !!team.isDirector,
  });
});

// Login de agente — sem input, só o codename da URL. Cria um team com nome
// pré-definido, área AGENTES, saldo 2x.
app.post('/api/director-login', (req, res) => {
  if (db.gameState !== 'investing') {
    return res.status(400).json({ error: 'fase_invalida' });
  }
  const codename = String(req.body?.codename || '').trim().toLowerCase();
  const preset = DIRECTORS[codename];
  if (!preset) return res.status(400).json({ error: 'diretor_invalido' });

  // Se já existir um diretor com esse nome nesta rodada, reaproveita
  // (evita duplicar quem recarrega a página). Timer não reinicia.
  let team = db.teams.find((t) => t.isDirector && t.directorCode === codename && isRoundParticipant(t));
  if (!team) {
    const now = Date.now();
    team = {
      id: newId(),
      name: preset.name,
      area: preset.area,
      isDirector: true,
      directorCode: codename,
      balance: Math.floor(db.startingBalance * (preset.balanceMult || 1)),
      createdAt: now,
      investingStartedAt: now,
      finalizedAt: null,
    };
    db.teams.push(team);
  }

  const sid = newId() + newId();
  db.sessions[sid] = team.id;
  save();
  res.cookie('sid', sid, cookieOpts(req, { maxAge: 30 * 24 * 3600 * 1000 }));
  broadcastGameState();
  res.json({
    id: team.id,
    name: team.name,
    area: team.area,
    balance: team.balance,
    investingStartedAt: team.investingStartedAt,
    investWindowMs: INVEST_WINDOW_MS,
    isDirector: true,
  });
});

app.post('/api/logout', (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) {
    delete db.sessions[sid];
    save();
  }
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const t = currentTeam(req);
  if (!t) return res.json({ team: null });
  res.json({
    team: {
      id: t.id,
      name: t.name,
      area: t.area,
      balance: t.balance,
      investingStartedAt: t.investingStartedAt,
      finalizedAt: t.finalizedAt,
      isDirector: !!t.isDirector,
      directorCode: t.directorCode || null,
    },
    startingBalance: db.startingBalance,
    investWindowMs: INVEST_WINDOW_MS,
    gameState: db.gameState,
  });
});

// ---------- helpers de cases ----------

function teamPositionInCase(teamId, caseId) {
  return db.investments
    .filter((i) => i.teamId === teamId && i.caseId === caseId)
    .reduce((s, i) => s + i.amount, 0);
}

function publicCase(c) {
  const invs = db.investments.filter((i) => i.caseId === c.id);
  const totalRaised = invs.reduce((s, i) => s + Math.max(0, i.amount), 0);
  const netByTeam = new Map();
  for (const i of invs) {
    netByTeam.set(i.teamId, (netByTeam.get(i.teamId) || 0) + i.amount);
  }
  const activeInvestors = [...netByTeam.values()].filter((v) => v > 0).length;
  const netTotal = [...netByTeam.values()].reduce((s, v) => s + v, 0);

  return {
    id: c.id,
    area: c.area,
    nome: c.nome,
    autor: c.autor || '',
    duracao: c.duracao || '',
    desafio: c.desafio || '',
    stakeholder: c.stakeholder || '',
    solucao: c.solucao || '',
    tools: c.tools || null,
    impacto: c.impacto || null,
    timeToValue: c.timeToValue || '',
    extras: c.extras || null,
    pos: c.pos || 0,
    status: c.status,
    createdAt: c.createdAt,
    resolvedAt: c.resolvedAt ?? null,
    totalRaised,
    netInvested: netTotal,
    investorCount: activeInvestors,
  };
}

app.get('/api/cases', (req, res) => {
  const list = [...db.cases].sort((a, b) => a.createdAt - b.createdAt).map(publicCase);
  res.json({ cases: list });
});

app.get('/api/cases/current', (req, res) => {
  const c = [...db.cases].reverse().find((x) => x.status === 'open');
  res.json({ case: c ? publicCase(c) : null });
});

app.get('/api/cases/:id', (req, res) => {
  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'nao_encontrado' });
  res.json({ case: publicCase(c) });
});

// ---------- investir ----------

app.post('/api/cases/:id/invest', requireTeam, (req, res) => {
  if (db.gameState !== 'investing') return res.status(400).json({ error: 'rodada_fechada' });
  const team = req.team;
  if (team.finalizedAt) return res.status(400).json({ error: 'tempo_esgotado' });
  if (team.investingStartedAt && (Date.now() - team.investingStartedAt) > (INVEST_WINDOW_MS + INVEST_SLACK_MS)) {
    // auto-finaliza pra manter consistencia
    team.finalizedAt = Date.now();
    save();
    broadcast('team-finalized', {
      teamId: team.id,
      name: team.name,
      area: team.area,
      ...participantsSummary(),
    });
    broadcastGameState();
    return res.status(400).json({ error: 'tempo_esgotado' });
  }

  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'caso_nao_encontrado' });
  if (c.status !== 'open') return res.status(400).json({ error: 'caso_fechado' });

  // Ninguem pode investir no case da propria area (agentes tem area AGENTES,
  // que nao bate com nenhum case, entao investem em todos)
  if (team.area && c.area &&
      String(team.area).trim().toUpperCase() === String(c.area).trim().toUpperCase()) {
    return res.status(400).json({ error: 'area_propria' });
  }

  const amount = Math.floor(Number(req.body?.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'valor_invalido' });
  }
  if (amount > team.balance) {
    return res.status(400).json({ error: 'saldo_insuficiente' });
  }

  team.balance -= amount;
  const inv = {
    id: newId(),
    teamId: team.id,
    caseId: c.id,
    amount,
    createdAt: Date.now(),
  };
  db.investments.push(inv);
  save();
  broadcast('investment', {
    caseId: c.id,
    teamId: team.id,
    teamName: team.name,
    area: team.area,
    amount,
    action: 'invest',
  });
  res.json({
    ok: true,
    balance: team.balance,
    position: teamPositionInCase(team.id, c.id),
  });
});

// Retirar desativado (regra do TCC)
app.post('/api/cases/:id/withdraw', requireTeam, (req, res) => {
  return res.status(400).json({ error: 'resgate_desativado' });
});

// ---------- finalize (timer do jogador acabou) ----------

app.post('/api/finalize', requireTeam, (req, res) => {
  const team = req.team;
  if (!team.finalizedAt) {
    team.finalizedAt = Date.now();
    save();
    broadcast('team-finalized', {
      teamId: team.id,
      name: team.name,
      area: team.area,
      ...participantsSummary(),
    });
    broadcastGameState();
  }
  res.json({ ok: true, finalizedAt: team.finalizedAt });
});

// ---------- meus dados ----------

app.get('/api/investments/mine', requireTeam, (req, res) => {
  const invs = db.investments
    .filter((i) => i.teamId === req.team.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((i) => {
      const c = db.cases.find((x) => x.id === i.caseId);
      return {
        id: i.id,
        amount: i.amount,
        createdAt: i.createdAt,
        caseId: i.caseId,
        caseNome: c?.nome || 'Case removido',
        caseArea: c?.area || '',
        caseStatus: c?.status || 'unknown',
      };
    });

  const byCase = new Map();
  for (const inv of invs) {
    const cur = byCase.get(inv.caseId) || {
      caseId: inv.caseId,
      caseNome: inv.caseNome,
      caseArea: inv.caseArea,
      caseStatus: inv.caseStatus,
      position: 0,
    };
    cur.position += inv.amount;
    byCase.set(inv.caseId, cur);
  }
  const positions = [...byCase.values()];

  res.json({ transactions: invs, positions });
});

// ---------- ranking / resultados ----------

function computeResults() {
  const cases = [...db.cases].sort((a, b) => a.createdAt - b.createdAt);
  const results = cases.map((c) => {
    const invs = db.investments.filter((i) => i.caseId === c.id);
    const totalByInvestor = invs.reduce((s, i) => s + i.amount, 0);
    const investorCount = new Set(invs.map((i) => i.teamId)).size;

    // agrega por area
    const byArea = new Map(); // area -> { total, investors: Set<teamId> }
    for (const inv of invs) {
      const team = db.teams.find((t) => t.id === inv.teamId);
      if (!team) continue;
      const area = team.area || 'DESCONHECIDA';
      const cur = byArea.get(area) || { total: 0, investors: new Set() };
      cur.total += inv.amount;
      cur.investors.add(inv.teamId);
      byArea.set(area, cur);
    }
    const breakdown = [];
    let totalByArea = 0;
    for (const [area, agg] of byArea.entries()) {
      const avg = agg.investors.size > 0 ? agg.total / agg.investors.size : 0;
      breakdown.push({ area, average: avg, total: agg.total, investorCount: agg.investors.size });
      totalByArea += avg;
    }
    breakdown.sort((a, b) => b.average - a.average);

    return {
      caseId: c.id,
      nome: c.nome,
      area: c.area,
      pos: c.pos || 0,
      totalByInvestor,
      investorCount,
      totalByArea,
      breakdown,
    };
  });

  // ranking pelo total por area media (criterio do vencedor)
  const ranking = [...results].sort((a, b) => b.totalByArea - a.totalByArea);
  const winner = ranking[0] && ranking[0].totalByArea > 0 ? ranking[0] : (ranking[0] || null);
  return { results, ranking, winner };
}

app.get('/api/admin/results', requireAdmin, (req, res) => {
  res.json(computeResults());
});

// ---------- telao bridge ----------

function telaoKey(area, nome) {
  return String(area).trim() + '::' + String(nome).trim();
}

app.post('/api/telao/areas', (req, res) => {
  const areas = Array.isArray(req.body?.areas) ? req.body.areas : [];
  db.areas = areas;
  save();
  res.json({ ok: true, count: areas.length });
});

app.post('/api/telao/state', (req, res) => {
  // durante revealing/revealed nao aceita cases novos (evita corrida)
  if (db.gameState !== 'presenting' && db.gameState !== 'investing') {
    return res.json({ ok: true, ignored: true });
  }
  const results = Array.isArray(req.body?.results) ? req.body.results : [];
  let created = 0;

  results.forEach((r, idx) => {
    if (!r || !r.caso || !r.caso.nome) return;
    const key = telaoKey(r.area, r.caso.nome);
    const existing = db.cases.find((c) => c.telaoKey === key);
    if (existing) return;
    const c = {
      id: newId(),
      telaoKey: key,
      area: r.area,
      nome: r.caso.nome,
      autor: r.caso.autor || '',
      duracao: r.caso.duracao || '',
      desafio: r.caso.desafio || '',
      stakeholder: r.caso.stakeholder || '',
      solucao: r.caso.solucao || '',
      tools: r.caso.tools || null,
      impacto: r.caso.impacto || null,
      timeToValue: r.caso.timeToValue || '',
      extras: r.caso.extras || null,
      pos: idx + 1,
      status: 'open',
      createdAt: Date.now() + idx,
      resolvedAt: null,
    };
    db.cases.push(c);
    broadcast('case-created', publicCase(c));
    created++;
  });

  if (created > 0) save();
  res.json({ ok: true, created });
});

app.post('/api/telao/reset', (req, res) => {
  db.cases = [];
  db.investments = [];
  for (const t of db.teams) {
    t.balance = db.startingBalance;
    t.investingStartedAt = null;
    t.finalizedAt = null;
  }
  db.gameState = 'presenting';
  save();
  broadcast('reset', {});
  broadcastGameState();
  res.json({ ok: true });
});

// ---------- admin ----------

app.post('/api/admin/login', (req, res) => {
  const pwd = String(req.body?.password || '');
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'senha_invalida' });
  res.cookie('admin', hash(ADMIN_PASSWORD), cookieOpts(req, { maxAge: 7 * 24 * 3600 * 1000 }));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ isAdmin: req.cookies?.admin === hash(ADMIN_PASSWORD) });
});

app.delete('/api/admin/cases/:id', requireAdmin, (req, res) => {
  const idx = db.cases.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'nao_encontrado' });
  const c = db.cases[idx];

  // devolve o dinheiro dos times (posicao liquida)
  const positions = new Map();
  for (const inv of db.investments.filter((i) => i.caseId === c.id)) {
    positions.set(inv.teamId, (positions.get(inv.teamId) || 0) + inv.amount);
  }
  for (const [teamId, pos] of positions.entries()) {
    if (pos <= 0) continue;
    const team = db.teams.find((t) => t.id === teamId);
    if (team) team.balance += pos;
  }
  db.investments = db.investments.filter((i) => i.caseId !== c.id);
  db.cases.splice(idx, 1);
  save();
  broadcast('case-removed', { id: c.id });
  res.json({ ok: true });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  const teams = db.teams.map((t) => {
    const invested = db.investments
      .filter((i) => i.teamId === t.id)
      .reduce((s, i) => s + i.amount, 0);
    return {
      id: t.id,
      name: t.name,
      area: t.area,
      balance: t.balance,
      invested,
      investingStartedAt: t.investingStartedAt,
      finalizedAt: t.finalizedAt,
      isParticipant: isRoundParticipant(t),
    };
  });
  res.json({
    teams,
    cases: db.cases.map(publicCase),
    investments: db.investments,
    startingBalance: db.startingBalance,
    results: computeResults(),
    gameState: currentGameState(),
    investWindowMs: INVEST_WINDOW_MS,
  });
});

app.post('/api/admin/starting-balance', requireAdmin, (req, res) => {
  const v = Math.floor(Number(req.body?.value || 0));
  if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'invalido' });
  db.startingBalance = v;
  save();
  res.json({ startingBalance: db.startingBalance });
});

// Mudanca de fase
app.post('/api/admin/game-state', requireAdmin, (req, res) => {
  const next = String(req.body?.state || '').trim();
  const valid = ['presenting', 'investing', 'revealing', 'revealed'];
  if (!valid.includes(next)) return res.status(400).json({ error: 'fase_invalida' });

  if (next === 'investing' && db.gameState !== 'investing') {
    // ao abrir a rodada, limpa participantes/investimentos antigos pra rodar zerado
    // (mantém cases pra reaproveitar da apresentação)
    db.investments = [];
    // remove sessoes antigas: forca todos a re-entrar
    db.sessions = {};
    db.teams = [];
  }
  if (next === 'presenting') {
    // volta pra apresentacao: limpa rodada mas mantem historico se quiser
    for (const t of db.teams) {
      t.investingStartedAt = null;
      t.finalizedAt = null;
    }
  }

  db.gameState = next;
  save();
  broadcastGameState();
  res.json({ ok: true, ...currentGameState() });
});

// Forcar encerramento (marca todos como finalizados)
app.post('/api/admin/force-finalize', requireAdmin, (req, res) => {
  const now = Date.now();
  let n = 0;
  for (const t of db.teams) {
    if (isRoundParticipant(t) && !t.finalizedAt) {
      t.finalizedAt = now;
      n++;
    }
  }
  save();
  broadcastGameState();
  res.json({ ok: true, finalized: n });
});

// Revelar vencedor (dispara suspense longo no telao — o telao "enrola" com
// mensagens de processamento enquanto isso)
const REVEAL_SUSPENSE_MS = 14000;
app.post('/api/admin/reveal', requireAdmin, (req, res) => {
  const results = computeResults();
  db.gameState = 'revealing';
  save();
  broadcastGameState();
  broadcast('reveal-start', {});
  // apos suspense, publica o resultado
  setTimeout(() => {
    db.gameState = 'revealed';
    save();
    broadcast('reveal-result', results);
    broadcastGameState();
  }, REVEAL_SUSPENSE_MS);
  res.json({ ok: true });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const keepCases = !!req.body?.keepCases;
  if (keepCases) {
    db.investments = [];
    db.sessions = {};
    db.teams = [];
    db.gameState = 'presenting';
  } else {
    db = { ...emptyDb(), startingBalance: db.startingBalance };
  }
  save();
  broadcast('reset', {});
  broadcastGameState();
  res.json({ ok: true });
});

// ---------- SSE ----------

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(': ok\n\n');
  sseClients.add(res);
  const iv = setInterval(() => {
    try { res.write(': ping\n\n'); } catch {}
  }, 20000);
  req.on('close', () => {
    clearInterval(iv);
    sseClients.delete(res);
  });
});

// ---------- auto-finalize periodico (garante que timers vencidos fecham) ----------

setInterval(() => {
  if (db.gameState !== 'investing') return;
  const now = Date.now();
  let changed = false;
  for (const t of db.teams) {
    if (!isRoundParticipant(t) || t.finalizedAt) continue;
    if ((now - t.investingStartedAt) > (INVEST_WINDOW_MS + INVEST_SLACK_MS)) {
      t.finalizedAt = now;
      changed = true;
      broadcast('team-finalized', {
        teamId: t.id,
        name: t.name,
        area: t.area,
        ...participantsSummary(),
      });
    }
  }
  if (changed) {
    save();
    broadcastGameState();
  }
}, 2000);

// ---------- rotas ----------

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/telao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'telao.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Páginas dos diretores — servem director.html; o frontend lê o codename da URL
app.get(['/claudia', '/felipe', '/ia'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'director.html'));
});

app.listen(PORT, () => {
  console.log(`Shanktrix Bank rodando na porta ${PORT}`);
  console.log(`  App:   /`);
  console.log(`  Telao: /telao`);
  console.log(`  Admin: /admin`);
});
