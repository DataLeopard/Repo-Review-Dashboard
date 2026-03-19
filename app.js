// ── Config ──
const ORG = 'DataLeopard';
const API = 'https://api.github.com';
const STORE = 'repo-review-v2';

// Known deployed URLs — GitHub Pages or other hosting
// These get auto-detected too, but hardcoding known ones ensures instant load
const KNOWN_URLS = {
    'georgetowntrails': 'https://dataleopard.github.io/georgetowntrails/',
    'austin-locator': 'https://dataleopard.github.io/austin-locator/',
    'guestcard-dashboard': 'https://dataleopard.github.io/guestcard-dashboard/',
    'guestcard-chat': 'https://dataleopard.github.io/guestcard-chat/',
    'apartment-locator': 'https://dataleopard.github.io/apartment-locator/',
    'Repo-Review-Dashboard': 'https://dataleopard.github.io/Repo-Review-Dashboard/',
};

// For repos without a live site, detect main entry file to show code
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
let repoData = {}; // per-repo: { liveUrl, files, changedFiles, commits, fileIndex, loaded }

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    setupKeyboard();
    setupFeedbackButtons();
    setupViewToggle();
    await loadAllRepos();
});

// ── API ──
async function api(path) {
    const h = { Accept: 'application/vnd.github.v3+json' };
    if (state.token) h['Authorization'] = `token ${state.token}`;
    const r = await fetch(`${API}${path}`, { headers: h });
    if (r.status === 403 && r.headers.get('X-RateLimit-Remaining') === '0') {
        try {
            const t = prompt('Rate limited. Enter GitHub token (repo scope):\nhttps://github.com/settings/tokens');
            if (t) { state.token = t; save(); location.reload(); }
        } catch {}
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
        document.getElementById('view-label').textContent = `Error: ${e.message}`;
        return;
    }

    buildTabs();
    updateProgress();
    switchTab(0);
    preloadAll();
}

function buildTabs() {
    const bar = document.getElementById('tabs');
    bar.innerHTML = '';
    repos.forEach((repo, i) => {
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.dataset.index = i;
        const st = state.statuses?.[repo.name] || 'pending';
        const hasLive = !!getLiveUrl(repo);
        tab.innerHTML = `
            <span class="tab-dot ${st}"></span>
            <span>${repo.name}</span>
            ${hasLive ? '<span class="tab-live">LIVE</span>' : ''}
        `;
        tab.addEventListener('click', () => switchTab(i));
        bar.appendChild(tab);
    });
}

function getLiveUrl(repo) {
    return KNOWN_URLS[repo.name] || repo.homepage || null;
}

// ── Preload All ──
async function preloadAll() {
    for (let i = 0; i < repos.length; i++) {
        if (!repoData[i]) await loadRepoData(i);
        // Update tab with change badge
        const rd = repoData[i];
        if (rd?.changedFiles?.size > 0) {
            const tab = document.querySelector(`.tab[data-index="${i}"]`);
            if (tab && !tab.querySelector('.tab-badge')) {
                const b = document.createElement('span');
                b.className = 'tab-badge';
                b.textContent = rd.changedFiles.size;
                tab.appendChild(b);
            }
        }
    }
    document.getElementById('progress-text').textContent =
        `${repos.filter((_,i) => repoData[i]?.loaded).length} repos loaded`;
}

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
                    if (!changedFiles.has(f.filename)) {
                        changedFiles.set(f.filename, {
                            status: f.status, additions: f.additions, deletions: f.deletions,
                            msg: d.commit.message.split('\n')[0], sha: c.sha.slice(0, 7),
                        });
                    }
                }
            } catch {}
        }

        // Find entry file
        let entryIdx = 0;
        for (const ef of ENTRY_FILES) {
            const idx = files.findIndex(f => f.path === ef);
            if (idx >= 0) { entryIdx = idx; break; }
        }
        if (entryIdx === 0) {
            const src = files.findIndex(f => /\.(py|js|jsx|ts|tsx|html)$/.test(f.path) && !f.path.includes('config'));
            if (src >= 0) entryIdx = src;
        }

        // Check for live URL via GitHub Pages API
        let liveUrl = getLiveUrl(repo);
        if (!liveUrl && repo.has_pages) {
            try {
                const pages = await api(`/repos/${ORG}/${repo.name}/pages`);
                if (pages.html_url) liveUrl = pages.html_url;
            } catch {}
        }

        repoData[index] = { liveUrl, files, changedFiles, changedSet: new Set(changedFiles.keys()), commits, fileIndex: entryIdx, loaded: true };
    } catch {
        repoData[index] = { liveUrl: getLiveUrl(repo), files: [], changedFiles: new Map(), changedSet: new Set(), commits: [], fileIndex: 0, loaded: false };
    }

    return repoData[index];
}

