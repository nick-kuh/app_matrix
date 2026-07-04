/* ============================================================
   SHARK TANK BANK — mobile
   - Login = escolher time (sem cadastro)
   - Investe estilo PIX (teclado + chips rápidos + comprovante)
   - Pode RETIRAR investimento enquanto o case tá aberto
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const fmtMoney = (n) => '$ ' + Number(n || 0).toLocaleString('pt-BR');
const fmtCompact = (n) => {
  const v = Math.abs(Number(n || 0));
  const sign = n < 0 ? '-' : '';
  if (v >= 1_000_000) return sign + '$ ' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return sign + '$ ' + (v / 1_000).toFixed(1) + 'K';
  return sign + '$ ' + v;
};

const api = async (path, opts = {}) => {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'erro'), { data, status: res.status });
  return data;
};

function toast(msg, type = 'ok') {
  const host = $('#toast-host');
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let state = {
  team: null,
  cases: [],
  currentCaseId: null,
  positions: [], // [{caseId, position}]
};

/* ---------------- TEAM PICKER ---------------- */
async function loadTeams() {
  try {
    const d = await api('/api/teams');
    const box = $('#team-list');
    if (!d.teams.length) {
      box.innerHTML = '<div class="empty">Nenhum time disponível.</div>';
      return;
    }
    box.innerHTML = d.teams.map((t) => `
      <button class="team-card" data-name="${escapeHtml(t.name)}">
        <span class="team-icon">◈</span>
        <span class="team-info">
          <span class="n">${escapeHtml(t.name)}</span>
          <span class="b">saldo: ${fmtMoney(t.balance)}</span>
        </span>
        <span class="team-enter">&gt;</span>
      </button>
    `).join('');
    box.querySelectorAll('.team-card').forEach((btn) => {
      btn.addEventListener('click', () => pickTeam(btn.dataset.name));
    });
  } catch (e) {
    $('#team-list').innerHTML = '<div class="empty">Erro ao carregar times.</div>';
  }
}

async function pickTeam(name) {
  try {
    const data = await api('/api/team-login', { method: 'POST', body: { name } });
    state.team = data;
    onLogin();
  } catch (e) {
    toast('Não foi possível entrar no time', 'error');
  }
}

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

/* ---------------- TABS ---------------- */
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    if (tab === 'wallet') loadMyStuff();
    if (tab === 'rank') loadRanking();
  });
});

/* ---------------- RENDER ---------------- */
function renderTeam() {
  if (!state.team) return;
  $('#team-name').textContent = '@' + state.team.name;
  $('#team-balance').textContent = fmtMoney(state.team.balance);
}

function myPositionIn(caseId) {
  const p = state.positions.find((x) => x.caseId === caseId);
  return p ? p.position : 0;
}

function currentCase() {
  return state.cases.find((c) => c.id === state.currentCaseId) || null;
}

function renderCaseStrip() {
  const strip = $('#case-strip');
  strip.innerHTML = '';
  $('#case-count').textContent = state.cases.length;

  if (state.cases.length === 0) {
    strip.innerHTML =
      '<div style="padding:8px;font-size:11px;color:var(--matrix-green-dim);letter-spacing:0.15em;">nenhum revelado ainda_</div>';
    return;
  }

  for (const c of state.cases) {
    const chip = document.createElement('div');
    chip.className = 'case-chip' + (c.id === state.currentCaseId ? ' active' : '');
    const invested = myPositionIn(c.id);
    const kicker = 'USE CASE ' + String(c.pos || (state.cases.indexOf(c) + 1)).padStart(2, '0') +
      ' | ' + escapeHtml(c.area || 'AREA');
    const statusTxt = c.status === 'open' ? 'AO VIVO' : 'FIM';
    const statusCls = c.status === 'open' ? '' : 'closed';
    const invBadge = invested > 0
      ? `<span class="chip-invested">${fmtCompact(invested)}</span>`
      : `<span class="chip-invested" style="color:var(--matrix-green-dim);">sem posição</span>`;
    chip.innerHTML = `
      <div class="chip-kicker">${kicker}</div>
      <div class="chip-nome">${escapeHtml(c.nome)}</div>
      <div class="chip-meta">
        ${invBadge}
        <span class="chip-status ${statusCls}">${statusTxt}</span>
      </div>
    `;
    chip.addEventListener('click', () => selectCase(c.id));
    strip.appendChild(chip);
  }
}

