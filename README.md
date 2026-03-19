# Repo Review Dashboard

Split-screen dashboard to quickly review all DataLeopard repos. See recent changes, check off review items, and take notes — all from one screen.

## Features

- **Split-screen layout**: Repo navigation on the left, code/README/diff preview on the right
- **Resizable panels**: Drag the divider to adjust the split
- **Recent changes**: See latest commits with expandable file-level diffs
- **Review checklist**: Per-repo checklist (secrets, tests, error handling, etc.)
- **Notes**: Per-repo notes saved to localStorage
- **Keyboard navigation**: Arrow keys, `R` to mark reviewed, `Enter` to open on GitHub
- **Progress tracking**: Counter shows how many repos you've reviewed

## Quick Start

Just open `index.html` in your browser. No build step needed.

If you hit GitHub API rate limits, the app will prompt for a personal access token.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `k` | Previous repo |
| `↓` / `j` | Next repo |
| `←` / `→` | Previous / Next repo |
| `R` | Toggle reviewed |
| `Enter` | Open repo on GitHub |

## View Modes

- **README Preview**: Rendered README content
- **GitHub Repo**: Full GitHub page in iframe
- **Recent Diff**: Color-coded diff of the latest commit
- **File Browser**: Complete file tree with click-to-open
