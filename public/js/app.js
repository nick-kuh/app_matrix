// ------- helpers -------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const fmtMoney = (n) => {
  const v = Number(n || 0);
  return '$ ' + v.toLocaleString('pt-BR');
};

const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return '$ ' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$ ' + (v / 1_000).toFixed(1) + 'K';
  return '$ ' + v;
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

// ------- state -------
let state = {
  user: null,
  cases: [],
  currentCaseId: null,
  myInvestments: [],
  ranking: [],
};

// ------- auth screen -------
let authMode = 'register';

$$('.auth-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.auth-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    authMode = btn.dataset.mode;
    $('#auth-submit').textContent =
      authMode === 'register' ? 'CRIAR CONTA' : 'ENTRAR NA MATRIX';
    $('#auth-error').textContent = '';
  });
});

$('#auth-submit').addEventListener('click', async () => {
  const name = $('#auth-name').value.trim();
  const pin = $('#auth-pin').value.trim();
  $('#auth-error').textContent = '';
  try {
    const data = await api(`/api/${authMode}`, { method: 'POST', body: { name, pin } });
    state.user = data;
    onLogin();
  } catch (e) {
    const map = {
      nome_invalido: 'Nome invalido (2 a 24 caracteres)',
      pin_invalido: 'PIN precisa ter 4 a 6 numeros',
      nome_ja_existe: 'Ja existe alguem com esse nome. Use "Entrar".',
      credenciais_invalidas: 'Nome ou PIN incorretos',
    };
    $('#auth-error').textContent = map[e.data?.error] || 'Erro. Tenta de novo.';
  }
});

['auth-name', 'auth-pin'].forEach((id) => {
  $('#' + id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#auth-submit').click();
  });
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

// ------- tabs -------
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    if (tab === 'wallet') loadMyInvestments();
    if (tab === 'rank') loadRanking();
  });
});

// ------- render -------
function renderUser() {
  if (!state.user) return;
  $('#user-name').textContent = '@' + state.user.name;
  $('#user-balance').textContent = fmtMoney(state.user.balance);
}

function renderCaseStrip() {
  const strip = $('#case-strip');
  strip.innerHTML = '';
  $('#case-count').textContent = state.cases.length;

  if (state.cases.length === 0) {
    strip.innerHTML = '<div class="empty" style="padding:10px 6px;">Sem cases ainda</div>';
    return;
  }

  for (const c of state.cases) {
    const chip = document.createElement('div');
    chip.className = 'case-chip' + (c.id === state.currentCaseId ? ' active' : '');
    chip.innerHTML = `
      <div class="name">${escapeHtml(c.company)}</div>
      <div class="meta">
        <span>${fmtCompact(c.askAmount)} / ${c.equity}%</span>
        <span class="status ${c.status}">${c.status === 'open' ? 'AO VIVO' : 'FIM'}</span>
      </div>
    `;
    chip.addEventListener('click', () => selectCase(c.id));
    strip.appendChild(chip);
  }
}

function currentCase() {
  return state.cases.find((c) => c.id === state.currentCaseId) || null;
}

function selectCase(id) {
  state.currentCaseId = id;
  renderCaseStrip();
  renderCaseView();
  // ativa a aba do case ao selecionar
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'case'));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-case'));
  loadCaseInvestments(id);
}