function selectCase(id) {
  state.currentCaseId = id;
  renderCaseStrip();
  renderCaseView();
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'case'));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-case'));
  loadCaseFeed(id);
}

function renderCaseView() {
  const c = currentCase();
  const view = $('#case-view');
  if (!c) {
    view.innerHTML = `
      <div class="waiting-panel">
        <div class="w-status">&gt; STATUS</div>
        <div class="w-blink">AGUARDANDO CASE_</div>
        <div class="w-hint">o telão vai sortear o próximo pitch a qualquer momento</div>
      </div>
    `;
    return;
  }

  const isOpen = c.status === 'open';
  const kicker = 'USE CASE ' + String(c.pos).padStart(2, '0') + ' <span class="sep">|</span> ' + escapeHtml(c.area);
  const statusTag = isOpen
    ? '<span class="status-tag">AO VIVO</span>'
    : '<span class="status-tag closed">ENCERRADO</span>';
  const pos = myPositionIn(c.id);

  const positionBadge = pos > 0 ? `
    <div class="position-badge">
      <span class="l">Posição do time</span>
      <span class="v">${fmtMoney(pos)}</span>
    </div>
  ` : '';

  const actionRow = isOpen ? `
    <div class="action-row">
      <button class="btn" id="btn-invest">&gt; INVESTIR</button>
      <button class="btn ghost" id="btn-withdraw" ${pos > 0 ? '' : 'disabled'}>&gt; RETIRAR</button>
    </div>
  ` : renderResultBlock(c, pos);

  view.innerHTML = `
    <div class="panel">
      <div class="case-kicker-row">
        <div>${kicker}</div>
        ${statusTag}
      </div>
      <div class="case-nome">${escapeHtml(c.nome)}</div>
      ${c.autor || c.duracao ? `<div class="case-autor">${escapeHtml(c.autor + (c.duracao ? ' · ' + c.duracao : ''))}</div>` : ''}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px;">
        <div style="border:1px solid var(--matrix-green-dark);padding:8px 10px;background:rgba(0,8,2,0.7);">
          <div style="font-size:9px;letter-spacing:0.25em;color:var(--matrix-green-dim);text-transform:uppercase;">Total no case</div>
          <div style="font-size:15px;color:var(--matrix-green);font-variant-numeric:tabular-nums;margin-top:2px;">${fmtMoney(c.netInvested || 0)}</div>
        </div>
        <div style="border:1px solid var(--matrix-green-dark);padding:8px 10px;background:rgba(0,8,2,0.7);">
          <div style="font-size:9px;letter-spacing:0.25em;color:var(--matrix-green-dim);text-transform:uppercase;">Times investindo</div>
          <div style="font-size:15px;color:var(--matrix-green);font-variant-numeric:tabular-nums;margin-top:2px;">${c.investorCount || 0}</div>
        </div>
      </div>

      ${positionBadge}
      ${actionRow}
    </div>

    <div class="section-title">&gt; posições dos times neste case</div>
    <div class="panel">
      <div id="case-feed">
        <div class="empty">Carregando...</div>
      </div>
    </div>
  `;

  if (isOpen) {
    $('#btn-invest').addEventListener('click', () => openPix('invest', c));
    const wBtn = $('#btn-withdraw');
    if (wBtn) wBtn.addEventListener('click', () => openPix('withdraw', c));
  }
}

