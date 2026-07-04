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

// Times pre-cadastrados (mesmas areas do sorteio do telao)
const DEFAULT_TEAMS = [
  'STRATEGY',
  'DATAHUB',
  'FOCUS MARKET',
  'CUSTOMER DEVELOPMENT',
  'CONSUMER',
  'BUSINESS OPERATIONS (MAKE)',
];

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ---------- storage ----------

function emptyDb() {
  return {
    teams: [],        // [{id, name (area em maiusculo), balance, createdAt}]
    sessions: {},     // { sid: teamId }
    cases: [],
    investments: [],  // [{id, teamId, caseId, amount, payout, createdAt}] — 1 registro por transacao (invest + / withdraw -)
    areas: [],
    startingBalance: STARTING_BALANCE,
  };
}

let db = emptyDb();

if (existsSync(DATA_FILE)) {
  try {
    db = { ...emptyDb(), ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
  } catch (e) {
    console.error('data.json corrompido, recomeçando', e);
    db = emptyDb();
  }
}

// Garante que os times default existem
function ensureTeams() {
  for (const name of DEFAULT_TEAMS) {
    if (!db.teams.find((t) => t.name === name)) {
      db.teams.push({
        id: newId(),
        name,
        balance: db.startingBalance,
        createdAt: Date.now(),
      });
    }
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

ensureTeams();
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
app.use(express.json({ limit: '512kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- auth (team-based) ----------

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

// Retorna a lista de times (usada no picker do mobile)
app.get('/api/teams', (req, res) => {
  const list = db.teams.map((t) => ({
    id: t.id,
    name: t.name,
    balance: t.balance,
  }));
  res.json({ teams: list });
});

// Entrar como um time (sem senha, pelo nome da area)
app.post('/api/team-login', (req, res) => {
  const name = String(req.body?.name || '').trim().toUpperCase();
  const team = db.teams.find((t) => t.name.toUpperCase() === name);
  if (!team) return res.status(404).json({ error: 'time_nao_encontrado' });

  const sid = newId() + newId();
  db.sessions[sid] = team.id;
  save();
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ id: team.id, name: team.name, balance: team.balance });
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
    team: { id: t.id, name: t.name, balance: t.balance },
    startingBalance: db.startingBalance,
  });
});

// ---------- helpers ----------

// posicao liquida do time em um case (soma investimentos - retiradas)
function teamPositionInCase(teamId, caseId) {
  return db.investments
    .filter((i) => i.teamId === teamId && i.caseId === caseId)
    .reduce((s, i) => s + i.amount, 0);
}

// ---------- cases ----------

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
    multiplier: c.multiplier ?? null,
    createdAt: c.createdAt,
    resolvedAt: c.resolvedAt ?? null,
    totalRaised,        // soma bruta de todos os aportes (histórico)
    netInvested: netTotal, // total liquido investido no case agora
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

// feed publico do case: mostra as posicoes liquidas por time (sem individuais)
app.get('/api/cases/:id/feed', (req, res) => {
  const invs = db.investments.filter((i) => i.caseId === req.params.id);
  const byTeam = new Map();
  for (const i of invs) {
    const cur = byTeam.get(i.teamId) || { amount: 0, lastAt: 0 };
    cur.amount += i.amount;
    cur.lastAt = Math.max(cur.lastAt, i.createdAt);
    byTeam.set(i.teamId, cur);
  }
  const rows = [...byTeam.entries()]
    .filter(([, v]) => v.amount > 0)
    .map(([teamId, v]) => {
      const team = db.teams.find((t) => t.id === teamId);
      return {
        teamId,
        teamName: team?.name || '???',
        amount: v.amount,
        lastAt: v.lastAt,
      };
    })
    .sort((a, b) => b.amount - a.amount);
  res.json({ positions: rows });
});

// Investir (aporte)
app.post('/api/cases/:id/invest', requireTeam, (req, res) => {
  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'caso_nao_encontrado' });
  if (c.status !== 'open') return res.status(400).json({ error: 'caso_fechado' });
  const amount = Math.floor(Number(req.body?.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'valor_invalido' });
  }
  if (amount > req.team.balance) {
    return res.status(400).json({ error: 'saldo_insuficiente' });
  }
  req.team.balance -= amount;
  const inv = {
    id: newId(),
    teamId: req.team.id,
    caseId: c.id,
    amount,           // positivo = aporte
    payout: null,
    createdAt: Date.now(),
  };
  db.investments.push(inv);
  save();
  broadcast('investment', {
    caseId: c.id,
    teamId: req.team.id,
    teamName: req.team.name,
    amount,
    action: 'invest',
  });
  res.json({
    ok: true,
    balance: req.team.balance,
    position: teamPositionInCase(req.team.id, c.id),
  });
});

