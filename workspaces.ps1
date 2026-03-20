param([string]$Mode = "menu")

function Show-Menu {
    Write-Host ""
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host "     DataLeopard Workspace Launcher" -ForegroundColor Cyan
    Write-Host "  ========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] Review Mode  (Dashboard + Claude)" -ForegroundColor Green
    Write-Host "  [2] Dev Mode     (VS Code + Browser)" -ForegroundColor Yellow
    Write-Host "  [3] Open All Live Sites" -ForegroundColor Blue
    Write-Host "  [4] Cleanup      (Kill servers)" -ForegroundColor Red
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
    Write-Host ""
    Write-Host "  Launching Review Mode..." -ForegroundColor Green

    Start-Process "https://dataleopard.github.io/Repo-Review-Dashboard/"
    Start-Sleep -Seconds 2

    $repoPath = "$env:USERPROFILE\OneDrive\03_PROJECTS\Repo_Review_Dashboard"
    Start-Process "cmd" -ArgumentList "/c cd /d ""$repoPath"" & claude" -WorkingDirectory $repoPath

    Write-Host ""
    Write-Host "  Ready! Snap your windows:" -ForegroundColor Yellow
    Write-Host "    Win + Left  = Browser (Dashboard)" -ForegroundColor White
    Write-Host "    Win + Right = Claude Code" -ForegroundColor White
}

function Start-DevMode {
    Write-Host ""
    Write-Host "  Launching Dev Mode..." -ForegroundColor Green

    $projectsPath = "$env:USERPROFILE\OneDrive\03_PROJECTS"
    Start-Process "code" -ArgumentList $projectsPath
    Start-Process "https://github.com/DataLeopard"

    Write-Host ""
    Write-Host "  Ready! Snap your windows:" -ForegroundColor Yellow
    Write-Host "    Win + Left  = VS Code" -ForegroundColor White
    Write-Host "    Win + Right = Browser" -ForegroundColor White
}

function Open-AllLiveSites {
    Write-Host ""
    Write-Host "  Opening all live sites..." -ForegroundColor Green

    $sites = @(
        "https://dataleopard.github.io/georgetowntrails/",
        "https://dataleopard.github.io/apartment-locator/",
        "https://dataleopard.github.io/guestcard-dashboard/",
        "https://dataleopard.github.io/guestcard-chat/",
        "https://dataleopard.github.io/Repo-Review-Dashboard/"
    )

    $codeRepos = @(
        "https://github.com/DataLeopard/Code-Improvement-Agent",
        "https://github.com/DataLeopard/Split-Screen-Prompt-Paste",
        "https://github.com/DataLeopard/Quinoa_Application",
        "https://github.com/DataLeopard/3_Day_workshop",
        "https://github.com/DataLeopard/locator-platform"
    )

    foreach ($site in $sites) {
        Start-Process $site
        Start-Sleep -Milliseconds 400
    }

    foreach ($repo in $codeRepos) {
        Start-Process $repo
        Start-Sleep -Milliseconds 400
    }

    Write-Host "  All 10 repos open! Ctrl+Tab to flip through." -ForegroundColor Green
}

function Start-Cleanup {
    Write-Host ""
    Write-Host "  Cleaning up..." -ForegroundColor Yellow

    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        $nodeProcs | Stop-Process -Force
        Write-Host "  Killed $($nodeProcs.Count) Node processes" -ForegroundColor Red
    } else {
        Write-Host "  No Node processes running" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "  Cleanup done!" -ForegroundColor Green
}

switch ($Mode.ToLower()) {
    "review"  { Start-ReviewMode }
    "dev"     { Start-DevMode }
    "live"    { Open-AllLiveSites }
    "cleanup" { Start-Cleanup }
    default   { Show-Menu }
}