function renderCaseView() {
  const c = currentCase();
  const view = $('#case-view');
  if (!c) {
    view.innerHTML = `<div class="empty">Nenhum case selecionado.<br/>Aguarde o proximo pitch.</div>`;
    return;
  }

  const isOpen = c.status === 'open';
  const badge = isOpen
    ? '<span class="case-badge badge-open">AO VIVO</span>'
    : '<span class="case-badge badge-closed">ENCERRADO</span>';

  const closedInfo = !isOpen
    ? `<div class="stat" style="grid-column: 1 / -1;">
        <div class="l">Retorno final</div>
        <div class="v">${(c.multiplier ?? 0).toFixed(2)}x</div>
      </div>`
    : '';

  view.innerHTML = `
    <div class="panel">
      <div class="case-header">
        <h2 class="case-company">${escapeHtml(c.company)}</h2>
        ${badge}
      </div>
      <div class="case-pitch">${escapeHtml(c.pitch)}</div>
      <div class="case-stats">
        <div class="stat">
          <div class="l">Pedido</div>
          <div class="v">${fmtMoney(c.askAmount)}</div>
        </div>
        <div class="stat">
          <div class="l">Equity</div>
          <div class="v">${c.equity}%</div>
        </div>
        <div class="stat">
          <div class="l">Total investido</div>
          <div class="v">${fmtMoney(c.totalRaised)}</div>
        </div>
        <div class="stat">
          <div class="l">Investidores</div>
          <div class="v">${c.investorCount}</div>
        </div>
        ${closedInfo}
      </div>

      ${isOpen ? renderInvestForm(c) : ''}
    </div>

    <div class="section-title">&gt; Movimentacoes deste case</div>
    <div class="panel">
      <div class="inv-list" id="case-invs">
        <div class="empty">Carregando...</div>
      </div>
    </div>
  `;

  if (isOpen) attachInvestHandlers(c);
}

function renderInvestForm(c) {
  return `
    <hr class="sep" />
    <div class="invest-form">
      <label for="invest-amount">Quanto quer investir?</label>
      <input id="invest-amount" class="invest-input" type="number" inputmode="numeric" min="1" placeholder="0" />
      <div class="quick-amounts" id="quick-amounts">
        <button class="chip" data-q="1000">+$1K</button>
        <button class="chip" data-q="5000">+$5K</button>
        <button class="chip" data-q="10000">+$10K</button>
        <button class="chip" data-q="25000">+$25K</button>
        <button class="chip" data-clear="1">Zerar</button>
        <button class="chip" data-max="1">MAX</button>
      </div>
      <button id="invest-btn" class="btn">INVESTIR AGORA</button>
    </div>
  `;
}

function attachInvestHandlers(c) {
  const amtInput = $('#invest-amount');
  $$('#quick-amounts .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.clear) { amtInput.value = ''; return; }
      if (btn.dataset.max) {
        amtInput.value = state.user.balance;
        return;
      }
      const cur = Math.floor(Number(amtInput.value || 0));
      const add = Number(btn.dataset.q);
      amtInput.value = Math.min(cur + add, state.user.balance);
    });
  });

  $('#invest-btn').addEventListener('click', async () => {
    const amount = Math.floor(Number(amtInput.value || 0));
    if (!amount || amount <= 0) return toast('Digita um valor', 'error');
    if (amount > state.user.balance) return toast('Saldo insuficiente', 'error');
    try {
      const btn = $('#invest-btn');
      btn.disabled = true;
      btn.textContent = 'CONFIRMANDO...';
      const res = await api(`/api/cases/${c.id}/invest`, {
        method: 'POST',
        body: { amount },
      });
      state.user.balance = res.balance;
      renderUser();
      toast(`Investiu ${fmtMoney(amount)} em ${c.company}`);
      await refreshCases({ keepCurrent: true });
      loadCaseInvestments(c.id);
    } catch (e) {
      const map = {
        saldo_insuficiente: 'Saldo insuficiente',
        caso_fechado: 'O case ja foi encerrado',
        valor_invalido: 'Valor invalido',
      };
      toast(map[e.data?.error] || 'Nao foi possivel investir', 'error');
    } finally {
      const btn = $('#invest-btn');
      if (btn) { btn.disabled = false; btn.textContent = 'INVESTIR AGORA'; }
    }
  });
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// ------- data loaders -------
async function refreshMe() {
  try {
    const d = await api('/api/me');
    if (!d.user) return null;
    state.user = d.user;
    renderUser();
    return d.user;
  } catch { return null; }
}

async function refreshCases({ keepCurrent = false } = {}) {
  const d = await api('/api/cases');
  state.cases = d.cases;
  if (!keepCurrent || !state.currentCaseId || !state.cases.find((c) => c.id === state.currentCaseId)) {
    const open = state.cases.find((c) => c.status === 'open');
    state.currentCaseId = open?.id || state.cases[0]?.id || null;
  }
  renderCaseStrip();
  renderCaseView();
  if (state.currentCaseId) loadCaseInvestments(state.currentCaseId);
}

