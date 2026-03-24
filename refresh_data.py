#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parent
VAULT_DIR = PROJECT_DIR.parent.parent
DATA_DIR = APP_DIR / 'data'

PROJECTS_MD = VAULT_DIR / 'EliasOS' / '02_PROJECTS.md'
FOCUS_MD = VAULT_DIR / 'EliasOS' / '06_CURRENT_FOCUS.md'
MEMORY_DIR = VAULT_DIR / 'Memory' / 'memory'
LONG_MEMORY_MD = VAULT_DIR / 'Memory' / 'MEMORY.md'
OPENCLAW_WORKSPACE_STATE = VAULT_DIR / '.openclaw' / 'workspace-state.json'
AGENT_WORKSPACE_STATE = VAULT_DIR / 'Agent' / 'Dr-Swanosten' / '.openclaw' / 'workspace-state.json'
BLUEPRINT_MD = PROJECT_DIR / 'dashboard_blueprint_v1.md'

NOW = datetime.now()
TODAY = NOW.strftime('%Y-%m-%d')
YESTERDAY = datetime.fromtimestamp(max(0, NOW.timestamp() - 86400)).strftime('%Y-%m-%d')

KNOWN_PROJECTS = [
    'Instagram / Elias Nieto',
    'Gamal Marwan (DNA)',
    'Badra / Cosmopolitan Move',
    'Luna Chatting',
    'Synestesia',
    'Quantum Agency',
    'Nuho',
    'Nightcall Studio',
    'Vojood'
]


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8') if path.exists() else ''


def load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding='utf-8'))


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r'[^a-z0-9]+', '-', value)
    return value.strip('-') or 'unknown'


def extract_table_rows(md: str) -> List[Dict[str, str]]:
    rows = []
    lines = [line.rstrip() for line in md.splitlines()]
    in_table = False
    headers = []
    for line in lines:
        if line.startswith('|') and line.endswith('|'):
            parts = [p.strip() for p in line.strip('|').split('|')]
            if not in_table:
                headers = parts
                in_table = True
                continue
            if set(''.join(parts)) <= {'-', ':'}:
                continue
            if headers:
                rows.append({headers[i]: parts[i] if i < len(parts) else '' for i in range(len(headers))})
        elif in_table and rows:
            break
    return rows


def parse_project_sections(md: str) -> List[Dict[str, Any]]:
    sections = re.split(r'\n###\s+', md)
    projects = []
    priority_map = {}
    for row in extract_table_rows(md):
        priority_map[normalize_project_name(row.get('Project', ''))] = row

    for raw in sections[1:]:
        lines = raw.splitlines()
        title = clean_project_title(lines[0].strip())
        body = '\n'.join(lines[1:]).strip()
        project = {
            'name': title,
            'slug': slugify(title),
            'status': extract_field(body, 'Status'),
            'role': extract_field(body, 'Your role') or extract_field(body, 'Rôle'),
            'goal': extract_field(body, 'Goal'),
            'revenue': extract_field(body, 'Revenue') or extract_field(body, 'Expected revenue'),
            'next_step': extract_field(body, 'Next step') or extract_field(body, 'Next steps'),
            'note': extract_field(body, 'Note'),
            'timeline': '',
            'priority': 'Unknown',
            'phase': 'Unknown',
            'health': infer_health(extract_field(body, 'Status')),
            'potential': 'unknown',
            'risk': infer_risk(extract_field(body, 'Status'), body),
            'effort': infer_effort(body),
            'owner': infer_owner(title, body),
            'milestone': extract_milestone(body),
            'last_output': 'unknown',
            'source_file': str(PROJECTS_MD.relative_to(VAULT_DIR))
        }
        row = priority_map.get(normalize_project_name(title))
        if row:
            project['priority'] = strip_md(row.get('Priority', 'Unknown'))
            project['timeline'] = strip_md(row.get('Timeline', ''))
            project['revenue'] = strip_md(row.get('Revenue', project['revenue'] or 'unknown'))
        project['phase'] = infer_phase(project)
        project['potential'] = project['revenue'] or 'unknown'
        projects.append(project)
    return projects


