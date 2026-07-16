/* ============================================================
   SHARK TANK BANK — mobile
   - Login = nome + área (participante recebe $500k)
   - Timer individual de 90s por jogador
   - Fases: presenting | investing | revealing | revealed
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
  const url = path + (path.includes('?') ? '&' : '?') + 't=' + Date.now();
  const res = await fetch(url, {
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

const IS_DIRECTOR_MODE = !!window.DIRECTOR_CODENAME;

let state = {
  team: null,
  cases: [],
  currentCaseId: null,
  positions: [],
  gameState: 'presenting',
  participantsTotal: 0,
  participantsFinalized: 0,
  investWindowMs: 90 * 1000,
  investingStartedAt: null,
  finalizedAt: null,
  areas: [],
  isDirector: false,
};

let sharkAnims = [];

/* ---------------- PHASE ROUTING ---------------- */

const PHASES = ['presenting', 'login', 'investing', 'waiting', 'revealing'];

function showPhase(phase) {
  for (const p of PHASES) {
    const el = document.getElementById('phase-' + p);
    if (el) el.style.display = 'none';
  }
  const target = document.getElementById('phase-' + phase);
  if (target) {
    target.style.display = (phase === 'investing') ? 'flex' : 'flex';
  }

  // para shark ascii, tocar em qualquer tela que use
  for (const a of sharkAnims) a.stop();
  sharkAnims = [];
  const asciiEl = target && target.querySelector && target.querySelector('.shark-ascii-block');
  if (asciiEl && window.animateShark) sharkAnims.push(window.animateShark(asciiEl, 110));
}

function routeByGameState() {
  const gs = state.gameState;
  if (gs === 'revealing' || gs === 'revealed') {
    showPhase('revealing');
    updateRevealingCopy();
    return;
  }
  if (gs === 'presenting') {
    showPhase('presenting');
    return;
  }
  // investing
  if (!state.team) {
    showPhase('login');
    return;
  }
  if (state.finalizedAt) {
    showPhase('waiting');
    updateWaitingCounter();
    return;
  }
  showPhase('investing');
}

function updateRevealingCopy() {
  const blink = $('#revealing-blink');
  const hint = $('#revealing-hint');
  if (state.gameState === 'revealed') {
    if (blink) blink.textContent = 'VENCEDOR REVELADO_';
    if (hint) hint.textContent = 'o resultado está no telão. obrigado por investir.';
  } else {
    if (blink) blink.textContent = 'DECODIFICANDO VENCEDOR_';
    if (hint) hint.textContent = 'o resultado aparece no telão. este dispositivo apenas espera.';
  }
}

function updateWaitingCounter() {
  const el = $('#waiting-counter');
  if (el) el.textContent = `${state.participantsFinalized} de ${state.participantsTotal} finalizaram`;
}

/* ---------------- LOGIN ---------------- */

async function loadAreas() {
  try {
    const d = await api('/api/areas');
    state.areas = d.areas || [];
    const select = $('#login-area');
    if (select) {
      // preserve first placeholder option
      const opts = ['<option value="">— selecione —</option>'];
      for (const a of state.areas) {
        opts.push(`<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`);
      }
      select.innerHTML = opts.join('');
    }
  } catch (e) {
    console.error('erro carregando areas', e);
  }
}

async function submitLogin() {
  const name = $('#login-name').value.trim();
  const area = $('#login-area').value.trim();
  const errEl = $('#login-err');
  errEl.textContent = '';

  if (!name) { errEl.textContent = '> informe seu nome'; return; }
  if (!area) { errEl.textContent = '> selecione sua área'; return; }

  try {
    const data = await api('/api/team-login', { method: 'POST', body: { name, area } });
    state.team = { id: data.id, name: data.name, area: data.area, balance: data.balance };
    state.investingStartedAt = data.investingStartedAt;
    state.finalizedAt = null;
    state.investWindowMs = data.investWindowMs || state.investWindowMs;
    state.isDirector = !!data.isDirector;
    await afterLogin();
  } catch (e) {
    const map = {
      fase_invalida: 'A rodada não está aberta agora.',
      nome_obrigatorio: 'Informe seu nome.',
      area_obrigatoria: 'Selecione uma área.',
      area_invalida: 'Área inválida.',
    };
    errEl.textContent = '> ' + (map[e.data?.error] || 'não foi possível entrar');
  }
}