function renderResultBlock(c, pos) {
  const m = c.multiplier ?? 0;
  const payout = Math.floor(pos * m);
  const diff = payout - pos;
  let note = '';
  if (m >= 3) note = 'JACKPOT! ' + m.toFixed(1) + 'x';
  else if (m >= 2) note = 'Ótimo negócio — dobrou (ou mais)';
  else if (m > 1) note = 'Retorno positivo';
  else if (m === 1) note = 'Empatou';
  else if (m > 0) note = 'Prejuízo — retorno parcial';
  else note = 'Empresa quebrou — perde tudo';

  const myLine = pos > 0
    ? `<div style="margin-top:8px;font-size:12px;line-height:1.6;">
        Investiu <span style="color:var(--matrix-green);font-variant-numeric:tabular-nums;">${fmtMoney(pos)}</span>
        e recebeu <span style="color:${diff >= 0 ? 'var(--matrix-green)' : 'var(--matrix-red)'};font-variant-numeric:tabular-nums;">${fmtMoney(payout)}</span>
        (${diff >= 0 ? '+' : ''}${fmtMoney(diff)})
      </div>`
    : '<div style="margin-top:8px;font-size:12px;color:var(--matrix-green-dim);">Seu time não investiu neste case.</div>';

  return `
    <div class="closed-result">
      <div class="l">&gt; resultado</div>
      <div class="multi">${m.toFixed(2)}x</div>
      <div class="note">${note}</div>
      ${myLine}
    </div>
  `;
}

/* ---------------- PIX MODAL ---------------- */
let pixMode = 'invest';
let pixAmount = 0;
let pixCase = null;
let pixMaxAvailable = 0;

const pixModal = $('#pix-modal');
const pixAmountEl = $('#pix-amount');
const pixBalanceLabel = $('#pix-balance-l');
const pixBalanceValue = $('#pix-balance-v');
const pixKicker = $('#pix-kicker');
const pixTarget = $('#pix-target');
const pixConfirm = $('#pix-confirm');

function openPix(mode, c) {
  pixMode = mode;
  pixCase = c;
  pixAmount = 0;

  if (mode === 'invest') {
    pixMaxAvailable = state.team.balance;
    pixKicker.textContent = '> INVESTIR EM';
    pixConfirm.textContent = '> CONFIRMAR INVESTIMENTO';
    pixConfirm.classList.remove('danger');
    pixBalanceLabel.textContent = 'Saldo do time';
    pixBalanceValue.textContent = fmtMoney(state.team.balance);
  } else {
    pixMaxAvailable = myPositionIn(c.id);
    pixKicker.textContent = '> RETIRAR DE';
    pixConfirm.textContent = '> CONFIRMAR RETIRADA';
    pixConfirm.classList.add('danger');
    pixBalanceLabel.textContent = 'Posição atual';
    pixBalanceValue.textContent = fmtMoney(pixMaxAvailable);
  }

  pixTarget.innerHTML = `${escapeHtml(c.nome)}<br/><span style="font-size:11px;color:var(--matrix-green-dim);letter-spacing:0.2em;">${escapeHtml(c.area)}</span>`;
  renderPixAmount();
  pixModal.style.display = 'flex';
}

function closePix() {
  pixModal.style.display = 'none';
  pixAmount = 0;
}

function renderPixAmount() {
  pixAmountEl.textContent = fmtMoney(pixAmount);
  const over = pixAmount > pixMaxAvailable;
  pixAmountEl.classList.toggle('over', over);
  pixConfirm.disabled = pixAmount <= 0 || over;
}

$('#pix-close').addEventListener('click', closePix);
pixModal.addEventListener('click', (e) => { if (e.target === pixModal) closePix(); });

// teclado numérico
$$('#pix-modal .pix-pad button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    if (k === 'del') {
      pixAmount = Math.floor(pixAmount / 10);
    } else if (k === '000') {
      pixAmount = pixAmount * 1000;
    } else {
      pixAmount = pixAmount * 10 + Number(k);
    }
    if (pixAmount > 999_999_999) pixAmount = 999_999_999;
    renderPixAmount();
  });
});

// chips rápidos
$$('#pix-quick .chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.max) { pixAmount = pixMaxAvailable; renderPixAmount(); return; }
    const add = Number(btn.dataset.q);
    pixAmount = Math.min(pixAmount + add, pixMaxAvailable);
    renderPixAmount();
  });
});

