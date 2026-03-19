// ── Config ──
const GITHUB_ORG = 'DataLeopard';
const GITHUB_API = 'https://api.github.com';
const STORAGE_KEY = 'repo-review-dashboard';

// ── State ──
let repos = [];
let activeIndex = -1;
let reviewState = loadState();

// Review checklist items applied to every repo
const CHECKLIST_ITEMS = [
    'README is accurate and up-to-date',
    'Recent commits look intentional (no debug code left)',
    'No secrets or credentials in code',
    'Dependencies are reasonable and up-to-date',
    'Error handling is present where needed',
    'Code structure is clean and organized',
    'Tests exist and cover key paths',
    'No TODO/FIXME items left unresolved',
    'App runs without errors',
    'UI/UX is acceptable (if applicable)',
];

// ── Init ──
document.addEventListener('DOMContentLoaded', init);

async function init() {
    setupResizeHandle();
    setupKeyboard();
    setupViewMode();
    setupNavButtons();
    await loadRepos();
}

// ── GitHub API ──
async function ghFetch(path) {
    const token = reviewState.token || '';
    const headers = { 'Accept': 'application/vnd.github.v3+json' };
    if (token) headers['Authorization'] = `token ${token}`;
    const res = await fetch(`${GITHUB_API}${path}`, { headers });
    if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0') {
        promptForToken();
        throw new Error('Rate limited. Add a GitHub token.');
    }
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json();
}

function promptForToken() {
    const token = prompt(
        'GitHub API rate limit hit. Enter a personal access token (repo scope) to continue.\n' +
        'Create one at: https://github.com/settings/tokens'
    );
    if (token) {
        reviewState.token = token;
        saveState();
        location.reload();
    }
}

// ── Load Repos ──
async function loadRepos() {
    try {
        repos = await ghFetch(`/users/${GITHUB_ORG}/repos?sort=updated&per_page=30`);
        repos.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
        renderRepoList();
        updateCounter();
    } catch (err) {
        document.querySelector('#repo-list').innerHTML =
            `<div class="loading">Error loading repos: ${err.message}</div>`;
    }
}

// ── Render Repo List ──
function renderRepoList() {
    const list = document.getElementById('repo-list');
    list.innerHTML = '';
    repos.forEach((repo, i) => {
        const div = document.createElement('div');
        div.className = 'repo-item';
        if (i === activeIndex) div.classList.add('active');
        if (reviewState.reviewed?.[repo.name]) div.classList.add('reviewed');

        const ago = timeAgo(repo.updated_at);
        div.innerHTML = `
            <span class="repo-icon"></span>
            <span class="repo-name-text">${repo.name}</span>
            <span class="repo-updated">${ago}</span>
        `;
        div.addEventListener('click', () => selectRepo(i));
        list.appendChild(div);
    });
}

// ── Select Repo ──
async function selectRepo(index) {
    if (index < 0 || index >= repos.length) return;
    activeIndex = index;
    const repo = repos[index];

    // Update list highlight
    renderRepoList();

    // Show detail panel
    const detail = document.getElementById('repo-detail');
    detail.classList.remove('hidden');

    document.getElementById('repo-name').textContent = repo.name;
    document.getElementById('repo-desc').textContent = repo.description || 'No description';
    document.getElementById('link-github').href = repo.html_url;
    document.getElementById('link-code').href = `${repo.html_url}/tree/${repo.default_branch}`;
    document.getElementById('link-commits').href = `${repo.html_url}/commits/${repo.default_branch}`;

    // Update reviewed button
    const btn = document.getElementById('mark-reviewed');
    if (reviewState.reviewed?.[repo.name]) {
        btn.classList.add('is-reviewed');
        btn.textContent = '✓ Reviewed';
    } else {
        btn.classList.remove('is-reviewed');
        btn.textContent = '✓ Mark Reviewed';
    }

    // Load commits
    loadCommits(repo);

    // Load checklist
    renderChecklist(repo);

    // Load notes
    loadNotes(repo);

    // Update right panel view
    updateRightPanel(repo);
}

