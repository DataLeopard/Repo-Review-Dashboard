// ── Config ──
const ORG = 'DataLeopard';
const API = 'https://api.github.com';
const STORE = 'repo-review-v3';

const KNOWN_URLS = {
    'georgetowntrails': 'https://dataleopard.github.io/georgetowntrails/',
    'austin-locator': 'https://dataleopard.github.io/austin-locator/',
    'guestcard-dashboard': 'https://dataleopard.github.io/guestcard-dashboard/',
    'guestcard-chat': 'https://dataleopard.github.io/guestcard-chat/',
    'apartment-locator': 'https://dataleopard.github.io/apartment-locator/',
    'Repo-Review-Dashboard': 'https://dataleopard.github.io/Repo-Review-Dashboard/',
};

const ENTRY_FILES = [
    'app.py', 'main.py', 'agent.py', '__main__.py',
    'src/App.jsx', 'src/App.tsx', 'src/App.js',
    'src/index.js', 'src/main.jsx', 'src/main.tsx',
    'app.js', 'index.js', 'server.js', 'index.html',
];

const EXT_LANG = {
    js:'javascript', jsx:'javascript', ts:'typescript', tsx:'typescript',
    py:'python', html:'xml', css:'css', scss:'scss', json:'json',
    yaml:'yaml', yml:'yaml', md:'markdown', sh:'bash', bat:'dos',
    ps1:'powershell', sql:'sql', toml:'ini', txt:'plaintext',
};

// ── State ──
let repos = [];
let activeTab = -1;
let state = loadState();
let repoData = {};
let currentView = 'landing'; // 'landing' or 'detail'

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    setupTopButtons();
    setupKeyboard();
    setupFeedbackButtons();
    setupModal();
    await loadAllRepos();
});

// ── API ──
async function api(path) {
    const h = { Accept: 'application/vnd.github.v3+json' };
    if (state.token) h['Authorization'] = `token ${state.token}`;
    const r = await fetch(`${API}${path}`, { headers: h });
    if (r.status === 403 && r.headers.get('X-RateLimit-Remaining') === '0') {
        const t = prompt('GitHub API rate limited. Enter a personal access token:\nhttps://github.com/settings/tokens');
        if (t) { state.token = t; save(); location.reload(); }
        throw new Error('Rate limited');
    }
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
}

// ── Load All Repos ──
async function loadAllRepos() {
    try {
        repos = await api(`/users/${ORG}/repos?sort=updated&per_page=30`);
        repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    } catch (e) {
        document.getElementById('review-count').textContent = `Error: ${e.message}`;
        return;
    }
    updateProgress();
    buildCards();
    preloadAll();
}

// ══════════════════════ LANDING PAGE ══════════════════════

function buildCards() {
    const grid = document.getElementById('card-grid');
    grid.innerHTML = '';
    repos.forEach((repo, i) => {
        const liveUrl = getLiveUrl(repo);
        const status = state.statuses?.[repo.name];
        const note = state.notes?.[repo.name];
        const card = document.createElement('div');
        card.className = 'repo-card' + (status ? ` reviewed-${status}` : '');
        card.innerHTML = `
            <div class="card-header">
                <div class="card-title">${esc(repo.name)}</div>
                <div class="card-badges">
                    ${liveUrl ? '<span class="badge live">Live</span>' : '<span class="badge code-only">Code</span>'}
                </div>
            </div>
            ${repo.description ? `<div class="card-desc">${esc(repo.description)}</div>` : '<div class="card-desc" style="color:var(--muted);font-style:italic;">No description</div>'}
            <div class="card-stats">
                <div class="card-stat">Updated <span class="val">${timeSince(repo.updated_at)}</span></div>
                <div class="card-stat">Branch <span class="val">${repo.default_branch}</span></div>
            </div>
            <div class="card-commit" id="card-commit-${i}">Loading recent activity...</div>
            ${status ? `<div class="card-verdict ${status}">${status === 'good' ? '&#10003; Looks Good' : status === 'needs-work' ? '&#9888; Needs Work' : '&#8594; Skipped'}${note ? ' — ' + esc(note.substring(0,60)) : ''}</div>` : ''}
            <div class="card-buttons">
                <button class="card-btn review" data-index="${i}">Review Code</button>
                ${liveUrl ? `<button class="card-btn live-site" data-url="${liveUrl}">Open Live Site</button>` : ''}
                <button class="card-btn ai-summary" data-index="${i}">AI Summary</button>
                <button class="card-btn github-link" data-url="${repo.html_url}">GitHub</button>
            </div>
        `;
        grid.appendChild(card);
    });

    // Wire up buttons
    grid.querySelectorAll('.card-btn.review').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); showDetail(+btn.dataset.index); });
    });
    grid.querySelectorAll('.card-btn.live-site').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); window.open(btn.dataset.url, '_blank'); });
    });
    grid.querySelectorAll('.card-btn.ai-summary').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); showAISummary(+btn.dataset.index); });
    });
    grid.querySelectorAll('.card-btn.github-link').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); window.open(btn.dataset.url, '_blank'); });
    });
}

