// ===========================
// STATE
// ===========================
const state = {
  section: 'now',
  data: null,
  error: null
};

const $ = (sel) => document.querySelector(sel);

function esc(val) {
  return String(val ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

// ===========================
// INIT
// ===========================
async function init() {
  renderDate();
  setupTabs();
  setupRefresh();

  try {
    const res = await fetch('./data/dashboard.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
  } catch (err) {
    state.error = err;
  }

  render();
}

function renderDate() {
  const el = $('#header-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
}

function setupRefresh() {
  const btn = $('#refresh-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    state.data = null;
    state.error = null;
    $('#feed').innerHTML = '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    init();
  });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.section = tab.dataset.section;
      render();
    });
  });
}

// ===========================
// RENDER ROUTER
// ===========================
function render() {
  const feed = $('#feed');
  if (!feed) return;

  if (state.error) {
    feed.innerHTML = renderErrorState();
    return;
  }

  if (!state.data) {
    feed.innerHTML = '<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>';
    return;
  }

  const renderers = {
    now: renderNow,
    agents: renderAgents,
    decide: renderDecide,
    log: renderLog
  };

  feed.innerHTML = (renderers[state.section] || renderNow)();
  feed.scrollTop = 0;
}

// ===========================
// NOW TAB
// ===========================
function renderNow() {
  const d = state.data;
  const now = d.lanes?.now || [];
  const alerts = (d.alerts || []).slice(0, 3);

  let html = '';

  // Focus items
  html += `<div class="section-header"><span class="section-title">Focus</span><span class="section-count">${now.length} item${now.length !== 1 ? 's' : ''}</span></div>`;

  if (now.length === 0) {
    html += `<div class="empty-state">Nothing urgent right now.</div>`;
  } else {
    now.forEach(item => {
      html += `
        <div class="focus-card">
          <p class="project-label">${esc(item.project)}</p>
          <p class="project-title">${esc(item.title)}</p>
          <p class="project-sub">${esc(item.owner)} · ${esc(item.deadline)}</p>
          <div class="project-foot">
            <span class="tag">${esc(item.status)}</span>
          </div>
        </div>
      `;
    });
  }

  // Critical alerts
  if (alerts.length > 0) {
    html += `<div class="section-header"><span class="section-title">Alerts</span><span class="section-count">${alerts.length}</span></div>`;
    alerts.forEach(alert => {
      html += `
        <div class="card alert-card">
          <p class="card-title">${esc(alert.title)}</p>
          <p class="card-sub">${esc(alert.text)}</p>
        </div>
      `;
    });
  }

  return html;
}

// ===========================
// AGENTS TAB
// ===========================
function renderAgents() {
  const agents = state.data.agents || [];

  let html = `<div class="section-header"><span class="section-title">Agents</span><span class="section-count">${agents.length}</span></div>`;

  if (agents.length === 0) {
    return html + `<div class="empty-state">No agent data.</div>`;
  }

  agents.forEach(agent => {
    const statusClass = agent.status?.toLowerCase().includes('run') ? 'active'
      : agent.status?.toLowerCase().includes('block') ? 'blocked'
      : 'idle';

    html += `
      <div class="agent-row">
        <div class="agent-icon">${agentEmoji(agent.name)}</div>
        <div class="agent-body">
          <p class="agent-name">${esc(agent.name)}</p>
          <p class="agent-task">${esc(agent.mission || agent.role || 'No current mission')}</p>
        </div>
        <div class="status-indicator">
          <div class="dot ${statusClass}"></div>
        </div>
      </div>
    `;
  });

  return html;
}

function agentEmoji(name) {
  if (!name) return '🤖';
  const n = name.toLowerCase();
  if (n.includes('swan') || n.includes('dr')) return '🦅';
  if (n.includes('luna')) return '🌙';
  if (n.includes('design')) return '🎨';
  if (n.includes('finance') || n.includes('money')) return '💰';
  return '⚡';
}

// ===========================
// DECIDE TAB
// ===========================
function renderDecide() {
  const decisions = state.data.decisions || [];
  const approvals = state.data.approvals || [];
  const all = [...decisions.slice(0, 3), ...approvals.slice(0, 2)];

  let html = `<div class="section-header"><span class="section-title">Needs your decision</span><span class="section-count">${all.length}</span></div>`;

  if (all.length === 0) {
    return html + `<div class="empty-state">No pending decisions.</div>`;
  }

  all.forEach((item, i) => {
    const title = item.title || item.item || 'Decision needed';
    const reco = item.recommendation || item.context || '';

    html += `
      <div class="decision-card">
        <p class="decision-index">#${i + 1}</p>
        <p class="decision-question">${esc(title)}</p>
        ${reco ? `<p class="decision-reco">${esc(reco)}</p>` : ''}
        <div class="decision-actions">
          <button class="btn primary">Approve</button>
          <button class="btn">Skip</button>
        </div>
      </div>
    `;
  });

  return html;
}

// ===========================
// LOG TAB
// ===========================
function renderLog() {
  const timeline = (state.data.timeline || []).slice(0, 20);

  let html = `<div class="section-header"><span class="section-title">Recent activity</span><span class="section-count">${timeline.length}</span></div>`;

  if (timeline.length === 0) {
    return html + `<div class="empty-state">No recent activity.</div>`;
  }

  html += `<div class="card" style="padding: 0 16px;">`;
  timeline.forEach(item => {
    html += `
      <div class="log-item">
        <div class="log-time">${esc(item.time || '—')}</div>
        <div class="log-body">
          <p class="log-text">${esc(item.text || item.type || '—')}</p>
          <p class="log-actor">${esc(item.actor || '')}${item.project ? ' · ' + esc(item.project) : ''}</p>
        </div>
      </div>
    `;
  });
  html += `</div>`;

  return html;
}

// ===========================
// ERROR STATE
// ===========================
function renderErrorState() {
  return `
    <div class="card" style="margin-top: 24px; text-align: center; padding: 32px 20px;">
      <p style="font-size:28px; margin-bottom:12px;">⚠️</p>
      <p class="card-title">Data not available</p>
      <p class="card-sub" style="margin-top: 6px;">Run the local server to load live data.</p>
      <code style="display:block; margin-top:16px; font-size:12px; color:#6e6e73; background:#f5f5f7; padding:10px 14px; border-radius:10px; text-align:left;">python3 -m http.server 8080</code>
    </div>
  `;
}

// ===========================
// START
// ===========================
document.addEventListener('DOMContentLoaded', init);
