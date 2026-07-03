const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

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

const fmtMoney = (n) => '$ ' + Number(n || 0).toLocaleString('pt-BR');

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

// ---- login ----
$('#admin-login-btn').addEventListener('click', doLogin);
$('#admin-pwd').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
  const password = $('#admin-pwd').value;
  $('#admin-err').textContent = '';
  try {
    await api('/api/admin/login', { method: 'POST', body: { password } });
    showPanel();
  } catch (e) {
    $('#admin-err').textContent = 'Senha invalida';
  }
}

$('#admin-logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  location.reload();
});

// ---- panel ----
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
  } catch {
    // nao autenticado
  }
}

function renderCases(cases) {
  const box = $('#cases-list');
  if (!cases.length) {
    box.innerHTML = '<div class="empty">Nenhum case criado.</div>';
    return;
  }
  const sorted = [...cases].sort((a, b) => b.createdAt - a.createdAt);
  box.innerHTML = sorted.map((c) => {
    const isOpen = c.status === 'open';
    return `
      <div class="admin-case">
        <div class="admin-case-head">
          <strong>${escapeHtml(c.company)}</strong>
          <span class="case-badge ${isOpen ? 'badge-open' : 'badge-closed'}">${isOpen ? 'AO VIVO' : 'FIM'}</span>
        </div>
        <div class="admin-case-meta">
          Pedido ${fmtMoney(c.askAmount)} por ${c.equity}%
          &middot; ${c.investorCount} investidor(es)
          &middot; total ${fmtMoney(c.totalRaised)}
          ${!isOpen ? ' &middot; retorno ' + (c.multiplier ?? 0).toFixed(2) + 'x' : ''}
        </div>
        ${isOpen ? `
          <div class="admin-case-actions">
            <input type="number" step="0.1" min="0" placeholder="Multiplicador (ex: 2 = dobra, 0 = perde)" id="mult-${c.id}" />
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

// ---- criar case ----
$('#new-btn').addEventListener('click', async () => {
  const company = $('#new-company').value.trim();
  const pitch = $('#new-pitch').value.trim();
  const askAmount = Number($('#new-ask').value);
  const equity = Number($('#new-equity').value);
  $('#new-err').textContent = '';
  if (!company || !pitch || !askAmount || !equity) {
    $('#new-err').textContent = 'Preenche todos os campos';
    return;
  }
  try {
    await api('/api/admin/cases', {
      method: 'POST',
      body: { company, pitch, askAmount, equity },
    });
    $('#new-company').value = '';
    $('#new-pitch').value = '';
    $('#new-ask').value = '';
    $('#new-equity').value = '';
    toast('Case publicado');
    refreshState();
  } catch (e) {
    $('#new-err').textContent = 'Erro ao publicar';
  }
});

async function closeCase(id) {
  const input = document.getElementById('mult-' + id);
  const multiplier = Number(input.value);
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    toast('Multiplicador invalido (ex: 2 = dobra, 0.5 = metade, 0 = perde tudo)', 'error');
    return;
  }
  const ok = confirm(`Fechar o case com multiplicador ${multiplier}x?\nCada investidor recebe (valor investido * ${multiplier}).`);
  if (!ok) return;
  try {
    await api(`/api/admin/cases/${id}/close`, { method: 'POST', body: { multiplier } });
    toast('Case fechado');
    refreshState();
  } catch {
    toast('Erro ao fechar', 'error');
  }
}

async function removeCase(id) {
  const ok = confirm('Apagar este case?\nO dinheiro dos investidores volta pra eles.');
  if (!ok) return;
  try {
    await api(`/api/admin/cases/${id}`, { method: 'DELETE' });
    toast('Case removido');
    refreshState();
  } catch {
    toast('Erro ao remover', 'error');
  }
}

// ---- config ----
$('#save-starting').addEventListener('click', async () => {
  const value = Number($('#starting-balance').value);
  try {
    await api('/api/admin/starting-balance', { method: 'POST', body: { value } });
    toast('Saldo inicial salvo');
  } catch { toast('Erro', 'error'); }
});

$('#reset-keep').addEventListener('click', async () => {
  if (!confirm('Reset o jogo mantendo os jogadores? Todos voltam ao saldo inicial e os cases sao apagados.')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepUsers: true } });
    toast('Jogo resetado');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

$('#reset-all').addEventListener('click', async () => {
  if (!confirm('APAGA TUDO: jogadores, cases, investimentos. Certeza?')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepUsers: false } });
    toast('Tudo resetado');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

// ---- realtime ----
function connectEvents() {
  const es = new EventSource('/api/events');
  ['case-created', 'case-closed', 'case-removed', 'investment', 'user', 'reset'].forEach((ev) => {
    es.addEventListener(ev, () => refreshState());
  });
}

// ---- boot ----
(async function boot() {
  try {
    const d = await api('/api/admin/me');
    if (d.isAdmin) showPanel();
  } catch {}
})();