// ── Preload commit data for cards ──
async function preloadAll() {
    for (let i = 0; i < repos.length; i++) {
        if (!repoData[i]) await loadRepoData(i);
        const rd = repoData[i];
        const commitEl = document.getElementById(`card-commit-${i}`);
        if (commitEl && rd.commits.length > 0) {
            const c = rd.commits[0];
            const msg = c.commit.message.split('\n')[0];
            const when = timeSince(c.commit.author.date);
            commitEl.innerHTML = `<strong>${esc(msg)}</strong> — ${when}`;
        } else if (commitEl) {
            commitEl.textContent = 'No recent commits';
        }

        // Update card badges with change count
        if (rd.changedFiles.size > 0) {
            const card = document.querySelectorAll('.repo-card')[i];
            const badges = card?.querySelector('.card-badges');
            if (badges && !badges.querySelector('.badge.changes')) {
                const b = document.createElement('span');
                b.className = 'badge changes';
                b.textContent = `${rd.changedFiles.size} changes`;
                badges.appendChild(b);
            }
        }
    }
    document.getElementById('review-count').textContent =
        `${repos.length} repos loaded`;
}

// ══════════════════════ DETAIL VIEW ══════════════════════

function showDetail(index) {
    activeTab = index;
    currentView = 'detail';
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    loadDetail(index);
}

function showLanding() {
    currentView = 'landing';
    document.getElementById('landing').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    buildCards(); // refresh verdicts
    activeTab = -1;
}

async function loadDetail(index) {
    const repo = repos[index];
    activeTab = index;

    document.getElementById('detail-repo-name').textContent = repo.name;

    // Nav buttons
    document.getElementById('btn-prev').disabled = index === 0;
    document.getElementById('btn-next').disabled = index === repos.length - 1;

    // Action buttons
    const liveUrl = getLiveUrl(repo);
    const liveBtn = document.getElementById('detail-live');
    if (liveUrl) {
        liveBtn.classList.remove('hidden');
        liveBtn.onclick = () => window.open(liveUrl, '_blank');
    } else {
        liveBtn.classList.add('hidden');
    }
    document.getElementById('detail-github').onclick = () => window.open(repo.html_url, '_blank');
    document.getElementById('detail-ai').onclick = () => showAISummary(index);

    const rd = await loadRepoData(index);
    renderSidebar(repo, rd);
    renderFeedback(repo);
    openFile(rd.fileIndex);
}

function getLiveUrl(repo) {
    return KNOWN_URLS[repo.name] || repo.homepage || null;
}

// ══════════════════════ AI SUMMARY ══════════════════════

