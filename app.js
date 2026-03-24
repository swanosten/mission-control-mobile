const state = {
  section: 'live',
  projectSlug: null,
  data: null,
  error: null
};

const $ = (sel) => document.querySelector(sel);

function esc(val) {
  return String(val ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

async function init() {
  renderDate();
  setupThemeToggle();
  setupTabs();
  setupRefresh();
  await loadData();
  render();
}

async function loadData() {
  const btn = $('#refresh-btn');
  if (btn) btn.classList.add('spinning');

  try {
    const res = await fetch('./data/dashboard.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    state.error = null;
  } catch (err) {
    state.error = err;
    state.data = null;
  }

  if (btn) btn.classList.remove('spinning');
}

function renderDate() {
  const el = $('#header-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('en-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

function setupThemeToggle() {
  const btn = $('#theme-toggle');
  const icon = $('#theme-icon');
  const saved = localStorage.getItem('mc-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

  const refreshIcon = () => {
    const theme = currentTheme();
    if (icon) icon.textContent = theme === 'dark' ? '◑' : '◐';
  };

  refreshIcon();
  btn?.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('mc-theme', next);
    refreshIcon();
  });
}

function currentTheme() {
  const forced = document.documentElement.getAttribute('data-theme');
  if (forced) return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.section = tab.dataset.section;
      if (state.section !== 'projects') state.projectSlug = null;
      render();
    });
  });
}

function setupRefresh() {
  $('#refresh-btn')?.addEventListener('click', async () => {
    $('#feed').innerHTML = loadingHTML();
    await loadData();
    render();
  });
}

function loadingHTML() {
  return `<div class="loading-state"><div class="loading-dots"><span></span><span></span><span></span></div></div>`;
}

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

  const routes = {
    live: renderLive,
    projects: renderProjects,
    agent: renderAgent,
    decisions: renderDecisions
  };

  feed.innerHTML = (routes[state.section] || renderLive)();
  wireInteractions();
  feed.scrollTop = 0;
}

function wireInteractions() {
  document.querySelectorAll('[data-project-open]').forEach(btn => {
    btn.onclick = () => {
      state.section = 'projects';
      state.projectSlug = btn.dataset.projectOpen;
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.section === 'projects'));
      render();
    };
  });

  $('#back-to-projects')?.addEventListener('click', () => {
    state.projectSlug = null;
    render();
  });
}

function sectionTitle(title, meta = '') {
  return `
    <div class="section-head">
      <h2>${esc(title)}</h2>
      ${meta ? `<span class="section-meta">${esc(meta)}</span>` : ''}
    </div>
  `;
}

function cardShell(label, title, body = '', extraClass = '') {
  return `
    <section class="card ${extraClass}">
      ${label ? `<p class="card-label">${esc(label)}</p>` : ''}
      <h3 class="card-title">${esc(title)}</h3>
      ${body}
    </section>
  `;
}

function statusTone(status = '') {
  const s = status.toLowerCase();
  if (s.includes('block')) return 'blocked';
  if (s.includes('wait')) return 'waiting';
  if (s.includes('risk')) return 'risk';
  if (s.includes('track') || s.includes('active') || s.includes('launch') || s.includes('ready') || s.includes('run')) return 'working';
  return 'neutral';
}

function prettyStatus(status = '') {
  const tone = statusTone(status);
  return tone === 'blocked' ? 'Blocked' : tone === 'waiting' ? 'Waiting' : tone === 'risk' ? 'At risk' : tone === 'working' ? 'Working' : 'Unknown';
}

function statusPill(status) {
  const tone = statusTone(status);
  return `<span class="pill pill-${tone}">${esc(prettyStatus(status))}</span>`;
}