async function submitDirectorLogin() {
  const errEl = $('#login-err');
  if (errEl) errEl.textContent = '';
  try {
    const data = await api('/api/director-login', {
      method: 'POST',
      body: { codename: window.DIRECTOR_CODENAME },
    });
    state.team = { id: data.id, name: data.name, area: data.area, balance: data.balance };
    state.investingStartedAt = data.investingStartedAt;
    state.finalizedAt = null;
    state.investWindowMs = data.investWindowMs || state.investWindowMs;
    state.isDirector = true;
    await afterLogin();
  } catch (e) {
    const map = {
      fase_invalida: 'A rodada ainda não abriu. Aguarde o admin.',
      diretor_invalido: 'Codename inválido.',
    };
    if (errEl) errEl.textContent = '> ' + (map[e.data?.error] || 'não foi possível entrar');
  }
}

async function afterLogin() {
  routeByGameState();
  renderTeam();
  await loadMyStuff();
  await fetchCases();
  startClientTimer();
}

/* ---------------- CRONÔMETRO (só informativo, sem limite) ----------------
   Mostra há quanto tempo o investidor está na bolsa. Ninguém é expulso por
   tempo: cada um aperta FINALIZAR quando terminar. */

let timerInterval = null;

function timerElapsedMs() {
  if (!state.investingStartedAt) return 0;
  return Math.max(0, Date.now() - state.investingStartedAt);
}

function fmtTimerMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(s / 60)).padStart(2, '0');
  const r = String(s % 60).padStart(2, '0');
  return m + ':' + r;
}

function renderTimer() {
  const disp = $('#timer-display');
  if (disp) disp.textContent = fmtTimerMs(timerElapsedMs());
}

function startClientTimer() {
  if (timerInterval) clearInterval(timerInterval);
  renderTimer();
  timerInterval = setInterval(renderTimer, 500);
}

function stopClientTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* Encerra a participação do investidor (ação manual do botão FINALIZAR) */
async function finalizeMyRound() {
  if (state.finalizedAt) return;
  state.finalizedAt = Date.now();
  stopClientTimer();
  try {
    await api('/api/finalize', { method: 'POST', body: {} });
  } catch (e) { /* backend vai revalidar */ }
  routeByGameState();
}

/* ---------------- LOGOUT ---------------- */

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

/* ---------------- FINALIZAR INVESTIMENTOS ---------------- */

$('#finish-early')?.addEventListener('click', () => {
  if (!confirm('Finalizar seus investimentos? Depois disso não dá mais pra investir.')) return;
  finalizeMyRound();
});

/* ---------------- TABS ---------------- */

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    if (tab === 'wallet') loadMyStuff();
  });
});

/* ---------------- RENDER ---------------- */

function renderTeam() {
  if (!state.team) return;
  const areaSuffix = state.team.area ? ` <span class="dim">(${escapeHtml(state.team.area)})</span>` : '';
  $('#team-name').innerHTML = '@' + escapeHtml(state.team.name) + areaSuffix;
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
  if (!strip) return;
  strip.innerHTML = '';
  const cnt = $('#case-count');
  if (cnt) cnt.textContent = state.cases.length;

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
}