async function showAISummary(index) {
    const repo = repos[index];
    const rd = await loadRepoData(index);
    const modal = document.getElementById('ai-modal');
    const body = document.getElementById('ai-modal-body');

    document.getElementById('ai-modal-title').textContent = `AI Review — ${repo.name}`;
    body.innerHTML = '<p style="color:var(--muted)">Analyzing commits and changes...</p>';
    modal.classList.remove('hidden');

    // Build the summary from commit data
    const liveUrl = getLiveUrl(repo);
    const commits = rd.commits || [];
    const changes = rd.changedFiles;

    // Categorize changes
    const added = [], modified = [], removed = [];
    for (const [fn, info] of changes) {
        if (info.status === 'added') added.push(fn);
        else if (info.status === 'removed') removed.push(fn);
        else modified.push(fn);
    }

    // Extract unique commit messages
    const commitMsgs = commits.map(c => c.commit.message.split('\n')[0]);

    // Build summary HTML
    let html = '';

    // Overview section
    html += `<div class="ai-section good">
        <h3>Overview</h3>
        <p><strong>${repo.name}</strong> — ${repo.description || 'No description available'}</p>
        <p>Last updated <strong>${timeSince(repo.updated_at)}</strong> | ${rd.files.length} files | ${liveUrl ? '<span class="ai-highlight">Has live deployment</span>' : 'Code-only repo'}</p>
    </div>`;

    // Recent work section
    if (commitMsgs.length > 0) {
        html += `<h3>Recent Work (Last ${commits.length} Commits)</h3>`;
        html += '<div class="ai-section"><ul>';
        commitMsgs.forEach(msg => {
            html += `<li>${esc(msg)}</li>`;
        });
        html += '</ul></div>';
    }

    // What changed section
    if (changes.size > 0) {
        html += `<h3>Files Changed (${changes.size} total)</h3>`;
        if (added.length > 0) {
            html += `<div class="ai-section good"><strong style="color:var(--green)">Added (${added.length}):</strong><ul>`;
            added.forEach(f => html += `<li>${esc(f)}</li>`);
            html += '</ul></div>';
        }
        if (modified.length > 0) {
            html += `<div class="ai-section warn"><strong style="color:var(--yellow)">Modified (${modified.length}):</strong><ul>`;
            modified.forEach(f => html += `<li>${esc(f)}</li>`);
            html += '</ul></div>';
        }
        if (removed.length > 0) {
            html += `<div class="ai-section" style="border-left-color:var(--accent)"><strong style="color:var(--accent)">Removed (${removed.length}):</strong><ul>`;
            removed.forEach(f => html += `<li>${esc(f)}</li>`);
            html += '</ul></div>';
        }
    } else {
        html += '<div class="ai-section"><p>No file changes detected in recent commits.</p></div>';
    }

    // Review checklist
    html += `<h3>Review Checklist</h3>`;
    html += `<div class="ai-section">
        <ul>
            <li>${rd.files.some(f => f.path === 'README.md') ? '&#10003;' : '&#10007;'} README exists and is up to date</li>
            <li>${rd.files.some(f => f.path === '.gitignore') ? '&#10003;' : '&#10007;'} .gitignore is configured</li>
            <li>${liveUrl ? '&#10003; Live deployment active' : '&#10007; No live deployment detected'}</li>
            <li>${changes.size > 0 ? '<span class="ai-highlight">Review ' + changes.size + ' changed files</span>' : '&#10003; No pending changes to review'}</li>
            <li>${commitMsgs.some(m => /fix|bug|error/i.test(m)) ? '<span class="ai-highlight">Bug fixes detected — verify they work</span>' : '&#10003; No bug fix commits'}</li>
            <li>${commitMsgs.some(m => /add|new|feature|create/i.test(m)) ? '<span class="ai-highlight">New features added — test them</span>' : 'No new feature commits'}</li>
        </ul>
    </div>`;

    body.innerHTML = html;

    // Setup copy button
    document.getElementById('ai-copy-claude').onclick = () => {
        const prompt = buildClaudePrompt(repo, rd, commitMsgs, changes);
        navigator.clipboard.writeText(prompt).then(() => toast('Copied! Paste into Claude Code', 'info'));
    };
}

function buildClaudePrompt(repo, rd, commitMsgs, changes) {
    let prompt = `Review my repo "${repo.name}" (${repo.html_url})\n\n`;
    prompt += `Description: ${repo.description || 'none'}\n`;
    prompt += `Files: ${rd.files.length} | Recent changes: ${changes.size}\n\n`;

    if (commitMsgs.length > 0) {
        prompt += `Recent commits:\n`;
        commitMsgs.forEach(m => prompt += `- ${m}\n`);
        prompt += '\n';
    }

    if (changes.size > 0) {
        prompt += `Changed files:\n`;
        for (const [fn, info] of changes) {
            prompt += `- [${info.status}] ${fn} (+${info.additions}/-${info.deletions})\n`;
        }
        prompt += '\n';
    }

    prompt += `Please give me:\n1. A quick assessment of the recent changes\n2. Any issues or improvements you spot\n3. Priority items to focus on\n4. Suggestions for next enhancements`;
    return prompt;
}