function deriveLiveSignal(d) {
  const timeline = d.timeline || [];
  const tasks = d.tasks || [];
  const projects = d.projects || [];
  const approvals = d.approvals || [];

  const latestDelivery = timeline.find(item => ['Output', 'Decision'].includes(item.type) && !String(item.text || '').includes('Heartbeat check'));
  const currentProject = projects.find(p => /instagram/i.test(p.name || '')) || projects.find(p => /gamal/i.test(p.name || '')) || projects[0];
  const waitingDecision = timeline.find(item => /en attente|validation|feedback/i.test((item.text || '').toLowerCase()));
  const topBlocker = projects.find(p => statusTone(p.health || p.status) === 'blocked') || projects.find(p => statusTone(p.health || p.status) === 'waiting');
  const actionableApproval = approvals[0];
  const currentTask = tasks[0];

  const liveStatus = waitingDecision ? 'waiting' : topBlocker ? 'blocked' : currentTask ? 'working' : 'neutral';

  return {
    status: liveStatus,
    title: waitingDecision
      ? 'Waiting on Elias'
      : currentTask
        ? currentTask.title
        : 'No live task signal available',
    project: waitingDecision?.project && waitingDecision.project !== 'Unknown'
      ? waitingDecision.project
      : currentTask?.project || currentProject?.name || 'Unknown project',
    summary: waitingDecision
      ? 'The latest concrete state shows delivered work awaiting Elias validation.'
      : currentTask
        ? 'Current focus is inferred from local notes, not a direct live runtime feed.'
        : 'The repo has local project and memory data, but no reliable current-task telemetry yet.',
    progress: latestDelivery?.text || currentProject?.next_step || 'No concrete recent output found in local sources.',
    ask: actionableApproval?.item || actionableApproval?.recommendation || 'No explicit ask captured right now.',
    blocker: topBlocker
      ? `${topBlocker.name}: ${topBlocker.next_step || topBlocker.status || topBlocker.health}`
      : 'No blocker explicitly captured in structured data.',
    confidence: waitingDecision || latestDelivery ? 'Derived from local logs' : 'Structure ready, live telemetry missing'
  };
}

function renderLive() {
  const d = state.data;
  const live = deriveLiveSignal(d);
  const projects = (d.projects || []).filter(p => p.health && p.health !== 'Unknown');
  const priorities = projects.slice().sort((a, b) => {
    const order = { blocked: 0, waiting: 1, risk: 2, working: 3, neutral: 4 };
    return order[statusTone(a.health || a.status)] - order[statusTone(b.health || b.status)];
  }).slice(0, 3);

  let html = '';
  html += `
    <section class="hero card tone-${esc(live.status)}">
      <div class="hero-top">
        <div>
          <p class="card-label">Live</p>
          <h2 class="hero-title">${esc(live.title)}</h2>
          <p class="hero-project">${esc(live.project)}</p>
        </div>
        ${statusPill(live.status)}
      </div>
      <p class="hero-summary">${esc(live.summary)}</p>
      <div class="hero-grid">
        <div class="hero-block">
          <span>Last concrete progress</span>
          <strong>${esc(live.progress)}</strong>
        </div>
        <div class="hero-block">
          <span>Need from Elias</span>
          <strong>${esc(live.ask)}</strong>
        </div>
        <div class="hero-block">
          <span>Blocker</span>
          <strong>${esc(live.blocker)}</strong>
        </div>
        <div class="hero-block">
          <span>Signal quality</span>
          <strong>${esc(live.confidence)}</strong>
        </div>
      </div>
    </section>
  `;

  html += sectionTitle('Priority projects', `${priorities.length} visible`);
  html += priorities.length ? priorities.map(project => `
    <button class="project-row card" data-project-open="${esc(project.slug)}">
      <div class="row-head">
        <div>
          <h3 class="row-title">${esc(project.name)}</h3>
          <p class="row-subtitle">${esc(project.phase || project.role || 'Project')}</p>
        </div>
        ${statusPill(project.health || project.status)}
      </div>
      <p class="row-text">${esc(project.next_step || project.goal || 'No next step captured.')}</p>
    </button>
  `).join('') : emptyState('No priority projects available.');

  const recent = (d.timeline || []).filter(item => !String(item.text || '').includes('Heartbeat check')).slice(0, 4);
  html += sectionTitle('Recent signal', recent.length ? 'Concrete only' : 'None');
  html += recent.length ? `<section class="stack">${recent.map(item => `
    <article class="timeline-item card-lite">
      <div class="timeline-meta">
        <span>${esc(item.time || 'Unknown')}</span>
        <span>${esc(item.actor || 'System')}</span>
      </div>
      <p>${esc(item.text || '—')}</p>
    </article>`).join('')}</section>` : emptyState('No recent operational signal found.');

  return html;
}