function renderCaseView() {
  const c = currentCase();
  const view = $('#case-view');
  if (!view) return;
  if (!c) {
    view.innerHTML = `
      <div class="waiting-panel">
        <div class="w-status">&gt; STATUS</div>
        <div class="w-blink">AGUARDANDO CASE_</div>
        <div class="w-hint">selecione um dos cases apresentados acima pra investir</div>
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
      <span class="l">Sua posição</span>
      <span class="v">${fmtMoney(pos)}</span>
    </div>` : '';

  const isOwnArea = isMyOwnArea(c);
  const canInvest = isOpen && !isOwnArea && !state.finalizedAt;
  let blockLabel = 'ENCERRADO';
  if (isOpen) blockLabel = isOwnArea ? '⊘ CASE DA SUA ÁREA — BLOQUEADO' : 'VOCÊ JÁ FINALIZOU';
  const actionRow = canInvest ? `
    <div class="action-row" style="grid-template-columns: 1fr;">
      <button class="btn" id="btn-invest">&gt; INVESTIR</button>
    </div>
  ` : '<div class="action-row"><div class="btn ghost disabled">' + blockLabel + '</div></div>';

  view.innerHTML = `
    <div class="panel">
      <div class="case-kicker-row">
        <div>${kicker}</div>
        ${statusTag}
      </div>
      <div class="case-nome">${escapeHtml(c.nome)}</div>
      ${c.autor || c.duracao ? `<div class="case-autor">${escapeHtml(c.autor + (c.duracao ? ' · ' + c.duracao : ''))}</div>` : ''}

      ${positionBadge}
      ${actionRow}
    </div>
  `;

  if (canInvest) {
    const btn = $('#btn-invest');
    if (btn) btn.addEventListener('click', () => openPix('invest', c));
  }
}

// A pessoa não pode investir no case da própria área (regra do jogo)
function isMyOwnArea(c) {
  if (!state.team || !state.team.area || !c.area) return false;
  return String(c.area).trim().toUpperCase() === String(state.team.area).trim().toUpperCase();
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
  if (state.finalizedAt) {
    toast('Você já finalizou seus investimentos', 'error');
    return;
  }
  if (isMyOwnArea(c)) {
    toast('Você não pode investir no case da sua própria área', 'error');
    return;
  }
  pixMode = mode;
  pixCase = c;
  pixAmount = 0;
  pixMaxAvailable = state.team.balance;
  pixKicker.textContent = '> INVESTIR EM';
  pixConfirm.textContent = '> CONFIRMAR INVESTIMENTO';
  pixConfirm.classList.remove('danger');
  pixBalanceLabel.textContent = 'Saldo do investidor';
  pixBalanceValue.textContent = fmtMoney(state.team.balance);
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

$$('#pix-modal .pix-pad button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k;
    if (k === 'del') pixAmount = Math.floor(pixAmount / 10);
    else if (k === '000') pixAmount = pixAmount * 1000;
    else pixAmount = pixAmount * 10 + Number(k);
    if (pixAmount > 999_999_999) pixAmount = 999_999_999;
    renderPixAmount();
  });
});

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
  const url = `/api/cases/${pixCase.id}/invest`;
  try {
    pixConfirm.disabled = true;
    pixConfirm.textContent = '> processando...';
    const res = await api(url, { method: 'POST', body: { amount: pixAmount } });
    state.team.balance = res.balance;
    const p = state.positions.find((x) => x.caseId === pixCase.id);
    if (p) p.position = res.position;
    else state.positions.push({ caseId: pixCase.id, position: res.position });

    closePix();
    showReceipt('invest', pixAmount, pixCase);
    renderTeam();
    await fetchCases(true);
  } catch (e) {
    const map = {
      saldo_insuficiente: 'Saldo insuficiente',
      caso_fechado: 'Case já foi encerrado',
      valor_invalido: 'Valor inválido',
      rodada_fechada: 'Rodada fechada',
      tempo_esgotado: 'Seu tempo acabou',
      area_propria: 'Você não pode investir no case da sua própria área',
    };
    toast(map[e.data?.error] || 'Erro na transação', 'error');
    if (e.data?.error === 'tempo_esgotado') {
      state.finalizedAt = Date.now();
      routeByGameState();
    }
    pixConfirm.disabled = false;
    pixConfirm.textContent = '> CONFIRMAR INVESTIMENTO';
  }
});

/* ---------------- RECEIPT ---------------- */
function showReceipt(mode, amount, c) {
  $('#receipt-title').textContent = 'INVESTIMENTO OK';
  $('#receipt-amount').textContent = '- ' + fmtMoney(amount);
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
    state.investingStartedAt = d.team.investingStartedAt || null;
    state.finalizedAt = d.team.finalizedAt || null;
    state.investWindowMs = d.investWindowMs || state.investWindowMs;
    state.isDirector = !!d.team.isDirector;
    renderTeam();
    // atualiza preview do saldo do diretor com o valor real vindo do backend
    if (IS_DIRECTOR_MODE) {
      const preview = document.getElementById('director-balance-preview');
      if (preview && d.startingBalance) {
        preview.textContent = fmtMoney(d.startingBalance * 2);
      }
    }
    return d.team;
  } catch { return null; }
}

async function fetchGameState() {
  try {
    const d = await api('/api/game-state');
    state.gameState = d.state;
    state.participantsTotal = d.participantsTotal;
    state.participantsFinalized = d.participantsFinalized;
  } catch (e) { /* ignora */ }
}

async function fetchCases(keepCurrent = false) {
  try {
    const d = await api('/api/cases');
    state.cases = d.cases || [];

    if (!keepCurrent || !state.currentCaseId || !state.cases.find((c) => c.id === state.currentCaseId)) {
      const open = [...state.cases].reverse().find((c) => c.status === 'open');
      state.currentCaseId = open?.id || state.cases[state.cases.length - 1]?.id || null;
    }

    renderCaseStrip();
    renderCaseView();
  } catch (e) { console.error('erro cases', e); }
}