function showAllReposSummary() {
    const modal = document.getElementById('ai-modal');
    const body = document.getElementById('ai-modal-body');
    document.getElementById('ai-modal-title').textContent = 'AI Overview — All Repos';
    modal.classList.remove('hidden');

    let html = '<div class="ai-section good"><h3>Portfolio Overview</h3>';
    html += `<p>You have <strong>${repos.length} repos</strong> in DataLeopard. `;
    const liveCount = repos.filter(r => getLiveUrl(r)).length;
    html += `<strong>${liveCount}</strong> have live deployments.</p></div>`;

    repos.forEach((repo, i) => {
        const rd = repoData[i];
        const status = state.statuses?.[repo.name];
        const liveUrl = getLiveUrl(repo);
        const statusIcon = status === 'good' ? '&#10003;' : status === 'needs-work' ? '&#9888;' : '&#9679;';
        const statusColor = status === 'good' ? 'var(--green)' : status === 'needs-work' ? 'var(--yellow)' : 'var(--muted)';

        html += `<div class="ai-section${!status ? ' warn' : status === 'good' ? ' good' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${esc(repo.name)}</strong>
                <span style="color:${statusColor}">${statusIcon} ${status || 'Not reviewed'}</span>
            </div>
            <p style="font-size:12px;color:var(--muted);margin-top:4px;">${repo.description || 'No description'}</p>
            <p style="font-size:12px;margin-top:4px;">
                Updated ${timeSince(repo.updated_at)}
                ${rd?.changedFiles?.size > 0 ? ` | <span class="ai-highlight">${rd.changedFiles.size} changes</span>` : ''}
                ${liveUrl ? ' | <span style="color:var(--green)">Live</span>' : ''}
            </p>
        </div>`;
    });

    body.innerHTML = html;

    document.getElementById('ai-copy-claude').onclick = () => {
        let prompt = `Here's an overview of all my DataLeopard repos. Give me a prioritized review plan:\n\n`;
        repos.forEach((repo, i) => {
            const rd = repoData[i];
            const status = state.statuses?.[repo.name] || 'not reviewed';
            prompt += `${i+1}. ${repo.name} — ${repo.description || 'no desc'} | Status: ${status} | Changes: ${rd?.changedFiles?.size || '?'} | Updated: ${timeSince(repo.updated_at)}\n`;
        });
        prompt += `\nPlease suggest: which repos need attention first, what to focus on, and any cross-repo improvements.`;
        navigator.clipboard.writeText(prompt).then(() => toast('Copied! Paste into Claude Code', 'info'));
    };
}

// ══════════════════════ SIDEBAR ══════════════════════

function renderSidebar(repo, rd) {
    const sum = document.getElementById('repo-summary');
    const lastCommit = rd.commits[0];
    const lastMsg = lastCommit ? lastCommit.commit.message.split('\n')[0] : '—';
    const lastDate = lastCommit ? timeSince(lastCommit.commit.author.date) : '—';
    const liveUrl = getLiveUrl(repo);
    sum.innerHTML = `
        <div class="stat"><span>Files</span><span>${rd.files.length}</span></div>
        <div class="stat"><span>Changed</span><span class="${rd.changedFiles.size > 0 ? 'hot' : ''}">${rd.changedFiles.size}</span></div>
        <div class="stat"><span>Updated</span><span>${lastDate}</span></div>
        <div class="last-commit">${esc(lastMsg)}</div>
        ${repo.description ? `<div class="repo-desc">${esc(repo.description)}</div>` : ''}
        <div class="repo-links">
            <a href="${repo.html_url}" target="_blank">GitHub</a>
            <a href="${repo.html_url}/commits/${repo.default_branch}" target="_blank">Commits</a>
            ${liveUrl ? `<a href="${liveUrl}" target="_blank">Live</a>` : ''}
        </div>
    `;

    const cl = document.getElementById('change-list');
    if (rd.changedFiles.size === 0) {
        cl.innerHTML = '<div class="empty">No recent changes</div>';
    } else {
        cl.innerHTML = '';
        for (const [fn, info] of rd.changedFiles) {
            const div = document.createElement('div');
            div.className = 'change-item';
            const badge = info.status === 'added' ? 'A' : info.status === 'removed' ? 'D' : 'M';
            div.innerHTML = `<span class="cbadge ${badge}">${badge}</span><span title="${esc(fn)}">${esc(fn)}</span>`;
            div.addEventListener('click', () => {
                const idx = rd.files.findIndex(f => f.path === fn);
                if (idx >= 0) openFile(idx);
            });
            cl.appendChild(div);
        }
    }

    const fl = document.getElementById('file-list');
    fl.innerHTML = '';
    const dirs = new Set();
    rd.files.forEach((f, i) => {
        const parts = f.path.split('/');
        for (let d = 1; d < parts.length; d++) {
            const dp = parts.slice(0, d).join('/');
            if (!dirs.has(dp)) {
                dirs.add(dp);
                const dd = document.createElement('div');
                dd.className = 'fitem dir';
                dd.style.paddingLeft = (4 + (d - 1) * 10) + 'px';
                dd.textContent = parts[d - 1] + '/';
                fl.appendChild(dd);
            }
        }
        const div = document.createElement('div');
        div.className = 'fitem' + (rd.changedSet.has(f.path) ? ' changed' : '') + (i === rd.fileIndex ? ' active' : '');
        div.style.paddingLeft = (4 + (parts.length - 1) * 10) + 'px';
        div.dataset.index = i;
        div.textContent = parts[parts.length - 1];
        div.addEventListener('click', () => openFile(i));
        fl.appendChild(div);
    });
}

