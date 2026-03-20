# ══════════════════════════════════════════════════════════════
# DataLeopard Workspace Launcher
# ══════════════════════════════════════════════════════════════
# Usage:
#   .\workspaces.ps1 review     — Repo review mode (Dashboard + Claude Code)
#   .\workspaces.ps1 dev        — Dev mode (VS Code + Browser + Terminal)
#   .\workspaces.ps1 cleanup    — Close everything, start fresh
#   .\workspaces.ps1             — Show menu
# ══════════════════════════════════════════════════════════════

param([string]$Mode = "menu")

function Show-Menu {
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║    DataLeopard Workspace Launcher        ║" -ForegroundColor Cyan
    Write-Host "  ╠══════════════════════════════════════════╣" -ForegroundColor Cyan
    Write-Host "  ║                                          ║" -ForegroundColor Cyan
    Write-Host "  ║  [1] Review Mode                         ║" -ForegroundColor Cyan
    Write-Host "  ║      Dashboard (left) + Claude Code (R)  ║" -ForegroundColor Cyan
    Write-Host "  ║                                          ║" -ForegroundColor Cyan
    Write-Host "  ║  [2] Dev Mode                            ║" -ForegroundColor Cyan
    Write-Host "  ║      VS Code (left) + Browser (right)    ║" -ForegroundColor Cyan
    Write-Host "  ║                                          ║" -ForegroundColor Cyan
    Write-Host "  ║  [3] Open All Live Sites                 ║" -ForegroundColor Cyan
    Write-Host "  ║      Every deployed app in tabs           ║" -ForegroundColor Cyan
    Write-Host "  ║                                          ║" -ForegroundColor Cyan
    Write-Host "  ║  [4] Cleanup                             ║" -ForegroundColor Cyan
    Write-Host "  ║      Kill dev servers, close extras       ║" -ForegroundColor Cyan
    Write-Host "  ║                                          ║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    $choice = Read-Host "  Pick a number"
    switch ($choice) {
        "1" { Start-ReviewMode }
        "2" { Start-DevMode }
        "3" { Open-AllLiveSites }
        "4" { Start-Cleanup }
        default { Write-Host "  Invalid choice" -ForegroundColor Red }
    }
}

function Start-ReviewMode {
    Write-Host "`n  Launching Review Mode..." -ForegroundColor Green

    # Open the dashboard
    Start-Process "https://dataleopard.github.io/Repo-Review-Dashboard/"
    Start-Sleep -Seconds 2

    # Open Claude Code in the Repo Review Dashboard folder
    $repoPath = "$env:USERPROFILE\OneDrive\03_PROJECTS\Repo_Review_Dashboard"
    Start-Process "cmd" -ArgumentList "/c cd /d `"$repoPath`" && claude" -WorkingDirectory $repoPath

    Write-Host ""
    Write-Host "  Ready! Now snap your windows:" -ForegroundColor Yellow
    Write-Host "    Win + Left  = Browser (Dashboard)" -ForegroundColor White
    Write-Host "    Win + Right = Claude Code" -ForegroundColor White
    Write-Host ""
    Write-Host "  Tip: Use Win+Tab to save this as a Virtual Desktop" -ForegroundColor Cyan
}

function Start-DevMode {
    Write-Host "`n  Launching Dev Mode..." -ForegroundColor Green

    # Open VS Code to the projects folder
    $projectsPath = "$env:USERPROFILE\OneDrive\03_PROJECTS"
    Start-Process "code" -ArgumentList $projectsPath

    # Open GitHub in browser
    Start-Process "https://github.com/DataLeopard"
    Start-Sleep -Seconds 1

    Write-Host ""
    Write-Host "  Ready! Snap your windows:" -ForegroundColor Yellow
    Write-Host "    Win + Left  = VS Code" -ForegroundColor White
    Write-Host "    Win + Right = Browser" -ForegroundColor White
}

function Open-AllLiveSites {
    Write-Host "`n  Opening all live sites..." -ForegroundColor Green

    $sites = @(
        "https://dataleopard.github.io/georgetowntrails/",
        "https://dataleopard.github.io/austin-locator/",
        "https://dataleopard.github.io/apartment-locator/",
        "https://dataleopard.github.io/guestcard-dashboard/",
        "https://dataleopard.github.io/guestcard-chat/",
        "https://dataleopard.github.io/Repo-Review-Dashboard/"
    )

    foreach ($site in $sites) {
        Start-Process $site
        Start-Sleep -Milliseconds 400
    }

    # Also open code-only repos on GitHub
    $codeRepos = @(
        "https://github.com/DataLeopard/Code-Improvement-Agent",
        "https://github.com/DataLeopard/Split-Screen-Prompt-Paste",
        "https://github.com/DataLeopard/Quinoa_Application",
        "https://github.com/DataLeopard/3_Day_workshop"
    )

    foreach ($repo in $codeRepos) {
        Start-Process $repo
        Start-Sleep -Milliseconds 400
    }

    Write-Host "  All 10 repos open! Ctrl+Tab to flip through." -ForegroundColor Green
}

function Start-Cleanup {
    Write-Host "`n  Cleaning up..." -ForegroundColor Yellow

    # Kill Node dev servers
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        $nodeProcs | Stop-Process -Force
        Write-Host "  Killed $($nodeProcs.Count) Node processes" -ForegroundColor Red
    } else {
        Write-Host "  No Node processes running" -ForegroundColor Green
    }

    # Show what's listening on ports
    Write-Host "`n  Ports still in use:" -ForegroundColor Cyan
    Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -lt 10000 -and $_.LocalPort -gt 1024 } |
        Select-Object LocalPort, @{N='Process';E={(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName}} |
        Sort-Object LocalPort |
        Format-Table -AutoSize

    Write-Host "  Cleanup done!" -ForegroundColor Green
}

# ── Run ──
switch ($Mode.ToLower()) {
    "review"  { Start-ReviewMode }
    "dev"     { Start-DevMode }
    "live"    { Open-AllLiveSites }
    "cleanup" { Start-Cleanup }
    default   { Show-Menu }
}