pixConfirm.addEventListener('click', async () => {
  if (pixAmount <= 0 || pixAmount > pixMaxAvailable) return;
  const url = pixMode === 'invest'
    ? `/api/cases/${pixCase.id}/invest`
    : `/api/cases/${pixCase.id}/withdraw`;
  try {
    pixConfirm.disabled = true;
    pixConfirm.textContent = '> processando...';
    const res = await api(url, { method: 'POST', body: { amount: pixAmount } });
    state.team.balance = res.balance;
    // atualiza posicoes local
    const p = state.positions.find((x) => x.caseId === pixCase.id);
    if (p) p.position = res.position;
    else state.positions.push({ caseId: pixCase.id, position: res.position });

    closePix();
    showReceipt(pixMode, pixAmount, pixCase);
    renderTeam();
    await refreshCases({ keepCurrent: true });
    loadCaseFeed(pixCase.id);
  } catch (e) {
    const map = {
      saldo_insuficiente: 'Saldo insuficiente',
      valor_maior_que_posicao: 'Valor maior que a posição',
      caso_fechado: 'Case já foi encerrado',
      valor_invalido: 'Valor inválido',
      sem_posicao: 'Sem posição pra retirar',
    };
    toast(map[e.data?.error] || 'Erro na transação', 'error');
    pixConfirm.disabled = false;
    pixConfirm.textContent = pixMode === 'invest' ? '> CONFIRMAR INVESTIMENTO' : '> CONFIRMAR RETIRADA';
  }
});

/* ---------------- RECEIPT ---------------- */
function showReceipt(mode, amount, c) {
  $('#receipt-title').textContent = mode === 'invest' ? 'INVESTIMENTO OK' : 'RETIRADA OK';
  $('#receipt-amount').textContent = (mode === 'invest' ? '- ' : '+ ') + fmtMoney(amount);
  $('#receipt-info').innerHTML = `${escapeHtml(c.nome)}<br/><span style="color:var(--matrix-green-dim);">${escapeHtml(c.area)}</span>`;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  $('#receipt-time').textContent = `${hh}:${mm}:${ss}`;
  $('#receipt').style.display = 'flex';
  setTimeout(() => { $('#receipt').style.display = 'none'; }, 1900);
}

/* ---------------- DATA LOADERS ---------------- */
async function refreshMe() {
  try {
    const d = await api('/api/me');
    if (!d.team) return null;
    state.team = d.team;
    renderTeam();
    return d.team;
  } catch { return null; }
}

async function refreshCases({ keepCurrent = false } = {}) {
  const d = await api('/api/cases');
  state.cases = d.cases;
  if (!keepCurrent || !state.currentCaseId || !state.cases.find((c) => c.id === state.currentCaseId)) {
    const open = [...state.cases].reverse().find((c) => c.status === 'open');
    state.currentCaseId = open?.id || state.cases[state.cases.length - 1]?.id || null;
  }
  renderCaseStrip();
  renderCaseView();
  if (state.currentCaseId) loadCaseFeed(state.currentCaseId);
}

async function loadCaseFeed(caseId) {
  try {
    const d = await api(`/api/cases/${caseId}/feed`);
    const box = $('#case-feed');
    if (!box) return;
    if (!d.positions.length) {
      box.innerHTML = '<div class="empty" style="padding:14px;">Nenhum time investiu ainda.</div>';
      return;
    }
    box.innerHTML = d.positions.map((p) => `
      <div class="feed-row">
        <span class="team ${p.teamId === state.team.id ? 'me' : ''}">${escapeHtml(p.teamName)}</span>
        <span class="amt">${fmtMoney(p.amount)}</span>
      </div>
    `).join('');
  } catch {}
}