// ══════════════════════ FILE VIEWER ══════════════════════

async function openFile(index) {
    const rd = repoData[activeTab];
    if (!rd || index < 0 || index >= rd.files.length) return;
    rd.fileIndex = index;
    const file = rd.files[index];
    const repo = repos[activeTab];
    const ext = file.path.split('.').pop().toLowerCase();

    document.querySelectorAll('#file-list .fitem:not(.dir)').forEach(el => {
        el.classList.toggle('active', el.dataset.index == index);
    });
    const activeEl = document.querySelector(`#file-list .fitem[data-index="${index}"]`);
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });

    document.getElementById('view-label').textContent = `${repo.name} / ${file.path}`;

    const codeEl = document.getElementById('code-content');
    codeEl.textContent = 'Loading...';
    codeEl.className = '';

    try {
        const data = await api(`/repos/${ORG}/${repo.name}/contents/${file.path}?ref=${repo.default_branch}`);
        const content = data.encoding === 'base64' ? decodeB64(data.content) : data.content;
        const lang = EXT_LANG[ext] || 'plaintext';

        codeEl.className = `language-${lang}`;
        codeEl.textContent = content;
        try { hljs.highlightElement(codeEl); } catch {}

        const lines = codeEl.innerHTML.split('\n');
        codeEl.innerHTML = lines.map((l, i) => `<span class="ln">${i + 1}</span>${l}`).join('\n');
        document.getElementById('code-area').scrollTop = 0;
    } catch (e) {
        codeEl.textContent = `Could not load file: ${e.message}`;
    }
}

// ══════════════════════ LOAD REPO DATA ══════════════════════

async function loadRepoData(index) {
    const repo = repos[index];
    if (repoData[index]) return repoData[index];
    try {
        const [tree, commits] = await Promise.all([
            api(`/repos/${ORG}/${repo.name}/git/trees/${repo.default_branch}?recursive=1`),
            api(`/repos/${ORG}/${repo.name}/commits?per_page=5`),
        ]);
        const files = tree.tree.filter(f => f.type === 'blob').sort((a, b) => a.path.localeCompare(b.path));
        const changedFiles = new Map();
        for (const c of commits.slice(0, 3)) {
            try {
                const d = await api(`/repos/${ORG}/${repo.name}/commits/${c.sha}`);
                for (const f of d.files) {
                    if (!changedFiles.has(f.filename))
                        changedFiles.set(f.filename, { status: f.status, additions: f.additions, deletions: f.deletions, msg: d.commit.message.split('\n')[0] });
                }
            } catch {}
        }
        let entryIdx = 0;
        for (const ef of ENTRY_FILES) {
            const idx = files.findIndex(f => f.path === ef);
            if (idx >= 0) { entryIdx = idx; break; }
        }
        if (entryIdx === 0) {
            const src = files.findIndex(f => /\.(py|js|jsx|ts|tsx|html)$/.test(f.path) && !f.path.includes('config'));
            if (src >= 0) entryIdx = src;
        }
        repoData[index] = { files, changedFiles, changedSet: new Set(changedFiles.keys()), commits, fileIndex: entryIdx, loaded: true };
    } catch {
        repoData[index] = { files: [], changedFiles: new Map(), changedSet: new Set(), commits: [], fileIndex: 0, loaded: false };
    }
    return repoData[index];
}

// ══════════════════════ BUTTONS & EVENTS ══════════════════════

function setupTopButtons() {
    document.getElementById('btn-home').addEventListener('click', showLanding);
    document.getElementById('btn-open-all').addEventListener('click', () => {
        for (const repo of repos) {
            const url = getLiveUrl(repo);
            if (url) window.open(url, `live-${repo.name}`);
        }
        toast(`Opened ${Object.keys(KNOWN_URLS).length} live sites`, 'info');
    });
    document.getElementById('btn-ai-overview').addEventListener('click', showAllReposSummary);
    document.getElementById('btn-back').addEventListener('click', showLanding);
    document.getElementById('btn-prev').addEventListener('click', () => {
        if (activeTab > 0) loadDetail(activeTab - 1);
    });
    document.getElementById('btn-next').addEventListener('click', () => {
        if (activeTab < repos.length - 1) loadDetail(activeTab + 1);
    });
}