// Retirar (parcial ou total)
app.post('/api/cases/:id/withdraw', requireTeam, (req, res) => {
  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'caso_nao_encontrado' });
  if (c.status !== 'open') return res.status(400).json({ error: 'caso_fechado' });
  const amountRaw = req.body?.amount;
  const isAll = amountRaw === 'all' || amountRaw === undefined;
  const current = teamPositionInCase(req.team.id, c.id);
  if (current <= 0) return res.status(400).json({ error: 'sem_posicao' });

  const amount = isAll ? current : Math.floor(Number(amountRaw));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'valor_invalido' });
  }
  if (amount > current) return res.status(400).json({ error: 'valor_maior_que_posicao' });

  req.team.balance += amount;
  db.investments.push({
    id: newId(),
    teamId: req.team.id,
    caseId: c.id,
    amount: -amount,  // negativo = retirada
    payout: null,
    createdAt: Date.now(),
  });
  save();
  broadcast('investment', {
    caseId: c.id,
    teamId: req.team.id,
    teamName: req.team.name,
    amount,
    action: 'withdraw',
  });
  res.json({
    ok: true,
    balance: req.team.balance,
    position: teamPositionInCase(req.team.id, c.id),
  });
});

// Historico do meu time
app.get('/api/investments/mine', requireTeam, (req, res) => {
  const invs = db.investments
    .filter((i) => i.teamId === req.team.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((i) => {
      const c = db.cases.find((x) => x.id === i.caseId);
      return {
        id: i.id,
        amount: i.amount,        // pode ser negativo (retirada)
        payout: i.payout ?? null,
        createdAt: i.createdAt,
        caseId: i.caseId,
        caseNome: c?.nome || 'Case removido',
        caseArea: c?.area || '',
        caseStatus: c?.status || 'unknown',
      };
    });

  // agrega tambem por case (posicao liquida)
  const byCase = new Map();
  for (const inv of invs) {
    const cur = byCase.get(inv.caseId) || { caseId: inv.caseId, caseNome: inv.caseNome, caseArea: inv.caseArea, caseStatus: inv.caseStatus, position: 0, payout: 0 };
    cur.position += inv.amount;
    if (inv.payout != null) cur.payout += inv.payout;
    byCase.set(inv.caseId, cur);
  }
  const positions = [...byCase.values()];

  res.json({ transactions: invs, positions });
});

app.get('/api/ranking', (req, res) => {
  const list = db.teams
    .map((t) => ({ id: t.id, name: t.name, balance: t.balance }))
    .sort((a, b) => b.balance - a.balance);
  res.json({ ranking: list });
});

// ---------- integracao com o telao ----------

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
      multiplier: null,
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
  for (const t of db.teams) t.balance = db.startingBalance;
  save();
  broadcast('reset', {});
  res.json({ ok: true });
});

// ---------- admin ----------

app.post('/api/admin/login', (req, res) => {
  const pwd = String(req.body?.password || '');
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: 'senha_invalida' });
  res.cookie('admin', hash(ADMIN_PASSWORD), {
    httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin');
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  res.json({ isAdmin: req.cookies?.admin === hash(ADMIN_PASSWORD) });
});

app.post('/api/admin/cases/:id/close', requireAdmin, (req, res) => {
  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'nao_encontrado' });
  if (c.status !== 'open') return res.status(400).json({ error: 'ja_fechado' });
  const multiplier = Number(req.body?.multiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    return res.status(400).json({ error: 'multiplicador_invalido' });
  }
  c.status = 'closed';
  c.multiplier = multiplier;
  c.resolvedAt = Date.now();

  // paga cada time proporcional à posicao liquida
  const positions = new Map();
  for (const inv of db.investments.filter((i) => i.caseId === c.id)) {
    positions.set(inv.teamId, (positions.get(inv.teamId) || 0) + inv.amount);
  }
  for (const [teamId, pos] of positions.entries()) {
    if (pos <= 0) continue;
    const payout = Math.floor(pos * multiplier);
    const team = db.teams.find((t) => t.id === teamId);
    if (!team) continue;
    team.balance += payout;
    // marca no ultimo aporte positivo deste time como payout consolidado
    // (mais simples: cria uma "transacao" de payout separada)
    db.investments.push({
      id: newId(),
      teamId,
      caseId: c.id,
      amount: 0,
      payout,
      createdAt: Date.now() + 1,
      isPayout: true,
      basePosition: pos,
    });
  }

  save();
  const pc = publicCase(c);
  broadcast('case-closed', pc);
  res.json({ case: pc });
});

app.delete('/api/admin/cases/:id', requireAdmin, (req, res) => {
  const idx = db.cases.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'nao_encontrado' });
  const c = db.cases[idx];
  if (c.status === 'closed') {
    return res.status(400).json({ error: 'nao_pode_apagar_fechado' });
  }
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
  res.json({
    teams: db.teams.map((t) => ({ id: t.id, name: t.name, balance: t.balance })),
    cases: db.cases.map(publicCase),
    startingBalance: db.startingBalance,
  });
});

app.post('/api/admin/starting-balance', requireAdmin, (req, res) => {
  const v = Math.floor(Number(req.body?.value || 0));
  if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'invalido' });
  db.startingBalance = v;
  save();
  res.json({ startingBalance: db.startingBalance });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  const keepTeams = !!req.body?.keepTeams;
  if (keepTeams) {
    for (const t of db.teams) t.balance = db.startingBalance;
    db.cases = [];
    db.investments = [];
  } else {
    db = { ...emptyDb(), startingBalance: db.startingBalance };
    ensureTeams();
  }
  save();
  broadcast('reset', {});
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

// ---------- routes ----------

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/telao', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'telao.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Shark Tank Bank rodando na porta ${PORT}`);
  console.log(`  App:   /`);
  console.log(`  Telao: /telao`);
  console.log(`  Admin: /admin`);
});
