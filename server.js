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
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE || 50000);

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ---------- storage ----------

function emptyDb() {
  return {
    users: [],
    sessions: {},
    cases: [],
    investments: [],
    areas: [],              // catalogo enviado pelo telao
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

// ---------- auth ----------

function currentUser(req) {
  const sid = req.cookies?.sid;
  if (!sid) return null;
  const userId = db.sessions[sid];
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) || null;
}

function requireUser(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'not_authenticated' });
  req.user = u;
  next();
}

function requireAdmin(req, res, next) {
  if (req.cookies?.admin !== hash(ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'admin_required' });
  }
  next();
}

app.post('/api/register', (req, res) => {
  const rawName = String(req.body?.name || '').trim();
  const pin = String(req.body?.pin || '').trim();
  if (!rawName || rawName.length < 2 || rawName.length > 24) {
    return res.status(400).json({ error: 'nome_invalido' });
  }
  if (!/^\d{4,6}$/.test(pin)) {
    return res.status(400).json({ error: 'pin_invalido' });
  }
  const name = rawName;
  const key = name.toLowerCase();
  if (db.users.some((u) => u.name.toLowerCase() === key)) {
    return res.status(409).json({ error: 'nome_ja_existe' });
  }
  const user = {
    id: newId(),
    name,
    pinHash: hash(pin),
    balance: db.startingBalance,
    createdAt: Date.now(),
  };
  db.users.push(user);
  const sid = newId() + newId();
  db.sessions[sid] = user.id;
  save();
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  broadcast('user', { id: user.id, name: user.name });
  res.json({ id: user.id, name: user.name, balance: user.balance });
});

app.post('/api/login', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const pin = String(req.body?.pin || '').trim();
  const user = db.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!user || user.pinHash !== hash(pin)) {
    return res.status(401).json({ error: 'credenciais_invalidas' });
  }
  const sid = newId() + newId();
  db.sessions[sid] = user.id;
  save();
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
  res.json({ id: user.id, name: user.name, balance: user.balance });
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
  const u = currentUser(req);
  if (!u) return res.json({ user: null });
  res.json({
    user: { id: u.id, name: u.name, balance: u.balance },
    startingBalance: db.startingBalance,
  });
});

// ---------- cases / investments ----------

function publicCase(c) {
  const invs = db.investments.filter((i) => i.caseId === c.id);
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
    totalRaised: invs.reduce((s, i) => s + i.amount, 0),
    investorCount: new Set(invs.map((i) => i.userId)).size,
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

app.get('/api/cases/:id/feed', (req, res) => {
  const invs = db.investments
    .filter((i) => i.caseId === req.params.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 30)
    .map((i) => {
      const user = db.users.find((u) => u.id === i.userId);
      return {
        id: i.id,
        amount: i.amount,
        createdAt: i.createdAt,
        userName: user?.name || '???',
      };
    });
  res.json({ investments: invs });
});

app.get('/api/cases/:id/investments', requireUser, (req, res) => {
  const invs = db.investments
    .filter((i) => i.caseId === req.params.id)
    .map((i) => {
      const user = db.users.find((u) => u.id === i.userId);
      return {
        id: i.id,
        amount: i.amount,
        payout: i.payout ?? null,
        createdAt: i.createdAt,
        userName: user?.name || '???',
        isMine: i.userId === req.user.id,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  res.json({ investments: invs });
});

app.post('/api/cases/:id/invest', requireUser, (req, res) => {
  const c = db.cases.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'caso_nao_encontrado' });
  if (c.status !== 'open') return res.status(400).json({ error: 'caso_fechado' });
  const amount = Math.floor(Number(req.body?.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'valor_invalido' });
  }
  if (amount > req.user.balance) {
    return res.status(400).json({ error: 'saldo_insuficiente' });
  }
  req.user.balance -= amount;
  const inv = {
    id: newId(),
    userId: req.user.id,
    caseId: c.id,
    amount,
    payout: null,
    createdAt: Date.now(),
  };
  db.investments.push(inv);
  save();
  broadcast('investment', { caseId: c.id, userName: req.user.name, amount });
  res.json({ ok: true, balance: req.user.balance, investment: inv });
});

app.get('/api/investments/mine', requireUser, (req, res) => {
  const invs = db.investments
    .filter((i) => i.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((i) => {
      const c = db.cases.find((x) => x.id === i.caseId);
      return {
        id: i.id,
        amount: i.amount,
        payout: i.payout ?? null,
        createdAt: i.createdAt,
        caseId: i.caseId,
        caseNome: c?.nome || 'Case removido',
        caseArea: c?.area || '',
        caseStatus: c?.status || 'unknown',
      };
    });
  res.json({ investments: invs });
});

app.get('/api/ranking', (req, res) => {
  const list = db.users
    .map((u) => ({ id: u.id, name: u.name, balance: u.balance }))
    .sort((a, b) => b.balance - a.balance);
  res.json({ ranking: list });
});

// ---------- integracao com o telao ----------

// telaoKey = identificador unico do case baseado em area + nome
function telaoKey(area, nome) {
  return String(area).trim() + '::' + String(nome).trim();
}

// telao envia o catalogo completo (AREAS) 1x no boot
app.post('/api/telao/areas', (req, res) => {
  const areas = Array.isArray(req.body?.areas) ? req.body.areas : [];
  db.areas = areas;
  save();
  res.json({ ok: true, count: areas.length });
});

// telao envia o estado do sorteio a cada mudanca
// results: [{ area: "STRATEGY", caso: { nome, autor, desafio, ... } }]
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
      createdAt: Date.now() + idx, // preserva ordem mesmo em batch
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
  for (const u of db.users) u.balance = db.startingBalance;
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
  for (const inv of db.investments.filter((i) => i.caseId === c.id)) {
    const payout = Math.floor(inv.amount * multiplier);
    inv.payout = payout;
    const u = db.users.find((x) => x.id === inv.userId);
    if (u) u.balance += payout;
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
  for (const inv of db.investments.filter((i) => i.caseId === c.id)) {
    const u = db.users.find((x) => x.id === inv.userId);
    if (u) u.balance += inv.amount;
  }
  db.investments = db.investments.filter((i) => i.caseId !== c.id);
  db.cases.splice(idx, 1);
  save();
  broadcast('case-removed', { id: c.id });
  res.json({ ok: true });
});

app.get('/api/admin/state', requireAdmin, (req, res) => {
  res.json({
    users: db.users.map((u) => ({ id: u.id, name: u.name, balance: u.balance })),
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
  const keepUsers = !!req.body?.keepUsers;
  if (keepUsers) {
    for (const u of db.users) u.balance = db.startingBalance;
    db.cases = [];
    db.investments = [];
  } else {
    db = { ...emptyDb(), startingBalance: db.startingBalance };
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
  console.log(`Shark Tank Matrix Bank rodando na porta ${PORT}`);
  console.log(`Admin: /admin  (senha: ${ADMIN_PASSWORD === 'shark' ? 'shark (padrao)' : 'via env'})`);
  console.log(`Telao: /telao`);
});
