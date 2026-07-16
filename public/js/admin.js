const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const fmtMoney = (n) => '$ ' + Number(n || 0).toLocaleString('pt-BR');
const fmtMoneyRound = (n) => '$ ' + Math.round(Number(n || 0)).toLocaleString('pt-BR');

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

const PHASE_LABELS = {
  presenting: 'APRESENTAÇÃO',
  investing: 'INVESTIMENTO',
  revealing: 'REVELAÇÃO EM ANDAMENTO',
  revealed: 'RESULTADO REVELADO',
};

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
  loadCasesBank();
}

let lastState = null;

async function refreshState() {
  try {
    const d = await api('/api/admin/state');
    lastState = d;
    $('#starting-balance').value = d.startingBalance;
    renderPhase(d.gameState);
    renderQR(d.gameState);
    renderRanking(d.results);
    renderUsers(d.teams || [], d.investWindowMs);
  } catch (e) {
    console.error('refreshState err', e);
  }
}

/* ---- banco de cases (catálogo completo + simulação no telão) ----
   O catálogo vem do cases-data.js incluído na página — não depende do
   servidor nem do telão ter sido aberto: mostra TODOS os cases sempre. */
function loadCasesBank() {
  const box = $('#cases-bank');
  const areas = window.SHARKTRIX_AREAS || [];
  if (!areas.length) {
    box.innerHTML = '<div class="empty">Catálogo não carregou (cases-data.js).</div>';
    return;
  }
  box.innerHTML = areas.map((a, ai) => `
    <div class="bank-area">
      <div class="bank-area-name">${escapeHtml(a.nome)} <span class="dim">— ${(a.cases || []).length} case(s)</span></div>
      <div class="bank-cases">
        ${(a.cases || []).map((c, ci) => `
          <a class="bank-case" href="/telao?sim=${ai}-${ci}" target="_blank" rel="noopener">
            <span class="bank-case-nome">${escapeHtml(c.nome)}</span>
            <span class="bank-case-autor">${escapeHtml(c.autor || '')}</span>
            <span class="bank-case-go">&gt; simular no telão</span>
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');
}

/* ---- phase controls ---- */
function renderPhase(gs) {
  const state = gs.state;
  $('#phase-current').textContent = PHASE_LABELS[state] || state;
  $('#phase-current').className = 'phase-current phase-' + state;

  const btnStart = $('#btn-start-investing');
  const btnForce = $('#btn-force-finalize');
  const btnReveal = $('#btn-reveal');
  const btnBack = $('#btn-back-presenting');
  const hint = $('#phase-hint');

  btnStart.style.display = (state === 'presenting') ? '' : 'none';
  btnForce.style.display = (state === 'investing') ? '' : 'none';
  btnReveal.style.display = (state === 'investing') ? '' : 'none';
  btnBack.style.display = (state === 'revealed') ? '' : 'none';

  btnReveal.disabled = !gs.readyToReveal;
  btnReveal.classList.toggle('pulse', gs.readyToReveal);

  if (state === 'presenting') {
    hint.textContent = 'Termine a apresentação dos cases no telão e clique em "Iniciar Rodada de Investimento" pra abrir a bolsa.';
  } else if (state === 'investing') {
    if (gs.readyToReveal) hint.textContent = '✓ TODOS FINALIZARAM. Você pode revelar o vencedor agora.';
    else hint.textContent = `Rodada aberta. ${gs.participantsFinalized} de ${gs.participantsTotal} finalizaram.`;
  } else if (state === 'revealing') {
    hint.textContent = 'O telão está fazendo a revelação com suspense. Aguarde ~15s.';
  } else if (state === 'revealed') {
    hint.textContent = 'Vencedor revelado no telão. Pra nova rodada, volte para apresentação ou reset.';
  }
}

$('#btn-start-investing').addEventListener('click', async () => {
  if (!confirm('Abrir rodada de investimento? Investidores atuais serão desconectados e a rodada começa zerada.')) return;
  try {
    await api('/api/admin/game-state', { method: 'POST', body: { state: 'investing' } });
    toast('> rodada aberta');
  } catch { toast('erro ao iniciar rodada', 'error'); }
});

$('#btn-force-finalize').addEventListener('click', async () => {
  if (!confirm('Forçar encerramento? Todos que ainda estão investindo serão marcados como finalizados.')) return;
  try {
    await api('/api/admin/force-finalize', { method: 'POST' });
    toast('> encerramento forçado');
  } catch { toast('erro', 'error'); }
});

$('#btn-reveal').addEventListener('click', async () => {
  if (!confirm('Revelar vencedor no telão? A sequência de suspense levará ~15 segundos.')) return;
  try {
    await api('/api/admin/reveal', { method: 'POST' });
    toast('> revelação em andamento');
  } catch { toast('erro ao revelar', 'error'); }
});

$('#btn-back-presenting').addEventListener('click', async () => {
  if (!confirm('Voltar pra apresentação? Investidores e investimentos atuais serão limpos, cases mantidos.')) return;
  try {
    await api('/api/admin/game-state', { method: 'POST', body: { state: 'presenting' } });
    toast('> voltou pra apresentação');
  } catch { toast('erro', 'error'); }
});

/* ---- QR ---- */
function renderQR(gs) {
  const panel = $('#qr-panel');
  if (gs.state !== 'investing') {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const url = window.location.origin + '/';
  $('#qr-url').textContent = url;

  // usa QuickChart API — funciona online, URL em texto abaixo como fallback
  const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(url) + '&size=400&margin=1';
  const img = $('#qr-code');
  img.src = qrUrl;
  img.onerror = () => {
    img.replaceWith(Object.assign(document.createElement('div'), {
      className: 'qr-fallback',
      textContent: url,
    }));
  };
  $('#qr-counter').textContent = `${gs.participantsFinalized} / ${gs.participantsTotal}`;
}

/* ---- ranking ---- */
function renderRanking(results) {
  const box = $('#ranking-table');
  if (!results || !results.results || !results.results.length) {
    box.innerHTML = '<div class="empty">Ainda nenhum case revelado.</div>';
    return;
  }
  const ranking = results.ranking || [];
  const winnerId = (results.winner && results.winner.caseId) || null;
  const isRevealed = lastState && lastState.gameState && lastState.gameState.state === 'revealed';

  let html = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Case</th>
          <th>Área</th>
          <th class="right">Investidores</th>
          <th class="right">Total (média por área)</th>
        </tr>
      </thead>
      <tbody>
  `;
  ranking.forEach((r, i) => {
    const isWinner = isRevealed && r.caseId === winnerId;
    const cls = i === 0 ? 'top' : '';
    const winnerBadge = isWinner ? '<span class="winner-badge">👑 VENCEDOR</span>' : '';
    html += `
      <tr class="${cls} ${isWinner ? 'winner-row' : ''}">
        <td class="rank-pos-cell">${i + 1}</td>
        <td>
          <div class="ranking-nome">${escapeHtml(r.nome)} ${winnerBadge}</div>
          <div class="ranking-breakdown">${renderBreakdown(r.breakdown)}</div>
        </td>
        <td>${escapeHtml(r.area || '—')}</td>
        <td class="right money">${r.investorCount || 0}</td>
        <td class="right money strong">${fmtMoneyRound(r.totalByArea)}</td>
      </tr>
    `;
  });
  html += '</tbody></table>';
  box.innerHTML = html;
}

function renderBreakdown(breakdown) {
  if (!breakdown || !breakdown.length) return '<span class="dim">sem investimentos</span>';
  return breakdown.map((b) =>
    `<span class="area-chip">${escapeHtml(b.area)}: <b>${fmtMoneyRound(b.average)}</b> <span class="dim">(${b.investorCount} inv.)</span></span>`
  ).join(' ');
}

/* ---- participantes ---- */
function renderUsers(teams, investWindowMs) {
  const box = $('#users-list');
  const participants = teams.filter((t) => t.isParticipant);
  if (!participants.length) {
    box.innerHTML = '<div class="empty">Nenhum investidor entrou na rodada ainda.</div>';
    return;
  }

  const byArea = {};
  for (const t of participants) {
    const area = t.area || 'DESCONHECIDO';
    byArea[area] = (byArea[area] || 0) + 1;
  }

  let statsHtml = '<div class="area-stats">';
  statsHtml += '<b>Por área:</b> ';
  for (const [area, count] of Object.entries(byArea)) {
    statsHtml += `<span class="area-chip">${escapeHtml(area)}: ${count}</span> `;
  }
  statsHtml += '</div>';

  // ordena: os ativos (não finalizados) primeiro, depois por invested desc
  const sorted = [...participants].sort((a, b) => {
    const af = a.finalizedAt ? 1 : 0;
    const bf = b.finalizedAt ? 1 : 0;
    if (af !== bf) return af - bf;
    return b.invested - a.invested;
  });

  const now = Date.now();
  const rows = sorted.map((t, i) => {
    const status = t.finalizedAt ? 'FINALIZADO' : 'INVESTINDO';
    const statusCls = t.finalizedAt ? 'finalized' : 'investing';
    const remainingMs = t.investingStartedAt
      ? Math.max(0, (investWindowMs || 90000) - (now - t.investingStartedAt))
      : 0;
    const remSec = Math.ceil(remainingMs / 1000);
    const remTxt = t.finalizedAt ? '—' : (String(Math.floor(remSec / 60)).padStart(2, '0') + ':' + String(remSec % 60).padStart(2, '0'));
    return `
      <div class="rank-row ${i === 0 ? 'top' : ''}">
        <div class="rank-pos">${i + 1}</div>
        <div class="info">
          <div class="rank-name">${escapeHtml(t.name)} <span class="dim">(${escapeHtml(t.area || '')})</span></div>
          <div class="rank-bal">
            Investiu: <strong>${fmtMoney(t.invested)}</strong>
            &nbsp;|&nbsp; Saldo: ${fmtMoney(t.balance)}
            &nbsp;|&nbsp; Tempo: <b>${remTxt}</b>
          </div>
        </div>
        <div class="status-pill ${statusCls}">${status}</div>
      </div>
    `;
  });
  box.innerHTML = statsHtml + rows.join('');
}

/* ---- config ---- */
$('#save-starting').addEventListener('click', async () => {
  const value = Number($('#starting-balance').value);
  try {
    await api('/api/admin/starting-balance', { method: 'POST', body: { value } });
    toast('> saldo inicial salvo');
  } catch { toast('Erro', 'error'); }
});

$('#reset-keep-cases').addEventListener('click', async () => {
  if (!confirm('Reset investidores mantendo os cases? Todos investidores atuais serão desconectados.')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepCases: true } });
    toast('> investidores resetados');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

$('#reset-all').addEventListener('click', async () => {
  if (!confirm('APAGA TUDO (cases + investidores). Certeza?')) return;
  try {
    await api('/api/admin/reset', { method: 'POST', body: { keepCases: false } });
    toast('> tudo resetado');
    refreshState();
  } catch { toast('Erro', 'error'); }
});

function connectEvents() {
  const es = new EventSource('/api/events');
  ['case-created', 'case-removed', 'investment', 'reset', 'game-state', 'team-finalized', 'reveal-start', 'reveal-result'].forEach((ev) => {
    es.addEventListener(ev, () => refreshState());
  });
}

// atualiza o tempo dos participantes a cada segundo pra ficar "vivo"
setInterval(() => {
  if (lastState && lastState.gameState && lastState.gameState.state === 'investing') {
    renderUsers(lastState.teams || [], lastState.investWindowMs);
  }
}, 1000);

(async function boot() {
  try {
    const d = await api('/api/admin/me');
    if (d.isAdmin) showPanel();
  } catch {}
})();
