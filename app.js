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
// DARK MODE TOGGLE
// ===========================
function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  const moonIcon = document.getElementById('icon-moon');
  const sunIcon = document.getElementById('icon-sun');
  if (!btn) return;

  // Load saved preference
  const saved = localStorage.getItem('mc-theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }

  function updateIcons() {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' ||
      (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (moonIcon) moonIcon.style.display = isDark ? 'none' : 'block';
    if (sunIcon)  sunIcon.style.display  = isDark ? 'block' : 'none';
  }

  updateIcons();

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const isDark = current === 'dark' ||
      (!current && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mc-theme', next);
    updateIcons();
  });
}

// ===========================
// INIT
// ===========================
async function init() {
  renderDate();
  setupTabs();
  setupRefresh();
  setupThemeToggle();

  const btn = $('#refresh-btn');
  if (btn) btn.classList.add('spinning');

  try {
    const res = await fetch('./data/dashboard.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    state.error = null;
  } catch (err) {
    state.error = err;
  }

  if (btn) btn.classList.remove('spinning');
  render();
}

function renderDate() {
  const el = $('#header-date');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).replace(/^\w/, c => c.toUpperCase());
}

function setupRefresh() {
  const btn = $('#refresh-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    state.data = null;
    state.error = null;
    const feed = $('#feed');
    if (feed) feed.innerHTML = loadingHTML();
    await init();
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

function loadingHTML() {
  return `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
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
    feed.innerHTML = loadingHTML();
    return;
  }

  const renderers = { now: renderNow, agents: renderAgents, decide: renderDecide, log: renderLog };
  feed.innerHTML = (renderers[state.section] || renderNow)();
  feed.scrollTop = 0;
}

// ===========================
// HELPERS
// ===========================
function healthColor(health) {
  if (!health) return 'gray';
  const h = health.toLowerCase();
  if (h.includes('track') || h.includes('active')) return 'green';
  if (h.includes('block')) return 'red';
  if (h.includes('risk') || h.includes('wait')) return 'orange';
  if (h.includes('launch') || h.includes('mvp')) return 'blue';
  if (h.includes('hold') || h.includes('pause')) return 'gray';
  return 'gray';
}

function projectAccentClass(project) {
  if (!project) return '';
  const p = project.toLowerCase();
  if (p.includes('gamal') || p.includes('dna')) return 'red';
  if (p.includes('luna')) return 'purple';
  if (p.includes('nuho')) return 'green';
  if (p.includes('badra') || p.includes('cosmo')) return 'orange';
  if (p.includes('syn') || p.includes('perfume')) return 'orange';
  return '';
}

function severityColor(severity) {
  if (!severity) return 'gray';
  if (severity === 'critical') return 'red';
  if (severity === 'risk') return 'orange';
  return 'blue';
}

// ===========================
// NOW TAB
// ===========================
function renderNow() {
  const d = state.data;
  const now = d.lanes?.now || [];
  const alerts = d.alerts || [];
  const kpis = d.kpis || [];

  let html = '';

  // KPI strip (first 3)
  const kpiColors = ['blue', 'green', 'red'];
  html += `<div class="kpi-strip">`;
  [
    { label: 'Projets', value: kpis[0]?.value || '—' },
    { label: 'Tâches', value: kpis[1]?.value || '—' },
    { label: 'Blocages', value: kpis[2]?.value || '—' }
  ].forEach((k, i) => {
    html += `
      <div class="kpi-card">
        <div class="kpi-value ${kpiColors[i]}">${esc(k.value)}</div>
        <div class="kpi-label">${esc(k.label)}</div>
      </div>
    `;
  });
  html += `</div>`;

  // Focus
  html += `<div class="section-header">
    <span class="section-title">Focus</span>
    <span class="section-count-pill">${now.length}</span>
  </div>`;

  if (now.length === 0) {
    html += emptyState('✅', 'Rien d\'urgent maintenant.');
  } else {
    now.forEach(item => {
      const accent = projectAccentClass(item.project);
      html += `
        <div class="focus-card ${accent}">
          <p class="project-label">${esc(item.project)}</p>
          <p class="project-title">${esc(item.title)}</p>
          <div class="project-foot">
            <span class="pill pill-gray">${esc(item.owner)}</span>
            <span class="pill pill-blue">${esc(item.deadline)}</span>
          </div>
        </div>
      `;
    });
  }

  // Alerts
  if (alerts.length > 0) {
    html += `<div class="section-header">
      <span class="section-title">Alertes</span>
      <span class="section-count-pill">${alerts.length}</span>
    </div>`;
    alerts.forEach(alert => {
      const color = severityColor(alert.severity);
      const iconMap = { red: '🚨', orange: '⚠️', blue: 'ℹ️', gray: '•' };
      const icon = iconMap[color] || '⚠️';
      const pillClass = `pill-${color}`;
      html += `
        <div class="alert-card" style="border-color: rgba(${color === 'red' ? '255,59,48' : color === 'orange' ? '255,149,0' : '0,122,255'},0.18);">
          <div class="alert-icon" style="background: ${color === 'red' ? 'var(--red)' : color === 'orange' ? 'var(--orange)' : 'var(--blue)'}; font-size:16px; width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${icon}</div>
          <div class="alert-body">
            <p class="alert-title">${esc(alert.title)}</p>
            <p class="alert-text">${esc(alert.text)}</p>
          </div>
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

  let html = `<div class="section-header">
    <span class="section-title">Agents</span>
    <span class="section-count-pill">${agents.length}</span>
  </div>`;

  if (agents.length === 0) {
    return html + emptyState('🤖', 'Aucun agent actif.');
  }

  agents.forEach(agent => {
    const statusLow = (agent.status || '').toLowerCase();
    const isRunning = statusLow.includes('run');
    const isBlocked = statusLow.includes('block');
    const badgeClass = isRunning ? 'badge-running' : isBlocked ? 'badge-blocked' : 'badge-idle';
    const dotClass  = isRunning ? 'dot-running' : isBlocked ? 'dot-blocked' : 'dot-idle';
    const statusText = isRunning ? 'Actif' : isBlocked ? 'Bloqué' : 'Inactif';

    html += `
      <div class="agent-row">
        <div class="agent-avatar">${agentEmoji(agent.name)}</div>
        <div class="agent-body">
          <p class="agent-name">${esc(agent.name)}</p>
          <p class="agent-mission">${esc(agent.mission || agent.role || '—')}</p>
        </div>
        <div class="agent-status-badge ${badgeClass}">
          <span class="status-dot ${dotClass}"></span>
          ${esc(statusText)}
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
  if (n.includes('pulse') || n.includes('project')) return '📊';
  if (n.includes('openclaw') || n.includes('workspace')) return '⚙️';
  return '⚡';
}

// ===========================
// DECIDE TAB
// ===========================
function renderDecide() {
  const decisions = state.data.decisions || [];
  const approvals = state.data.approvals || [];

  // Merge & dedupe by title
  const allRaw = [...decisions, ...approvals];
  const seen = new Set();
  const all = allRaw.filter(item => {
    const key = (item.title || item.item || '').toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);

  let html = `<div class="section-header">
    <span class="section-title">Décisions</span>
    <span class="section-count-pill">${all.length}</span>
  </div>`;

  if (all.length === 0) {
    return html + emptyState('✅', 'Aucune décision en attente.');
  }

  all.forEach((item, i) => {
    const title = item.title || item.item || 'Décision requise';
    const reco  = item.recommendation || item.context || '';
    const impact = item.impact || '';
    const urgency = item.urgency || item.deadline || '';

    html += `
      <div class="decision-card">
        <p class="decision-number">Décision #${i + 1}</p>
        <p class="decision-question">${esc(title)}</p>
        ${impact ? `<div class="decision-meta"><span class="pill pill-blue">${esc(urgency)}</span><span class="pill pill-gray">Impact: ${esc(impact)}</span></div>` : ''}
        ${reco ? `<div class="decision-reco">${esc(reco)}</div>` : ''}
        <div class="decision-actions">
          <button class="btn primary">Approuver</button>
          <button class="btn">Différer</button>
          <button class="btn danger">Rejeter</button>
        </div>
      </div>
    `;
  });

  return html;
}

// ===========================
// LOG TAB — Projects + Timeline
// ===========================
function renderLog() {
  const projects = (state.data.projects || []).filter(p => p.health && p.health !== 'Unknown');
  const timeline = (state.data.timeline || [])
    .filter(t => t.time && t.time !== 'unknown')
    .slice(0, 15);

  let html = '';

  // Projects quick view
  if (projects.length > 0) {
    html += `<div class="section-header">
      <span class="section-title">Projets</span>
      <span class="section-count-pill">${projects.length}</span>
    </div>`;

    projects.forEach(p => {
      const color = healthColor(p.health);
      const colorMap = { green: '#34c759', red: '#ff3b30', orange: '#ff9500', blue: '#007aff', gray: '#aeaeb2' };
      const dotColor = colorMap[color] || colorMap.gray;

      html += `
        <div class="project-card">
          <div class="project-color-dot" style="background: ${dotColor};"></div>
          <div class="project-body">
            <p class="project-name">${esc(p.name)}</p>
            <p class="project-role">${esc(p.role || p.phase || '')}</p>
            <div class="project-meta">
              <span class="pill pill-${color}">${esc(p.health)}</span>
              ${p.priority && p.priority !== 'Unknown' ? `<span class="pill pill-gray">${esc(p.priority)}</span>` : ''}
              ${p.revenue ? `<span class="pill pill-green">${esc(p.revenue)}</span>` : ''}
            </div>
            ${p.next_step ? `<div class="project-next"><strong>Next:</strong> ${esc(p.next_step)}</div>` : ''}
          </div>
        </div>
      `;
    });
  }

  // Timeline
  if (timeline.length > 0) {
    html += `<div class="section-header">
      <span class="section-title">Activité</span>
      <span class="section-count-pill">${timeline.length}</span>
    </div>`;

    html += `<div class="timeline-group">`;
    timeline.forEach(item => {
      const typeColors = {
        'Blocker': '#ff3b30', 'Output': '#34c759',
        'Decision': '#007aff', 'Log': '#aeaeb2'
      };
      const dotColor = typeColors[item.type] || '#aeaeb2';
      html += `
        <div class="log-item">
          <div class="log-type-dot" style="background: ${dotColor};"></div>
          <div class="log-time">${esc(item.time)}</div>
          <div class="log-body">
            <p class="log-text">${esc(item.text || item.type || '—')}</p>
            <p class="log-actor">${esc(item.actor || '')}${item.project ? ' · ' + esc(item.project) : ''}</p>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (!projects.length && !timeline.length) {
    html += emptyState('📋', 'Aucune activité récente.');
  }

  return html;
}

// ===========================
// EMPTY & ERROR STATES
// ===========================
function emptyState(icon, text) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <p>${esc(text)}</p>
    </div>
  `;
}

function renderErrorState() {
  return `
    <div class="error-card">
      <div class="error-icon">⚠️</div>
      <p class="error-title">Données indisponibles</p>
      <p class="error-sub">Lance le serveur local pour charger les données live.</p>
      <code class="error-code">cd Mission-Control-Mobile<br>python3 -m http.server 8080</code>
    </div>
  `;
}

// ===========================
// START
// ===========================
document.addEventListener('DOMContentLoaded', init);