def strip_md(value: str) -> str:
    return value.replace('**', '').strip()


def clean_project_title(value: str) -> str:
    value = strip_md(value)
    value = re.sub(r'^\d+\.\s*', '', value)
    return value.strip()


def normalize_project_name(value: str) -> str:
    value = clean_project_title(value)
    value = re.sub(r'\([^)]*\)', '', value)
    value = value.replace('—', ' ').replace('/', ' ').replace('-', ' ')
    aliases = {
        'instagram elias nieto personal brand': 'instagram elias nieto',
        'gamal marwan dna longevity wellness': 'gamal marwan dna',
        'gamal marwan dna': 'gamal marwan dna',
        'luna chatting onlyfans crm': 'luna chatting',
        'quantum agency clients actifs': 'quantum agency',
        'nuho vitamins baseone': 'nuho',
        'synestesia perfume with dariane lukas': 'synestesia'
    }
    lowered = ' '.join(value.lower().split())
    lowered = aliases.get(lowered, lowered)
    return re.sub(r'[^a-z0-9]+', '', lowered)


def extract_field(body: str, label: str) -> str:
    patterns = [
        rf'^\s*\*\*{re.escape(label)}:?\*\*\s*(.+)$',
        rf'^\s*\*\*{re.escape(label)}\*\*:?\s*(.+)$',
        rf'^\s*{re.escape(label)}\s*:\s*(.+)$'
    ]
    for pattern in patterns:
        match = re.search(pattern, body, re.IGNORECASE | re.MULTILINE)
        if match:
            return strip_md(match.group(1).strip().lstrip('- ').strip())
    return ''


def infer_health(status: str) -> str:
    s = (status or '').lower()
    if 'waiting for payment' in s or 'blocked' in s:
        return 'Blocked'
    if 'on hold' in s:
        return 'Waiting external'
    if 'discussion' in s:
        return 'At risk'
    if 'launch' in s or 'active' in s or 'mvp' in s:
        return 'On track'
    return 'Unknown'


def infer_risk(status: str, body: str) -> str:
    text = f"{status} {body}".lower()
    if 'payment' in text or 'sensitive' in text or 'on hold' in text:
        return 'High'
    if 'discussion' in text or 'limited time' in text or 'launch' in text:
        return 'Medium'
    return 'Unknown'


def infer_effort(body: str) -> str:
    text = body.lower()
    if 'website' in text or 'content generation' in text or 'social media' in text:
        return 'High'
    if 'follow up' in text or 'call' in text or 'discuss' in text:
        return 'Low'
    return 'Medium'


def infer_owner(title: str, body: str) -> str:
    title_l = title.lower()
    if 'luna' in title_l:
        return 'Elias + partners'
    if 'badra' in title_l:
        return 'Elias + Badra'
    if 'quantum' in title_l:
        return 'Quantum'
    if 'instagram' in title_l or 'elias' in title_l:
        return 'Elias'
    return extract_field(body, 'Your role') or 'Elias'


def extract_milestone(body: str) -> str:
    next_step = extract_field(body, 'Next step') or extract_field(body, 'Next steps')
    if next_step:
        return next_step
    for line in body.splitlines():
        line = line.strip('- ').strip()
        if not line:
            continue
        if any(token in line.lower() for token in ['mvp goes live', 'get paid', 'call to organize', 'formalize agreement', 'presentation', 'testing']):
            return strip_md(line)
    return 'unknown'


def infer_phase(project: Dict[str, Any]) -> str:
    status = (project.get('status') or '').lower()
    if 'payment' in status:
        return 'Payment recovery'
    if 'launch' in status or 'mvp' in status:
        return 'Launch'
    if 'discussion' in status:
        return 'Discovery'
    if 'on hold' in status:
        return 'Paused'
    if 'active' in status:
        return 'Execution'
    return 'Unknown'