function setupFeedbackButtons() {
    document.querySelectorAll('.verdict-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (activeTab < 0) return;
            const repo = repos[activeTab];
            const st = btn.dataset.status;
            if (!state.statuses) state.statuses = {};
            state.statuses[repo.name] = st;
            save();

            document.querySelectorAll('.verdict-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateProgress();
            toast(st === 'good' ? 'Looks good!' : st === 'needs-work' ? 'Flagged for work' : 'Skipped', st);

            // Auto-advance after short delay
            setTimeout(() => {
                const next = repos.findIndex((r, i) => i > activeTab && !state.statuses?.[r.name]);
                if (next >= 0) loadDetail(next);
                else toast('All repos reviewed!', 'info');
            }, 600);
        });
    });

    const note = document.getElementById('quick-note');
    let timer;
    note.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (activeTab < 0) return;
            if (!state.notes) state.notes = {};
            state.notes[repos[activeTab].name] = note.value;
            save();
        }, 400);
    });
}

function renderFeedback(repo) {
    const st = state.statuses?.[repo.name] || '';
    document.querySelectorAll('.verdict-btn').forEach(b => b.classList.toggle('active', b.dataset.status === st));
    document.getElementById('quick-note').value = state.notes?.[repo.name] || '';
}

function setupModal() {
    document.getElementById('ai-modal-close').addEventListener('click', closeModal);
    document.getElementById('ai-modal-done').addEventListener('click', closeModal);
    document.getElementById('ai-modal').addEventListener('click', (e) => {
        if (e.target.id === 'ai-modal') closeModal();
    });
}

function closeModal() {
    document.getElementById('ai-modal').classList.add('hidden');
}

// ══════════════════════ KEYBOARD ══════════════════════

function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        // Escape closes modal or goes back
        if (e.key === 'Escape') {
            const modal = document.getElementById('ai-modal');
            if (!modal.classList.contains('hidden')) { closeModal(); return; }
            if (currentView === 'detail') { showLanding(); return; }
        }

        // Detail view shortcuts
        if (currentView === 'detail') {
            const rd = repoData[activeTab];
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (activeTab > 0) loadDetail(activeTab - 1);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (activeTab < repos.length - 1) loadDetail(activeTab + 1);
                    break;
                case 'ArrowUp': case 'k':
                    e.preventDefault();
                    if (rd && rd.fileIndex > 0) openFile(rd.fileIndex - 1);
                    break;
                case 'ArrowDown': case 'j':
                    e.preventDefault();
                    if (rd && rd.fileIndex < rd.files.length - 1) openFile(rd.fileIndex + 1);
                    break;
                case '1': e.preventDefault(); document.querySelector('.verdict-btn[data-status="good"]').click(); break;
                case '2': e.preventDefault(); document.querySelector('.verdict-btn[data-status="needs-work"]').click(); break;
                case '3': e.preventDefault(); document.querySelector('.verdict-btn[data-status="skip"]').click(); break;
                case 'o': case 'O':
                    e.preventDefault();
                    const url = getLiveUrl(repos[activeTab]);
                    if (url) window.open(url, '_blank');
                    break;
            }
        }
    });
}

// ══════════════════════ PROGRESS ══════════════════════

function updateProgress() {
    const total = repos.length;
    const done = repos.filter(r => state.statuses?.[r.name]).length;
    const good = repos.filter(r => state.statuses?.[r.name] === 'good').length;
    const work = repos.filter(r => state.statuses?.[r.name] === 'needs-work').length;
    document.getElementById('review-count').textContent =
        done > 0 ? `${done}/${total} reviewed | ${good} good | ${work} flagged` : `${total} repos`;
}

// ══════════════════════ UTILS ══════════════════════

function loadState() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function decodeB64(b) { try { return decodeURIComponent(atob(b.replace(/\n/g,'')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')); } catch { return atob(b.replace(/\n/g,'')); } }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function timeSince(d) { const s = Math.floor((Date.now()-new Date(d))/1000); if(s<60) return 'just now'; if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
function toast(m, t='info') { const el = document.createElement('div'); el.className=`toast ${t}`; el.textContent=m; document.body.appendChild(el); setTimeout(()=>el.remove(),2000); }