async function loadMyStuff() {
  try {
    const d = await api('/api/investments/mine');
    state.positions = d.positions.map((p) => ({ caseId: p.caseId, position: p.position }));

    // posicoes por case (agregado)
    const posBox = $('#my-positions');
    const withPos = d.positions.filter((p) => p.position > 0 || p.payout > 0);
    if (!withPos.length) {
      posBox.innerHTML = '<div class="empty">Ainda sem posições.</div>';
    } else {
      posBox.innerHTML = withPos.map((p) => {
        const c = state.cases.find((x) => x.id === p.caseId);
        const isClosed = c?.status === 'closed';
        const payoutHtml = p.payout > 0 && isClosed
          ? `<div class="wr-payout ${p.payout > p.position ? 'win' : p.payout < p.position ? 'loss' : ''}">→ ${fmtMoney(p.payout)}</div>`
          : (isClosed ? '<div class="wr-payout loss">→ perdeu</div>' : '<div class="wr-payout">em aberto</div>');
        return `
          <div class="wallet-row">
            <div class="wr-left">
              <div class="wr-kicker">${escapeHtml(p.caseArea || 'AREA')}</div>
              <div class="wr-nome">${escapeHtml(p.caseNome)}</div>
            </div>
            <div class="wr-right">
              <div class="wr-amt">${fmtMoney(p.position)}</div>
              ${payoutHtml}
            </div>
          </div>
        `;
      }).join('');
    }

    // extrato (todas as transacoes)
    const trBox = $('#my-transactions');
    if (!d.transactions.length) {
      trBox.innerHTML = '<div class="empty">Sem movimentações.</div>';
    } else {
      trBox.innerHTML = d.transactions.slice(0, 30).map((t) => {
        const isWithdraw = t.amount < 0;
        const isPayout = t.payout != null && t.amount === 0;
        const sign = isWithdraw || isPayout ? '+' : '-';
        const val = isPayout ? t.payout : Math.abs(t.amount);
        const label = isPayout ? 'PAYOUT' : (isWithdraw ? 'RETIRADA' : 'INVESTIMENTO');
        const time = new Date(t.createdAt);
        const hh = String(time.getHours()).padStart(2, '0');
        const mm = String(time.getMinutes()).padStart(2, '0');
        return `
          <div class="inv-row">
            <span class="who">
              <span style="font-size:9px;letter-spacing:0.2em;color:var(--matrix-green-dim);">${hh}:${mm} · ${label}</span><br/>
              ${escapeHtml(t.caseNome)}
            </span>
            <span class="amt" style="color:${sign === '+' ? 'var(--matrix-green)' : 'var(--matrix-red)'};">${sign}${fmtMoney(val)}</span>
          </div>
        `;
      }).join('');
    }

    renderCaseStrip();
  } catch {}
}

async function loadRanking() {
  try {
    const d = await api('/api/ranking');
    const box = $('#rank-list');
    if (!d.ranking.length) {
      box.innerHTML = '<div class="empty">Sem times.</div>';
      return;
    }
    box.innerHTML = d.ranking.map((t, i) => `
      <div class="rank-row ${i === 0 ? 'top' : ''} ${t.id === state.team?.id ? 'me' : ''}">
        <div class="rank-pos">${i + 1}</div>
        <div class="rank-name">${escapeHtml(t.name)}</div>
        <div class="rank-bal">${fmtMoney(t.balance)}</div>
      </div>
    `).join('');
  } catch {}
}

/* ---------------- SSE ---------------- */
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('case-created', async (e) => {
    const c = JSON.parse(e.data);
    toast('> novo case: ' + c.nome);
    await refreshCases();
  });
  es.addEventListener('case-closed', async () => {
    toast('> case encerrado');
    await refreshCases({ keepCurrent: true });
    await refreshMe();
    await loadMyStuff();
  });
  es.addEventListener('case-removed', async () => {
    await refreshCases();
    await refreshMe();
  });
  es.addEventListener('investment', async (e) => {
    const data = JSON.parse(e.data);
    if (data.caseId === state.currentCaseId) {
      await refreshCases({ keepCurrent: true });
      loadCaseFeed(data.caseId);
    }
  });
  es.addEventListener('reset', async () => {
    toast('> sistema resetado');
    await refreshMe();
    await refreshCases();
    await loadMyStuff();
  });
  es.onerror = () => {};
}

/* ---------------- BOOT ---------------- */
async function onLogin() {
  $('#pick-team').style.display = 'none';
  $('#app').style.display = 'flex';
  renderTeam();
  await loadMyStuff();
  await refreshCases();
  connectEvents();
}

(async function boot() {
  const me = await refreshMe();
  if (me) {
    onLogin();
  } else {
    loadTeams();
  }
})();