// ── Switch Tab ──
async function switchTab(index) {
    if (index < 0 || index >= repos.length) return;
    activeTab = index;
    const repo = repos[index];

    // Highlight tab
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === index));
    document.querySelector(`.tab[data-index="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    const rd = await loadRepoData(index);

    // Render sidebar
    renderSidebar(repo, rd);
    renderFeedback(repo);

    // Show live site or code
    const liveUrl = rd.liveUrl;
    const viewToggle = document.getElementById('view-toggle');
    const viewLabel = document.getElementById('view-label');

    if (liveUrl) {
        viewToggle.classList.remove('hidden');
        viewToggle.textContent = 'Code';
        viewToggle.dataset.mode = 'live';
        viewLabel.textContent = liveUrl;
        showLive(liveUrl);
    } else {
        viewToggle.classList.remove('hidden');
        viewToggle.textContent = 'No live site — showing code';
        viewToggle.dataset.mode = 'code';
        viewToggle.classList.add('hidden');
        viewLabel.textContent = `${repo.name} — code view`;
        showCode(rd);
    }
}

// ── Show Live Site ──
function showLive(url) {
    const frame = document.getElementById('live-frame');
    const codeArea = document.getElementById('code-area');
    frame.classList.remove('hidden');
    codeArea.classList.add('hidden');
    frame.src = url;
}

// ── Show Code ──
function showCode(rd) {
    const frame = document.getElementById('live-frame');
    const codeArea = document.getElementById('code-area');
    frame.classList.add('hidden');
    codeArea.classList.remove('hidden');
    openFile(rd.fileIndex);
}

// ── View Toggle ──
function setupViewToggle() {
    const btn = document.getElementById('view-toggle');
    btn.addEventListener('click', () => {
        const rd = repoData[activeTab];
        if (!rd) return;
        if (btn.dataset.mode === 'live') {
            btn.dataset.mode = 'code';
            btn.textContent = 'Live Site';
            document.getElementById('view-label').textContent = `${repos[activeTab].name} — code view`;
            showCode(rd);
        } else {
            btn.dataset.mode = 'live';
            btn.textContent = 'Code';
            document.getElementById('view-label').textContent = rd.liveUrl;
            showLive(rd.liveUrl);
        }
    });
}

// ── Sidebar ──
function renderSidebar(repo, rd) {
    // Summary
    const sum = document.getElementById('repo-summary');
    const lastCommit = rd.commits[0];
    const lastMsg = lastCommit ? lastCommit.commit.message.split('\n')[0] : '—';
    const lastDate = lastCommit ? timeSince(lastCommit.commit.author.date) : '—';
    sum.innerHTML = `
        <div class="stat"><span>Files</span><span>${rd.files.length}</span></div>
        <div class="stat"><span>Changed</span><span class="${rd.changedFiles.size > 0 ? 'hot' : ''}">${rd.changedFiles.size}</span></div>
        <div class="stat"><span>Updated</span><span>${lastDate}</span></div>
        <div class="last-commit">${esc(lastMsg)}</div>
        ${repo.description ? `<div class="repo-desc">${esc(repo.description)}</div>` : ''}
        <div class="repo-links">
            <a href="${repo.html_url}" target="_blank">GitHub</a>
            <a href="${repo.html_url}/commits/${repo.default_branch}" target="_blank">Commits</a>
            ${rd.liveUrl ? `<a href="${rd.liveUrl}" target="_blank">Live</a>` : ''}
        </div>
    `;

    // Changes
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
                if (idx >= 0) {
                    // Switch to code view and open file
                    const btn = document.getElementById('view-toggle');
                    if (btn.dataset.mode === 'live') btn.click();
                    openFile(idx);
                }
            });
            cl.appendChild(div);
        }
    }

    // File list
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
        div.addEventListener('click', () => {
            const btn = document.getElementById('view-toggle');
            if (btn.dataset.mode === 'live') btn.click();
            openFile(i);
        });
        fl.appendChild(div);
    });
}

// ── Open File (code view) ──
async function openFile(index) {
    const rd = repoData[activeTab];
    if (!rd || index < 0 || index >= rd.files.length) return;
    rd.fileIndex = index;
    const file = rd.files[index];
    const repo = repos[activeTab];
    const ext = file.path.split('.').pop().toLowerCase();

    // Highlight
    document.querySelectorAll('#file-list .fitem:not(.dir)').forEach(el => {
        el.classList.toggle('active', el.dataset.index == index);
    });

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

        // Add line numbers
        const lines = codeEl.innerHTML.split('\n');
        codeEl.innerHTML = lines.map((l, i) => `<span class="ln">${i + 1}</span>${l}`).join('\n');

        document.getElementById('code-area').scrollTop = 0;
    } catch (e) {
        codeEl.textContent = `Error: ${e.message}`;
    }
}

// ── Feedback ──
function setupFeedbackButtons() {
    document.querySelectorAll('.sbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (activeTab < 0) return;
            const repo = repos[activeTab];
            const st = btn.dataset.status;
            if (!state.statuses) state.statuses = {};
            state.statuses[repo.name] = st;
            save();

            document.querySelector(`.tab[data-index="${activeTab}"] .tab-dot`).className = `tab-dot ${st}`;
            document.querySelectorAll('.sbtn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateProgress();
            toast(st === 'good' ? 'Looks good!' : st === 'needs-work' ? 'Flagged' : 'Skipped', st);

            // Auto-advance
            setTimeout(() => {
                const next = repos.findIndex((r, i) => i > activeTab && !state.statuses?.[r.name]);
                if (next >= 0) switchTab(next);
            }, 500);
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
    document.querySelectorAll('.sbtn').forEach(b => b.classList.toggle('active', b.dataset.status === st));
    document.getElementById('quick-note').value = state.notes?.[repo.name] || '';
}

// ── Keyboard ──
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        const rd = repoData[activeTab];

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault(); switchTab(Math.max(activeTab - 1, 0)); break;
            case 'ArrowRight':
                e.preventDefault(); switchTab(Math.min(activeTab + 1, repos.length - 1)); break;
            case 'ArrowUp': case 'k':
                e.preventDefault();
                if (rd && rd.fileIndex > 0) { ensureCodeView(); openFile(rd.fileIndex - 1); }
                break;
            case 'ArrowDown': case 'j':
                e.preventDefault();
                if (rd && rd.fileIndex < rd.files.length - 1) { ensureCodeView(); openFile(rd.fileIndex + 1); }
                break;
            case '1': e.preventDefault(); document.querySelector('.sbtn[data-status="good"]').click(); break;
            case '2': e.preventDefault(); document.querySelector('.sbtn[data-status="needs-work"]').click(); break;
            case '3': e.preventDefault(); document.querySelector('.sbtn[data-status="skip"]').click(); break;
            case 'l': case 'L':
                e.preventDefault();
                const btn = document.getElementById('view-toggle');
                if (!btn.classList.contains('hidden')) btn.click();
                break;
        }
    });
}

function ensureCodeView() {
    const btn = document.getElementById('view-toggle');
    if (btn.dataset.mode === 'live') btn.click();
}

// ── Progress ──
function updateProgress() {
    const total = repos.length;
    const done = repos.filter(r => state.statuses?.[r.name]).length;
    const good = repos.filter(r => state.statuses?.[r.name] === 'good').length;
    const work = repos.filter(r => state.statuses?.[r.name] === 'needs-work').length;
    document.getElementById('progress-text').textContent = `${done}/${total} | ${good} good | ${work} flagged`;
}

// ── Utils ──
function loadState() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function decodeB64(b) { try { return decodeURIComponent(atob(b.replace(/\n/g,'')).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')); } catch { return atob(b.replace(/\n/g,'')); } }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function timeSince(d) { const s = Math.floor((Date.now()-new Date(d))/1000); if(s<3600) return Math.floor(s/60)+'m ago'; if(s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago'; }
function toast(m, t='info') { const el = document.createElement('div'); el.className=`toast ${t}`; el.textContent=m; document.body.appendChild(el); setTimeout(()=>el.remove(),1500); }