def parse_focus_tasks(md: str) -> List[Dict[str, Any]]:
    tasks = []
    current_heading = 'General'
    for line in md.splitlines():
        if line.startswith('### '):
            current_heading = line.replace('### ', '').strip()
            continue
        match = re.match(r'- \[( |x)\] \*\*(.+?)\*\*\s+—\s+(.+)', line)
        if match:
            checked, project_name, title = match.groups()
            tasks.append({
                'title': title.strip(),
                'project': project_name.strip(),
                'owner': 'Elias',
                'priority': section_to_priority(current_heading),
                'status': 'Done' if checked == 'x' else 'Ready',
                'deadline': 'This week',
                'next': title.strip(),
                'blocker': '',
                'since': '',
                'source': str(FOCUS_MD.relative_to(VAULT_DIR))
            })
    return tasks


def section_to_priority(section: str) -> str:
    section = section.lower()
    if 'must' in section:
        return 'P0'
    if 'should' in section:
        return 'P1'
    if 'could' in section:
        return 'P2'
    return 'P3'


def parse_memory_events(paths: List[Path]) -> List[Dict[str, Any]]:
    events = []
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf-8').splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            time_match = re.search(r'(\d{1,2}:\d{2})', stripped)
            if stripped.startswith('- ') or stripped.startswith('## ') or time_match:
                event = make_timeline_event(stripped, path)
                if event:
                    events.append(event)
    return events[:120]


def make_timeline_event(line: str, path: Path) -> Dict[str, Any] | None:
    clean = line.lstrip('- ').strip()
    tm = re.search(r'(\d{1,2}:\d{2})', clean)
    time_value = tm.group(1) if tm else 'unknown'
    text = re.sub(r'^\[?\d{1,2}:\d{2}\]?\s*', '', clean).strip()
    actor = 'System'
    if 'heartbeat' in text.lower():
        actor = 'Heartbeat'
    elif 'dr. swanosten' in text.lower():
        actor = 'Dr. Swanosten'
    elif 'telegram' in text.lower():
        actor = 'Telegram'
    elif 'pdf' in text.lower():
        actor = 'Delivery'
    event_type = infer_event_type(text)
    project = infer_project_from_text(text)
    return {
        'time': time_value,
        'actor': actor,
        'type': event_type,
        'project': project,
        'text': text,
        'source': str(path.relative_to(VAULT_DIR))
    }


def infer_event_type(text: str) -> str:
    value = text.lower()
    if 'blocked' in value or 'could not' in value:
        return 'Blocker'
    if 'sent' in value or 'envoy' in value or 'export' in value or 'créée' in value:
        return 'Output'
    if 'check' in value:
        return 'Review'
    if 'approved' in value or 'validation' in value:
        return 'Decision'
    return 'Log'


def infer_project_from_text(text: str) -> str:
    for project in KNOWN_PROJECTS:
        root = project.split('(')[0].strip().lower()
        if root and root in text.lower():
            return project
    if 'presentation' in text.lower() or 'mediakit' in text.lower() or 'elias nieto' in text.lower() or 'eana' in text.lower():
        return 'Instagram / Elias Nieto'
    if 'heartbeat' in text.lower():
        return 'Operations'
    return 'Unknown'