async function loadCaseInvestments(caseId) {
  try {
    const d = await api(`/api/cases/${caseId}/investments`);
    const box = $('#case-invs');
    if (!box) return;
    if (d.investments.length === 0) {
      box.innerHTML = '<div class="empty" style="padding:14px 4px;">Ninguem investiu ainda.</div>';
      return;
    }
    box.innerHTML = d.investments.map((i) => {
      let payoutHtml = '';
      if (i.payout != null) {
        const diff = i.payout - i.amount;
        const cls = diff > 0 ? 'win' : diff < 0 ? 'loss' : '';
        const sign = diff > 0 ? '+' : '';
        payoutHtml = `<span class="payout ${cls}">${sign}${fmtMoney(diff)}</span>`;
      }
      return `
        <div class="inv-row">
          <span class="who ${i.isMine ? 'me' : ''}">@${escapeHtml(i.userName)}</span>
          <span><span class="amt">${fmtMoney(i.amount)}</span>${payoutHtml}</span>
        </div>
      `;
    }).join('');
  } catch {}
}

async function loadMyInvestments() {
  try {
    const d = await api('/api/investments/mine');
    state.myInvestments = d.investments;
    const box = $('#my-invs');
    if (d.investments.length === 0) {
      box.innerHTML = '<div class="empty">Voce ainda nao investiu.</div>';
      return;
    }
    box.innerHTML = d.investments.map((i) => {
      let extra = '';
      if (i.payout != null) {
        const diff = i.payout - i.amount;
        const cls = diff > 0 ? 'win' : diff < 0 ? 'loss' : '';
        const sign = diff > 0 ? '+' : '';
        extra = `<span class="payout ${cls}">${sign}${fmtMoney(diff)}</span>`;
      } else {
        extra = `<span class="payout">em aberto</span>`;
      }
      return `
        <div class="inv-row">
          <span class="who">${escapeHtml(i.caseCompany)}</span>
          <span><span class="amt">${fmtMoney(i.amount)}</span>${extra}</span>
        </div>
      `;
    }).join('');
  } catch {}
}

async function loadRanking() {
  try {
    const d = await api('/api/ranking');
    state.ranking = d.ranking;
    const box = $('#rank-list');
    if (d.ranking.length === 0) {
      box.innerHTML = '<div class="empty">Sem jogadores.</div>';
      return;
    }
    box.innerHTML = d.ranking.map((u, i) => `
      <div class="rank-row ${i === 0 ? 'top' : ''} ${u.id === state.user?.id ? 'me' : ''}">
        <div class="rank-pos">${i + 1}</div>
        <div class="rank-name">@${escapeHtml(u.name)}</div>
        <div class="rank-bal">${fmtMoney(u.balance)}</div>
      </div>
    `).join('');
  } catch {}
}

// ------- SSE (realtime) -------
function connectEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('case-created', async (e) => {
    const c = JSON.parse(e.data);
    toast('Novo case: ' + c.company);
    await refreshCases();
  });
  es.addEventListener('case-closed', async () => {
    toast('Um case foi encerrado');
    await refreshCases({ keepCurrent: true });
    await refreshMe();
    loadMyInvestments();
  });
  es.addEventListener('case-removed', async () => {
    await refreshCases();
    await refreshMe();
  });
  es.addEventListener('investment', async (e) => {
    const data = JSON.parse(e.data);
    if (data.caseId === state.currentCaseId) {
      await refreshCases({ keepCurrent: true });
    }
  });
  es.addEventListener('reset', async () => {
    toast('Jogo resetado');
    await refreshMe();
    await refreshCases();
    loadMyInvestments();
  });
  es.onerror = () => {
    // browser reconecta automaticamente
  };
}

// ------- boot -------
function onLogin() {
  $('#auth').style.display = 'none';
  $('#app').style.display = 'flex';
  renderUser();
  refreshCases();
  connectEvents();
}

(async function boot() {
  const me = await refreshMe();
  if (me) {
    onLogin();
  }
})();