// ── Commits ──
async function loadCommits(repo) {
    const container = document.getElementById('commits-list');
    container.innerHTML = '<div class="loading">Loading commits...</div>';
    try {
        const commits = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/commits?per_page=10`);
        container.innerHTML = '';
        for (const c of commits) {
            const div = document.createElement('div');
            div.className = 'commit-item';
            const date = new Date(c.commit.author.date).toLocaleDateString();
            const sha = c.sha.substring(0, 7);
            div.innerHTML = `
                <div class="commit-msg">${escapeHtml(c.commit.message.split('\n')[0])}</div>
                <div class="commit-meta">
                    <span class="commit-sha">${sha}</span>
                    <span>${c.commit.author.name}</span>
                    <span>${date}</span>
                </div>
                <div class="commit-files"></div>
            `;
            div.addEventListener('click', async () => {
                div.classList.toggle('expanded');
                const filesDiv = div.querySelector('.commit-files');
                if (div.classList.contains('expanded') && !filesDiv.innerHTML) {
                    try {
                        const detail = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/commits/${c.sha}`);
                        filesDiv.innerHTML = detail.files.map(f => {
                            const cls = f.status === 'added' ? 'added' : f.status === 'removed' ? 'deleted' : 'modified';
                            return `<div class="file-change ${cls}">${f.status[0].toUpperCase()} ${f.filename} (+${f.additions} -${f.deletions})</div>`;
                        }).join('');
                    } catch {
                        filesDiv.innerHTML = '<div class="file-change">Could not load files</div>';
                    }
                }
            });
            container.appendChild(div);
        }
    } catch (err) {
        container.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
}

// ── Checklist ──
function renderChecklist(repo) {
    const container = document.getElementById('checklist');
    container.innerHTML = '';
    const saved = reviewState.checklists?.[repo.name] || {};

    CHECKLIST_ITEMS.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'check-item' + (saved[i] ? ' done' : '');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `check-${i}`;
        checkbox.checked = !!saved[i];
        checkbox.addEventListener('change', () => {
            if (!reviewState.checklists) reviewState.checklists = {};
            if (!reviewState.checklists[repo.name]) reviewState.checklists[repo.name] = {};
            reviewState.checklists[repo.name][i] = checkbox.checked;
            div.classList.toggle('done', checkbox.checked);
            saveState();
        });

        const label = document.createElement('label');
        label.htmlFor = `check-${i}`;
        label.textContent = item;

        div.appendChild(checkbox);
        div.appendChild(label);
        container.appendChild(div);
    });
}

// ── Notes ──
function loadNotes(repo) {
    const textarea = document.getElementById('repo-notes');
    textarea.value = reviewState.notes?.[repo.name] || '';

    document.getElementById('save-notes').onclick = () => {
        if (!reviewState.notes) reviewState.notes = {};
        reviewState.notes[repo.name] = textarea.value;
        saveState();
        showToast('Notes saved');
    };
}

// ── Right Panel ──
async function updateRightPanel(repo) {
    const mode = document.getElementById('view-mode').value;
    const frame = document.getElementById('preview-frame');
    const readme = document.getElementById('readme-render');
    const diff = document.getElementById('diff-render');
    const fileBrowser = document.getElementById('file-browser');
    const welcome = document.getElementById('welcome-screen');

    // Hide all
    [frame, readme, diff, fileBrowser, welcome].forEach(el => el.classList.add('hidden'));

    if (mode === 'github') {
        frame.classList.remove('hidden');
        frame.src = repo.html_url;
    } else if (mode === 'readme') {
        readme.classList.remove('hidden');
        await loadReadme(repo);
    } else if (mode === 'diff') {
        diff.classList.remove('hidden');
        await loadDiff(repo);
    } else if (mode === 'files') {
        fileBrowser.classList.remove('hidden');
        await loadFiles(repo);
    }
}

