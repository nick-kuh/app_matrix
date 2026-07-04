const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtMoney = (n) => '$ ' + Number(n || 0).toLocaleString('pt-BR');

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
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' error' : '');
  t.textContent = msg;
  $('#toast-host').appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* ---- login ---- */
$('#admin-login-btn').addEventListener('click', doLogin);
$('#admin-pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const password = $('#admin-pwd').value;
  $('#admin-err').textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { password } });
    showPanel();
  } catch {
    $('#admin-err').textContent = '> senha invalida';
  }
}

$('#admin-logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

/* ---- panel ---- */
async function showPanel() {
  $('#admin-login').style.display = 'none';
  $('#admin-panel').style.display = 'block';
  connectEvents();
  await refreshState();
}

async function refreshState() {
  try {
    const d = await api('/api/admin/state');
    $('#starting-balance').value = d.startingBalance;
    renderCases(d.cases);
    renderUsers(d.users);
  } catch {}
}

function renderCases(cases) {
  const box = $('#cases-list');
  if (!cases.length) {
    box.innerHTML = '<div class="empty">Ainda nenhum case revelado no telão.</div>';
    return;
  }
  const sorted = [...cases].sort((a, b) => b.createdAt - a.createdAt);
  box.innerHTML = sorted.map((c) => {
    const isOpen = c.status === 'open';
    const kicker = 'USE CASE ' + String(c.pos || '?').padStart(2, '0') + ' | ' + escapeHtml(c.area || 'AREA');
    return `
      <div class="admin-case">
        <div class="admin-case-kicker">${kicker}</div>
        <div class="admin-case-head">
          <strong>${escapeHtml(c.nome)}</strong>
          <span class="status-tag ${isOpen ? '' : 'closed'}" style="font-size:9px;padding:2px 8px;border:1px solid;">${isOpen ? 'AO VIVO' : 'FIM'}</span>
        </div>
        <div class="admin-case-meta">
          ${c.investorCount} investidor(es) &middot; total ${fmtMoney(c.totalRaised)}
          ${!isOpen ? ' &middot; retorno ' + (c.multiplier ?? 0).toFixed(2) + 'x' : ''}
        </div>
        ${isOpen ? `
          <div class="admin-case-actions">
            <input type="number" step="0.1" min="0" placeholder="Multiplicador (ex: 2, 0.5, 0, 3)" id="mult-${c.id}" />
            <button class="btn small" data-close="${c.id}">Fechar</button>
            <button class="btn small danger" data-remove="${c.id}">Apagar</button>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  box.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeCase(btn.dataset.close));
  });
  box.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => removeCase(btn.dataset.remove));
  });
}

function renderUsers(users) {
  const box = $('#users-list');
  if (!users.length) {
    box.innerHTML = '<div class="empty">Nenhum jogador ainda.</div>';
    return;
  }
  const sorted = [...users].sort((a, b) => b.balance - a.balance);
  box.innerHTML = sorted.map((u, i) => `
    <div class="rank-row ${i === 0 ? 'top' : ''}">
      <div class="rank-pos">${i + 1}</div>
      <div class="rank-name">@${escapeHtml(u.name)}</div>
      <div class="rank-bal">${fmtMoney(u.balance)}</div>
    </div>
  `).join('');
}

async function closeCase(id) {
  const input = document.getElementById('mult-' + id);
  const multiplier = Number(input.value);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    toast('Multiplicador inválido (ex: 2, 0.5, 0)', 'error');
    return;
  }
  if (!confirm(`Fechar case com ${multiplier}x?\nCada investidor recebe (valor investido * ${multiplier}).`)) return;
  try {
    await api(`/api/admin/cases/${id}/close`, { method: 'POST', body: { multiplier } });
    toast('> case fechado');
    refreshState();
  } catch { toast('Erro ao fechar', 'error'); }
}

async function removeCase(id) {
  if (!confirm('Apagar este case? O dinheiro dos investidores volta pra eles.')) return;
  try {
    await api(`/api/admin/cases/${id}`, { method: 'DELETE' });
    toast('> case removido');
    refreshState();
  } catch { toast('Erro ao remover', 'error'); }
}

$('#save-starting').addEventListener('click', async () => {
  const value = Number($('#starting-balance').value);
  try {
    await api('/api/admin/starting-balance', { method: 'POST', body: { value } });
    toast('> saldo inicial salvo');
  } catch { toast('Erro', 'error'); }
});

$('#reset-keep').addEventListener('click', async () => {
  if (!confirm('Reset o jogo mantendo os jogadores? Todos voltam ao saldo inicial e os cases sao apagados.')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepUsers: true } });
    toast('> jogo resetado');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

$('#reset-all').addEventListener('click', async () => {
  if (!confirm('APAGA TUDO: jogadores, cases, investimentos. Certeza?')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepUsers: false } });
    toast('> tudo resetado');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

function connectEvents() {
  const es = new EventSource('/api/events');
  ['case-created', 'case-closed', 'case-removed', 'investment', 'user', 'reset'].forEach((ev) => {
    es.addEventListener(ev, () => refreshState());
  });
}

(async function boot() {
  try {
    const d = await api('/api/admin/me');
    if (d.isAdmin) showPanel();
  } catch {}
})();