function renderProjects() {
  const projects = (state.data.projects || []).filter(p => (p.name || '').trim());
  const tasks = state.data.tasks || [];
  const timeline = state.data.timeline || [];

  if (state.projectSlug) {
    const project = projects.find(p => p.slug === state.projectSlug);
    if (!project) {
      state.projectSlug = null;
      return renderProjects();
    }

    const relatedTasks = tasks.filter(task => isTaskRelatedToProject(task, project));
    const relatedEvents = timeline.filter(item => isTimelineRelatedToProject(item, project)).slice(0, 5);

    return `
      <div class="section-head detail-head">
        <button class="back-button" id="back-to-projects">← Projects</button>
      </div>
      <section class="card detail-card">
        <div class="row-head">
          <div>
            <p class="card-label">Project</p>
            <h2 class="detail-title">${esc(project.name)}</h2>
            <p class="detail-subtitle">${esc(project.phase || project.role || 'Project')}</p>
          </div>
          ${statusPill(project.health || project.status)}
        </div>
        <div class="detail-grid">
          <div><span>Owner</span><strong>${esc(project.owner || 'Unknown')}</strong></div>
          <div><span>Priority</span><strong>${esc(project.priority || 'Unknown')}</strong></div>
          <div><span>Timeline</span><strong>${esc(project.timeline || 'Unknown')}</strong></div>
          <div><span>Revenue</span><strong>${esc(project.revenue || 'Unknown')}</strong></div>
        </div>
        ${project.goal ? `<div class="detail-panel"><span>Goal</span><strong>${esc(project.goal)}</strong></div>` : ''}
        <div class="detail-panel"><span>Next step</span><strong>${esc(project.next_step || 'No next step captured.')}</strong></div>
        <div class="detail-panel"><span>Blocker / risk</span><strong>${esc(project.note || project.risk || 'No explicit blocker captured.')}</strong></div>
      </section>

      ${sectionTitle('Tasks', `${relatedTasks.length} linked`)}
      ${relatedTasks.length ? relatedTasks.map(task => `
        <section class="card-lite task-card">
          <div class="row-head compact">
            <h3 class="row-title">${esc(task.title)}</h3>
            ${statusPill(task.status)}
          </div>
          <p class="row-subtitle">${esc(task.owner || 'Unknown owner')} · ${esc(task.deadline || 'No deadline')}</p>
          <p class="row-text">${esc(task.next || 'No next step captured.')}</p>
          ${task.blocker ? `<p class="minor-text">Blocker: ${esc(task.blocker)}</p>` : ''}
        </section>
      `).join('') : emptyState('No linked tasks yet.')}

      ${sectionTitle('Recent project signal', `${relatedEvents.length} items`)}
      ${relatedEvents.length ? relatedEvents.map(item => `
        <article class="card-lite timeline-item">
          <div class="timeline-meta">
            <span>${esc(item.time || 'Unknown')}</span>
            <span>${esc(item.type || 'Log')}</span>
          </div>
          <p>${esc(item.text || '—')}</p>
        </article>
      `).join('') : emptyState('No recent timeline entries matched this project.')}
    `;
  }

  const sorted = projects.slice().sort((a, b) => {
    const order = { blocked: 0, waiting: 1, risk: 2, working: 3, neutral: 4 };
    return order[statusTone(a.health || a.status)] - order[statusTone(b.health || b.status)];
  });

  return `
    ${sectionTitle('Projects', `${sorted.length} tracked`)}
    ${sorted.map(project => `
      <button class="card project-row" data-project-open="${esc(project.slug)}">
        <div class="row-head">
          <div>
            <h3 class="row-title">${esc(project.name)}</h3>
            <p class="row-subtitle">${esc(project.phase || project.role || 'Project')}</p>
          </div>
          ${statusPill(project.health || project.status)}
        </div>
        <p class="row-text">${esc(project.next_step || project.goal || 'No next step captured.')}</p>
      </button>
    `).join('')}
  `;
}