async function loadReadme(repo) {
    const container = document.getElementById('readme-render');
    container.innerHTML = '<div class="loading">Loading README...</div>';
    try {
        const data = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/readme`);
        const content = atob(data.content.replace(/\n/g, ''));
        container.innerHTML = renderMarkdown(content);
    } catch {
        container.innerHTML = '<div class="loading">No README found</div>';
    }
}

async function loadDiff(repo) {
    const container = document.getElementById('diff-render');
    container.innerHTML = '<div class="loading">Loading recent changes...</div>';
    try {
        const commits = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/commits?per_page=1`);
        if (!commits.length) {
            container.innerHTML = '<div class="loading">No commits</div>';
            return;
        }
        const detail = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/commits/${commits[0].sha}`);
        let html = `<div style="margin-bottom:8px;color:var(--text-muted)">Latest commit: ${escapeHtml(detail.commit.message.split('\n')[0])}</div>`;
        for (const file of detail.files) {
            html += `<div class="diff-file-header">${file.filename}</div>`;
            if (file.patch) {
                for (const line of file.patch.split('\n')) {
                    const cls = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : line.startsWith('@@') ? 'hunk' : '';
                    html += `<div class="diff-line ${cls}">${escapeHtml(line)}</div>`;
                }
            }
        }
        container.innerHTML = html;
    } catch (err) {
        container.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
}

async function loadFiles(repo) {
    const container = document.getElementById('file-browser');
    container.innerHTML = '<div class="loading">Loading files...</div>';
    try {
        const tree = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}/git/trees/${repo.default_branch}?recursive=1`);
        container.innerHTML = '';
        for (const item of tree.tree) {
            const div = document.createElement('div');
            div.className = 'file-tree-item' + (item.type === 'tree' ? ' dir' : '');
            div.textContent = (item.type === 'tree' ? '📁 ' : '  ') + item.path;
            if (item.type === 'blob') {
                div.addEventListener('click', () => {
                    window.open(`${repo.html_url}/blob/${repo.default_branch}/${item.path}`, '_blank');
                });
            }
            container.appendChild(div);
        }
    } catch (err) {
        container.innerHTML = `<div class="loading">Error: ${err.message}</div>`;
    }
}

// ── Simple Markdown Renderer ──
function renderMarkdown(md) {
    let html = escapeHtml(md);
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    // Unordered lists
    html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    // Clean
    html = html.replace(/<p><(h[123]|pre|ul)/g, '<$1');
    html = html.replace(/<\/(h[123]|pre|ul)><\/p>/g, '</$1>');
    return html;
}

// ── Keyboard Navigation ──
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Don't capture when typing in textarea
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;

        if (e.key === 'ArrowDown' || e.key === 'j') {
            e.preventDefault();
            selectRepo(Math.min(activeIndex + 1, repos.length - 1));
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
            e.preventDefault();
            selectRepo(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            selectRepo(Math.min(activeIndex + 1, repos.length - 1));
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            selectRepo(Math.max(activeIndex - 1, 0));
        } else if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            toggleReviewed();
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            window.open(repos[activeIndex].html_url, '_blank');
        }
    });
}

// ── View Mode ──
function setupViewMode() {
    document.getElementById('view-mode').addEventListener('change', () => {
        if (activeIndex >= 0) updateRightPanel(repos[activeIndex]);
    });
}

// ── Nav Buttons ──
function setupNavButtons() {
    document.getElementById('prev-repo').addEventListener('click', () => {
        selectRepo(Math.max(activeIndex - 1, 0));
    });
    document.getElementById('next-repo').addEventListener('click', () => {
        selectRepo(Math.min(activeIndex + 1, repos.length - 1));
    });
    document.getElementById('mark-reviewed').addEventListener('click', toggleReviewed);
}

// ── Toggle Reviewed ──
function toggleReviewed() {
    if (activeIndex < 0) return;
    const repo = repos[activeIndex];
    if (!reviewState.reviewed) reviewState.reviewed = {};
    reviewState.reviewed[repo.name] = !reviewState.reviewed[repo.name];
    saveState();
    renderRepoList();
    updateCounter();

    const btn = document.getElementById('mark-reviewed');
    if (reviewState.reviewed[repo.name]) {
        btn.classList.add('is-reviewed');
        btn.textContent = '✓ Reviewed';
        showToast(`${repo.name} marked as reviewed`);
    } else {
        btn.classList.remove('is-reviewed');
        btn.textContent = '✓ Mark Reviewed';
    }
}

// ── Resize Handle ──
function setupResizeHandle() {
    const handle = document.getElementById('resize-handle');
    const left = document.getElementById('left-panel');
    let dragging = false;

    handle.addEventListener('mousedown', (e) => {
        dragging = true;
        handle.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const newWidth = Math.max(250, Math.min(e.clientX, window.innerWidth - 400));
        left.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        dragging = false;
        handle.classList.remove('dragging');
    });
}

// ── Counter ──
function updateCounter() {
    const reviewed = repos.filter(r => reviewState.reviewed?.[r.name]).length;
    document.getElementById('repo-counter').textContent = `${reviewed} / ${repos.length} reviewed`;
}

// ── Persistence ──
function loadState() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reviewState));
}

// ── Utilities ──
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return new Date(dateStr).toLocaleDateString();
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}
