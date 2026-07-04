/* ============================================================
   SHARK TANK BANK — mobile app
   Conectado ao telão via SSE: quando um case é revelado no
   sorteio (telao.html), ele aparece aqui como chip no topo
   e o jogador pode investir.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const fmtMoney = (n) => '$ ' + Number(n || 0).toLocaleString('pt-BR');
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

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let state = {
  user: null,
  cases: [],
  currentCaseId: null,
  myInvestments: [], // agregado por caseId
};

/* ---------------- AUTH ---------------- */
let authMode = 'register';

$$('.auth-tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('.auth-tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    authMode = btn.dataset.mode;
    $('#auth-submit').textContent =
      authMode === 'register' ? '> CRIAR CONTA' : '> ENTRAR NO TANQUE';
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
    $('#auth-error').textContent = '> ' + (map[e.data?.error] || 'erro. tenta de novo.');
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

/* ---------------- TABS ---------------- */
$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    if (tab === 'wallet') loadMyInvestments();
    if (tab === 'rank') loadRanking();
  });
});

/* ---------------- RENDER ---------------- */
function renderUser() {
  if (!state.user) return;
  $('#user-name').textContent = '@' + state.user.name;
  $('#user-balance').textContent = fmtMoney(state.user.balance);
}

function myInvestedIn(caseId) {
  const inv = state.myInvestments.find((i) => i.caseId === caseId);
  return inv ? inv.total : 0;
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
    const invested = myInvestedIn(c.id);
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
  loadCaseInvestments(id);
}

function renderToolsHtml(tools) {
  if (!tools) return '';
  const list = Array.isArray(tools) ? tools : [tools];
  const parts = list.map((t) => {
    if (typeof t === 'string') return escapeHtml(t);
    if (t && t.name) return t.highlight ? '<b>' + escapeHtml(t.name) + '</b>' : escapeHtml(t.name);
    return '';
  }).filter(Boolean);
  if (!parts.length) return '';
  return '<div class="w-tools"><b>Tools:</b> ' + parts.join(', ') + '.</div>';
}

function renderImpactoHtml(impacto) {
  if (!impacto || !impacto.length) return '';
  return impacto.map((i) =>
    '<div class="w-impacto-line"><b>' + escapeHtml(i.label) + ':</b> ' + escapeHtml(i.value) + '</div>'
  ).join('');
}