function renderAgent() {
  const agent = (state.data.agents || []).find(a => /dr\. swanosten/i.test(a.name || '')) || state.data.agents?.[0];
  const live = deriveLiveSignal(state.data);
  if (!agent) return emptyState('No agent data available.');

  return `
    ${sectionTitle('Agent', 'Dr. Swanosten only')}
    <section class="card agent-hero">
      <div class="row-head">
        <div>
          <p class="card-label">Operator</p>
          <h2 class="detail-title">Dr. Swanosten</h2>
          <p class="detail-subtitle">${esc(agent.role || 'Chief operator')}</p>
        </div>
        ${statusPill(agent.status)}
      </div>
      <p class="hero-summary">${esc(agent.mission || 'Prioritize, structure, execute.')}</p>
    </section>

    <details class="accordion" open>
      <summary>Mission</summary>
      <div class="accordion-body">
        <p>${esc(agent.mission || 'No mission captured.')}</p>
      </div>
    </details>
    <details class="accordion">
      <summary>Live organization</summary>
      <div class="accordion-body">
        <p><strong>Current status:</strong> ${esc(prettyStatus(agent.status))}</p>
        <p><strong>Current signal:</strong> ${esc(live.title)}</p>
        <p><strong>Latest output:</strong> ${esc(agent.output || 'No output captured.')}</p>
        <p><strong>Escalations:</strong> ${esc(agent.escalations || 'Unknown')}</p>
        <p><strong>Blockers:</strong> ${esc(agent.blockers || 'None captured')}</p>
      </div>
    </details>
    <details class="accordion">
      <summary>Folders</summary>
      <div class="accordion-body mono-list">
        <p>/Users/swanosten/Desktop/OBSIDIAN/swanosten/Agent/Dr-Swanosten</p>
        <p>/Users/swanosten/Desktop/OBSIDIAN/swanosten/Memory</p>
        <p>/Users/swanosten/Desktop/OBSIDIAN/swanosten/Memory/memory</p>
      </div>
    </details>
    <details class="accordion">
      <summary>Memory & logs</summary>
      <div class="accordion-body">
        <p>Shared memory lives in the Obsidian vault and is used as the current source of truth for project, decision and delivery signals.</p>
      </div>
    </details>
    <details class="accordion">
      <summary>Runtime</summary>
      <div class="accordion-body mono-list">
        <p>${esc(agent.source || 'Unknown source')}</p>
        <p>${esc(agent.throughput || 'Unknown throughput')}</p>
        <p>${esc(agent.cost || 'Unknown cost')}</p>
      </div>
    </details>
  `;
}

function renderDecisions() {
  const items = [...(state.data.approvals || []), ...(state.data.decisions || [])]
    .filter(Boolean)
    .filter((item, index, arr) => index === arr.findIndex(other => (other.item || other.title) === (item.item || item.title)))
    .slice(0, 6);

  return `
    ${sectionTitle('Decisions', `${items.length} pending`)}
    ${items.length ? items.map((item, index) => {
      const title = item.item || item.title || 'Decision required';
      const recommendation = item.recommendation || item.context || 'No recommendation captured.';
      const deadline = item.deadline || item.urgency || 'No timing captured';
      const impact = item.impact || item.type || 'Unknown impact';
      return `
        <section class="card decision-card">
          <p class="card-label">Decision ${index + 1}</p>
          <h3 class="card-title">${esc(title)}</h3>
          <div class="decision-meta">
            <span class="pill pill-neutral">${esc(deadline)}</span>
            <span class="pill pill-neutral">${esc(impact)}</span>
          </div>
          <p class="row-text">${esc(recommendation)}</p>
          <div class="decision-actions">
            <button class="action-button action-primary" type="button">Approve</button>
            <button class="action-button" type="button">Hold</button>
            <button class="action-button" type="button">Reject</button>
          </div>
        </section>
      `;
    }).join('') : emptyState('No decisions pending.')}
  `;
}

function isTaskRelatedToProject(task, project) {
  const taskProject = (task.project || '').toLowerCase();
  const projectName = (project.name || '').toLowerCase();
  const slugBits = (project.slug || '').toLowerCase().split('-').filter(Boolean);
  return !!taskProject && (projectName.includes(taskProject) || taskProject.includes(projectName) || slugBits.some(bit => bit.length > 3 && taskProject.includes(bit)));
}

function isTimelineRelatedToProject(item, project) {
  const itemProject = (item.project || '').toLowerCase();
  const projectName = (project.name || '').toLowerCase();
  const slugBits = (project.slug || '').toLowerCase().split('-').filter(Boolean);
  return itemProject && (projectName.includes(itemProject) || itemProject.includes(projectName) || slugBits.some(bit => bit.length > 3 && itemProject.includes(bit)));
}

function emptyState(text) {
  return `<section class="empty-state"><p>${esc(text)}</p></section>`;
}

function renderErrorState() {
  return `
    <section class="card error-card">
      <p class="card-label">Data</p>
      <h2 class="card-title">Unable to load local data</h2>
      <p class="row-text">Run a local server so the static app can fetch JSON files.</p>
      <pre class="code-block">python3 -m http.server 8080</pre>
    </section>
  `;
}

document.addEventListener('DOMContentLoaded', init);