def build_agent_data(projects: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    workspace_state = load_json(OPENCLAW_WORKSPACE_STATE)
    agent_state = load_json(AGENT_WORKSPACE_STATE)
    heartbeat_count = sum(1 for e in events if e['actor'] == 'Heartbeat')
    blocked_notes = [e for e in events if e['type'] == 'Blocker']
    return [
        {
            'name': 'Dr. Swanosten',
            'role': 'Chief operator',
            'status': 'Running' if agent_state.get('setupCompletedAt') else 'Unknown',
            'mission': 'Prioritize, structure, push approvals',
            'output': f"Workspace ready since {agent_state.get('setupCompletedAt', 'unknown')}",
            'cost': 'unknown',
            'throughput': f"{heartbeat_count} heartbeat logs captured", 
            'escalations': f"{len(blocked_notes)} blockers in memory logs",
            'blockers': 'Needs richer session telemetry from OpenClaw logs',
            'source': str(AGENT_WORKSPACE_STATE.relative_to(VAULT_DIR)) if AGENT_WORKSPACE_STATE.exists() else 'missing'
        },
        {
            'name': 'OpenClaw workspace',
            'role': 'Runtime bootstrap',
            'status': 'Running' if workspace_state.get('onboardingCompletedAt') else 'Unknown',
            'mission': 'Keep the local workspace paired and initialized',
            'output': f"Onboarding completed at {workspace_state.get('onboardingCompletedAt', 'unknown')}",
            'cost': 'unknown',
            'throughput': 'unknown',
            'escalations': 'unknown',
            'blockers': 'Only bootstrap snapshot available locally',
            'source': str(OPENCLAW_WORKSPACE_STATE.relative_to(VAULT_DIR)) if OPENCLAW_WORKSPACE_STATE.exists() else 'missing'
        },
        {
            'name': 'Project pulse',
            'role': 'Derived local monitor',
            'status': 'Running',
            'mission': 'Aggregate project and task signals from the vault',
            'output': f"{len(projects)} projects parsed from EliasOS", 
            'cost': '0 backend',
            'throughput': f"{sum(1 for p in projects if p['health'] != 'Unknown')} projects with health", 
            'escalations': f"{sum(1 for p in projects if p['risk'] == 'High')} high-risk projects",
            'blockers': 'Missing per-agent OpenClaw session snapshots',
            'source': str(PROJECTS_MD.relative_to(VAULT_DIR))
        }
    ]


def build_approvals(projects: List[Dict[str, Any]], tasks: List[Dict[str, Any]], focus_md: str) -> List[Dict[str, Any]]:
    approvals = []
    if any('gamal' in p['name'].lower() and 'payment' in (p.get('status') or '').lower() for p in projects):
        approvals.append({
            'item': 'Gamal payment escalation',
            'type': 'client-facing',
            'urgency': 'Critical',
            'deadline': 'This week',
            'impact': 'Protect 10K CHF/month cash flow',
            'context': 'Project status is still waiting for payment in EliasOS.',
            'recommendation': 'Escalate payment follow-up before new deliverables.',
            'overdue': False,
            'source': str(PROJECTS_MD.relative_to(VAULT_DIR))
        })
    if 'Point Luna Chatting' in focus_md or 'Luna' in focus_md:
        approvals.append({
            'item': 'Luna MVP status review',
            'type': 'strategy',
            'urgency': 'High',
            'deadline': 'This week',
            'impact': 'Keeps MVP launch on end-of-month track',
            'context': 'Current focus explicitly asks for a Luna point on MVP state.',
            'recommendation': 'Review MVP blockers and confirm testing cadence.',
            'overdue': False,
            'source': str(FOCUS_MD.relative_to(VAULT_DIR))
        })
    for task in tasks:
        if task['status'] == 'Ready' and task['priority'] in {'P0', 'P1'}:
            approvals.append({
                'item': f"Decision needed: {task['title']}",
                'type': 'priority',
                'urgency': 'Medium' if task['priority'] == 'P1' else 'High',
                'deadline': task['deadline'],
                'impact': f"Moves {task['project']} forward",
                'context': f"Pulled from current focus under {task['project']}.",
                'recommendation': f"Clarify owner and next step for {task['title']}",
                'overdue': False,
                'source': task['source']
            })
    return approvals[:8]


def build_alerts(projects: List[Dict[str, Any]], approvals: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    alerts = []
    for project in projects:
        if project['health'] in {'Blocked', 'At risk', 'Waiting external'}:
            alerts.append({
                'title': f"{project['name']} — {project['health']}",
                'text': project.get('next_step') or project.get('goal') or 'unknown',
                'severity': 'critical' if project['risk'] == 'High' else 'risk'
            })
    if any(e['type'] == 'Blocker' for e in events):
        alerts.append({
            'title': 'Ops friction in daily logs',
            'text': 'Local memory logs show repeated blockers during heartbeat checks.',
            'severity': 'risk'
        })
    if not approvals:
        alerts.append({
            'title': 'No approvals source found',
            'text': 'Approval inbox is empty because no explicit approval files were found locally.',
            'severity': 'risk'
        })
    return alerts[:6]


def build_lanes(tasks: List[Dict[str, Any]], approvals: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    now, next_items, later = [], [], []
    for task in tasks:
        item = {
            'title': task['title'],
            'owner': task['owner'],
            'project': task['project'],
            'deadline': task['deadline'],
            'status': task['status']
        }
        if task['priority'] == 'P0':
            now.append(item)
        elif task['priority'] == 'P1':
            next_items.append(item)
        else:
            later.append(item)
    for approval in approvals[:2]:
        now.append({
            'title': approval['item'],
            'owner': 'Elias',
            'project': infer_project_from_text(approval['item']),
            'deadline': approval['deadline'],
            'status': 'Waiting approval'
        })
    return {'now': now[:3], 'next': next_items[:3], 'later': later[:3]}


def build_decisions(approvals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    decisions = []
    for approval in approvals[:4]:
        decisions.append({
            'title': approval['item'],
            'impact': approval['impact'],
            'deadline': approval['deadline'],
            'options': ['Approve', 'Change direction', 'Defer'],
            'recommendation': approval['recommendation']
        })
    return decisions


def build_impact(projects: List[Dict[str, Any]], tasks: List[Dict[str, Any]], events: List[Dict[str, Any]], approvals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    active_projects = sum(1 for p in projects if p['status'])
    blocked_projects = sum(1 for p in projects if p['health'] in {'Blocked', 'At risk', 'Waiting external'})
    return [
        {'label': 'Projects tracked', 'value': str(active_projects), 'detail': 'Parsed from EliasOS/02_PROJECTS.md'},
        {'label': 'Open tasks from focus', 'value': str(sum(1 for t in tasks if t['status'] != 'Done')), 'detail': 'Derived from EliasOS/06_CURRENT_FOCUS.md'},
        {'label': 'Approvals inferred', 'value': str(len(approvals)), 'detail': 'Built from project + focus signals'},
        {'label': 'Recent local events', 'value': str(len(events)), 'detail': f'From {TODAY} and {YESTERDAY} daily logs'},
        {'label': 'Blocked/at-risk projects', 'value': str(blocked_projects), 'detail': 'Need active arbitration'},
        {'label': 'Data freshness', 'value': TODAY, 'detail': 'Last refresh date'}
    ]


def build_kpis(projects: List[Dict[str, Any]], tasks: List[Dict[str, Any]], approvals: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [
        {'label': 'Projets actifs', 'value': str(len(projects)), 'delta': 'Source: EliasOS/02_PROJECTS.md'},
        {'label': 'Tâches ouvertes', 'value': str(sum(1 for t in tasks if t['status'] != 'Done')), 'delta': 'Source: current focus'},
        {'label': 'Blocages / risques', 'value': str(sum(1 for p in projects if p['health'] in {'Blocked', 'At risk', 'Waiting external'})), 'delta': 'Health derived from project status'},
        {'label': 'Approvals inférées', 'value': str(len(approvals)), 'delta': 'Built from local notes, not direct inbox logs'},
        {'label': 'Événements récents', 'value': str(len(events)), 'delta': f'{TODAY} + {YESTERDAY} memory logs'},
        {'label': 'Data source health', 'value': 'Partial', 'delta': 'Unknown where local sources are missing'}
    ]


def build_meta(projects: List[Dict[str, Any]], events: List[Dict[str, Any]]) -> Dict[str, Any]:
    focus = ' / '.join([p['name'] for p in projects if p['priority'] in {'P1', 'P2', 'P3'}][:3]) or 'unknown'
    return {
        'generatedAt': datetime.now().isoformat(timespec='seconds'),
        'statusLabel': 'Live local data',
        'focusOfDay': focus,
        'focusNote': 'Built from local Obsidian notes and lightweight OpenClaw snapshots.',
        'sources': [
            str(PROJECTS_MD.relative_to(VAULT_DIR)),
            str(FOCUS_MD.relative_to(VAULT_DIR)),
            str(LONG_MEMORY_MD.relative_to(VAULT_DIR)),
            str((MEMORY_DIR / f'{TODAY}.md').relative_to(VAULT_DIR)) if (MEMORY_DIR / f'{TODAY}.md').exists() else f'Memory/memory/{TODAY}.md missing',
            str(OPENCLAW_WORKSPACE_STATE.relative_to(VAULT_DIR)) if OPENCLAW_WORKSPACE_STATE.exists() else '.openclaw/workspace-state.json missing',
            str(AGENT_WORKSPACE_STATE.relative_to(VAULT_DIR)) if AGENT_WORKSPACE_STATE.exists() else 'Agent/Dr-Swanosten/.openclaw/workspace-state.json missing',
            str(BLUEPRINT_MD.relative_to(VAULT_DIR)) if BLUEPRINT_MD.exists() else 'Projects/Mission Control/dashboard_blueprint_v1.md missing'
        ]
    }


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    projects_md = read_text(PROJECTS_MD)
    focus_md = read_text(FOCUS_MD)
    projects = parse_project_sections(projects_md)
    tasks = parse_focus_tasks(focus_md)
    memory_paths = [MEMORY_DIR / f'{TODAY}.md', MEMORY_DIR / f'{YESTERDAY}.md']
    events = parse_memory_events(memory_paths)
    approvals = build_approvals(projects, tasks, focus_md)
    payload = {
        'meta': build_meta(projects, events),
        'views': [
            {'id': 'home', 'label': 'Mission Control', 'hint': 'CEO scan'},
            {'id': 'agents', 'label': 'Agents', 'hint': 'Ops layer'},
            {'id': 'tasks', 'label': 'Tasks', 'hint': 'Queue'},
            {'id': 'projects', 'label': 'Projects', 'hint': 'Portfolio'},
            {'id': 'decisions', 'label': 'Decisions', 'hint': 'Approvals'},
            {'id': 'timeline', 'label': 'Timeline', 'hint': 'Activity log'}
        ],
        'kpis': build_kpis(projects, tasks, approvals, events),
        'lanes': build_lanes(tasks, approvals),
        'alerts': build_alerts(projects, approvals, events),
        'decisions': build_decisions(approvals),
        'projects': projects,
        'agents': build_agent_data(projects, events),
        'tasks': tasks,
        'approvals': approvals,
        'impact': build_impact(projects, tasks, events, approvals),
        'timeline': events[:30]
    }
    (DATA_DIR / 'dashboard.json').write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding='utf-8')
    (DATA_DIR / 'projects.json').write_text(json.dumps(projects, indent=2, ensure_ascii=False), encoding='utf-8')
    (DATA_DIR / 'tasks.json').write_text(json.dumps(tasks, indent=2, ensure_ascii=False), encoding='utf-8')
    (DATA_DIR / 'agents.json').write_text(json.dumps(payload['agents'], indent=2, ensure_ascii=False), encoding='utf-8')
    (DATA_DIR / 'timeline.json').write_text(json.dumps(payload['timeline'], indent=2, ensure_ascii=False), encoding='utf-8')
    print(f'Refreshed data into {DATA_DIR}')


if __name__ == '__main__':
    main()