async function loadMyStuff() {
  try {
    const d = await api('/api/investments/mine');
    state.positions = d.positions.map((p) => ({ caseId: p.caseId, position: p.position }));

    const posBox = $('#my-positions');
    if (!posBox) return;
    const withPos = d.positions.filter((p) => p.position > 0);
    if (!withPos.length) {
      posBox.innerHTML = '<div class="empty">Ainda sem posições.</div>';
    } else {
      posBox.innerHTML = withPos.map((p) => {
        return `
          <div class="wallet-row">
            <div class="wr-left">
              <div class="wr-kicker">${escapeHtml(p.caseArea || 'AREA')}</div>
              <div class="wr-nome">${escapeHtml(p.caseNome)}</div>
            </div>
            <div class="wr-right">
              <div class="wr-amt">${fmtMoney(p.position)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    const trBox = $('#my-transactions');
    if (!d.transactions.length) {
      trBox.innerHTML = '<div class="empty">Sem movimentações.</div>';
    } else {
      trBox.innerHTML = d.transactions.slice(0, 30).map((t) => {
        const val = Math.abs(t.amount);
        const time = new Date(t.createdAt);
        const hh = String(time.getHours()).padStart(2, '0');
        const mm = String(time.getMinutes()).padStart(2, '0');
        return `
          <div class="inv-row">
            <span class="who">
              <span style="font-size:9px;letter-spacing:0.2em;color:var(--matrix-green-dim);">${hh}:${mm} · INVESTIMENTO</span><br/>
              ${escapeHtml(t.caseNome)}
            </span>
            <span class="amt" style="color:var(--matrix-red);">- ${fmtMoney(val)}</span>
          </div>
        `;
      }).join('');
    }

    renderCaseStrip();
  } catch {}
}

/* ---------------- SSE ---------------- */
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('open', async () => {
    await fetchGameState();
    if (state.team) await fetchCases(true);
    routeByGameState();
  });
  es.addEventListener('game-state', (e) => {
    const d = JSON.parse(e.data);
    state.gameState = d.state;
    state.participantsTotal = d.participantsTotal;
    state.participantsFinalized = d.participantsFinalized;
    updateWaitingCounter();
    updateRevealingCopy();
    routeByGameState();
  });
  es.addEventListener('team-finalized', (e) => {
    const d = JSON.parse(e.data);
    state.participantsTotal = d.total;
    state.participantsFinalized = d.finalized;
    updateWaitingCounter();
  });
  es.addEventListener('case-created', async (e) => {
    const c = JSON.parse(e.data);
    if (state.team) toast('> novo case: ' + c.nome);
    await fetchCases(false);
  });
  es.addEventListener('case-removed', async () => {
    if (state.team) toast('> case removido');
    await fetchCases(false);
  });
  // sem toast de investimento: ninguém vê quanto os outros estão investindo
  es.addEventListener('investment', async () => {
    await fetchCases(true);
  });
  es.addEventListener('reveal-start', () => {
    state.gameState = 'revealing';
    routeByGameState();
  });
  es.addEventListener('reveal-result', () => {
    state.gameState = 'revealed';
    routeByGameState();
  });
  es.addEventListener('reset', async () => {
    // reset servidor apagou minha sessao — recarrega tudo
    toast('> rodada resetada');
    location.reload();
  });
  es.onerror = () => {};
}

/* ---------------- BOOT ---------------- */

if (IS_DIRECTOR_MODE) {
  const enterBtn = $('#director-enter-btn');
  if (enterBtn) enterBtn.addEventListener('click', submitDirectorLogin);
} else {
  $('#login-btn')?.addEventListener('click', submitLogin);
  $('#login-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
  $('#login-area')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitLogin(); });
}

(async function boot() {
  if (!IS_DIRECTOR_MODE) await loadAreas();
  await fetchGameState();
  let me = await refreshMe();

  // Evita "identidade trocada" quando o mesmo browser navega entre rotas
  // diferentes (/, /claudia, /felipe, /ia). Se a sessão atual não corresponde
  // à página atual, força logout pra mostrar o login apropriado.
  //   - Em /diretor/*: só aceita a sessão do mesmo diretor.
  //   - Em / (bank comum): rejeita sessão de diretor.
  if (me) {
    const mismatch = IS_DIRECTOR_MODE
      ? (!me.isDirector || me.directorCode !== window.DIRECTOR_CODENAME)
      : (me.isDirector === true);
    if (mismatch) {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      state.team = null;
      state.investingStartedAt = null;
      state.finalizedAt = null;
      state.isDirector = false;
      me = null;
    }
  }

  if (me && state.gameState === 'investing' && !state.finalizedAt) {
    await loadMyStuff();
    await fetchCases();
    startClientTimer();
  }
  routeByGameState();
  connectEvents();
})();