function renderCaseView() {
  const c = currentCase();
  const view = $('#case-view');
  if (!c) {
    view.innerHTML = `
      <div class="waiting-panel">
        <div style="font-size:11px;color:var(--matrix-green-dim);letter-spacing:0.25em;">&gt; STATUS</div>
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
  const autor = c.autor && c.duracao
    ? escapeHtml(c.autor) + ' &middot; ' + escapeHtml(c.duracao)
    : escapeHtml(c.autor || c.duracao || '');

  // caixas de desafio/solução/impacto (mesmo estilo do telão)
  const boxes = [];
  if (c.desafio || c.stakeholder) {
    boxes.push(`
      <div class="w-box">
        <div class="w-box-title">DESAFIO</div>
        <div>${escapeHtml(c.desafio || '')}</div>
        ${c.stakeholder ? `
          <div class="w-box-sub-title">Stakeholder</div>
          <div>${escapeHtml(c.stakeholder)}</div>
        ` : ''}
      </div>
    `);
  }
  if (c.solucao || c.tools) {
    boxes.push(`
      <div class="w-box">
        <div class="w-box-title">SOLUÇÃO &amp; TOOL</div>
        <div>${escapeHtml(c.solucao || '')}</div>
        ${renderToolsHtml(c.tools)}
      </div>
    `);
  }
  if ((c.impacto && c.impacto.length) || c.timeToValue) {
    boxes.push(`
      <div class="w-box">
        <div class="w-box-title">IMPACTO &nbsp;|&nbsp; Value Realization</div>
        ${renderImpactoHtml(c.impacto)}
        ${c.timeToValue ? `<div class="w-ttv">Time-to-value: ${escapeHtml(c.timeToValue)}</div>` : ''}
      </div>
    `);
  }

  const myInv = myInvestedIn(c.id);
  const myInvLine = myInv > 0
    ? `<div class="my-invest-info">Você já investiu <span class="val">${fmtMoney(myInv)}</span> neste case</div>`
    : '';

  // painel de investir só aparece quando o case tá aberto
  const investBlock = isOpen ? `
    <div class="invest-panel">
      <div class="invest-title">&gt; INVESTIR NESTE CASE</div>
      <input id="invest-amount" class="invest-input" type="number" inputmode="numeric" min="1" placeholder="0" />
      <div class="quick-amounts" id="quick-amounts">
        <button class="chip" data-q="1000">+$1K</button>
        <button class="chip" data-q="5000">+$5K</button>
        <button class="chip" data-q="10000">+$10K</button>
        <button class="chip" data-q="25000">+$25K</button>
        <button class="chip" data-clear="1">zerar</button>
        <button class="chip" data-max="1">MAX</button>
      </div>
      <button id="invest-btn" class="btn">&gt; INVESTIR AGORA</button>
      ${myInvLine}
    </div>
  ` : '';

  // resultado quando o case tá fechado
  const resultBlock = !isOpen ? renderResultBlock(c, myInv) : '';

  view.innerHTML = `
    <div class="panel">
      <div class="case-kicker-row">
        <div>${kicker}</div>
        ${statusTag}
      </div>
      <div class="case-nome">${escapeHtml(c.nome)}</div>
      ${autor ? `<div class="case-autor">${autor}</div>` : ''}

      ${boxes.join('')}

      ${investBlock}
      ${resultBlock}
    </div>

    <div class="section-title">&gt; movimentações deste case</div>
    <div class="panel">
      <div id="case-invs">
        <div class="empty">Carregando...</div>
      </div>
    </div>
  `;

  if (isOpen) attachInvestHandlers(c);
}

function renderResultBlock(c, myInv) {
  const m = c.multiplier ?? 0;
  let note = '';
  if (m >= 3) note = 'JACKPOT! Investidores multiplicaram por ' + m.toFixed(1) + 'x';
  else if (m >= 2) note = 'Ótimo negócio — dobraram (ou mais)';
  else if (m > 1) note = 'Retorno positivo';
  else if (m === 1) note = 'Empatou — devolveu o investido';
  else if (m > 0) note = 'Prejuízo — retorno parcial';
  else note = 'Empresa quebrou — investidores perdem tudo';
  const payout = Math.floor(myInv * m);
  const diff = payout - myInv;
  const myLine = myInv > 0
    ? `<div style="margin-top:8px;font-size:12px;">
        Você investiu <span style="color:var(--matrix-green);font-variant-numeric:tabular-nums;">${fmtMoney(myInv)}</span>
        e recebeu <span style="color:${diff >= 0 ? 'var(--matrix-green)' : 'var(--matrix-red)'};font-variant-numeric:tabular-nums;">${fmtMoney(payout)}</span>
        (${diff >= 0 ? '+' : ''}${fmtMoney(diff)})
      </div>`
    : '';
  return `
    <div class="closed-result">
      <div class="l">&gt; resultado</div>
      <div class="multi">${m.toFixed(2)}x</div>
      <div class="note">${note}</div>
      ${myLine}
    </div>
  `;
}

function attachInvestHandlers(c) {
  const amtInput = $('#invest-amount');
  $$('#quick-amounts .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.clear) { amtInput.value = ''; return; }
      if (btn.dataset.max) { amtInput.value = state.user.balance; return; }
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
      btn.textContent = '> CONFIRMANDO...';
      const res = await api(`/api/cases/${c.id}/invest`, {
        method: 'POST', body: { amount },
      });
      state.user.balance = res.balance;
      renderUser();
      toast(`> +${fmtMoney(amount)} em ${c.nome}`);
      // atualiza local
      const prev = state.myInvestments.find((i) => i.caseId === c.id);
      if (prev) prev.total += amount;
      else state.myInvestments.push({ caseId: c.id, total: amount });
      await refreshCases({ keepCurrent: true });
      loadCaseInvestments(c.id);
    } catch (e) {
      const map = {
        saldo_insuficiente: 'Saldo insuficiente',
        caso_fechado: 'O case já foi encerrado',
        valor_invalido: 'Valor inválido',
      };
      toast(map[e.data?.error] || 'Não foi possível investir', 'error');
    } finally {
      const btn = $('#invest-btn');
      if (btn) { btn.disabled = false; btn.textContent = '> INVESTIR AGORA'; }
    }
  });
}

/* ---------------- DATA LOADERS ---------------- */
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
  // mantém current se ainda existe; senão foca no ultimo aberto ou no ultimo criado
  if (!keepCurrent || !state.currentCaseId || !state.cases.find((c) => c.id === state.currentCaseId)) {
    const open = [...state.cases].reverse().find((c) => c.status === 'open');
    state.currentCaseId = open?.id || state.cases[state.cases.length - 1]?.id || null;
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
    if (!d.investments.length) {
      box.innerHTML = '<div class="empty">Ninguém investiu ainda.</div>';
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
    // agrega por case (pra chips)
    const byCase = new Map();
    for (const i of d.investments) {
      const cur = byCase.get(i.caseId) || 0;
      byCase.set(i.caseId, cur + i.amount);
    }
    state.myInvestments = [...byCase.entries()].map(([caseId, total]) => ({ caseId, total }));

    const box = $('#my-invs');
    if (!d.investments.length) {
      box.innerHTML = '<div class="empty">Você ainda não investiu em nenhum case.</div>';
      return;
    }
    box.innerHTML = d.investments.map((i) => {
      let payoutHtml = '';
      if (i.payout != null) {
        const diff = i.payout - i.amount;
        const cls = diff > 0 ? 'win' : diff < 0 ? 'loss' : '';
        const sign = diff > 0 ? '+' : '';
        payoutHtml = `<div class="wr-payout ${cls}">${sign}${fmtMoney(diff)}</div>`;
      } else {
        payoutHtml = '<div class="wr-payout">em aberto</div>';
      }
      return `
        <div class="wallet-row">
          <div class="wr-left">
            <div class="wr-kicker">${escapeHtml(i.caseArea || 'AREA')}</div>
            <div class="wr-nome">${escapeHtml(i.caseNome)}</div>
          </div>
          <div class="wr-right">
            <div class="wr-amt">${fmtMoney(i.amount)}</div>
            ${payoutHtml}
          </div>
        </div>
      `;
    }).join('');
    // atualiza os chips com os novos totais
    renderCaseStrip();
  } catch {}
}

async function loadRanking() {
  try {
    const d = await api('/api/ranking');
    const box = $('#rank-list');
    if (!d.ranking.length) {
      box.innerHTML = '<div class="empty">Sem investidores ainda.</div>';
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
    await loadMyInvestments();
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
    toast('> sistema resetado');
    await refreshMe();
    await refreshCases();
    await loadMyInvestments();
  });
  es.onerror = () => {};
}

/* ---------------- BOOT ---------------- */
async function onLogin() {
  $('#auth').style.display = 'none';
  $('#app').style.display = 'flex';
  renderUser();
  await loadMyInvestments();
  await refreshCases();
  connectEvents();
}

(async function boot() {
  const me = await refreshMe();
  if (me) onLogin();
})();
