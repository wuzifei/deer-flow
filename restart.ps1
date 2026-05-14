# restart.ps1 - DeerFlow restart script for Windows
# Usage: powershell -ExecutionPolicy Bypass -File .\restart.ps1
# Optional: -GatewayPort 8001 -FrontendPort 3000

param(
    [int]$GatewayPort  = 8002,
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step($msg) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

# === Step 1: Kill old processes ===
Write-Step "Step 1/5: Stop old processes"

foreach ($port in @($GatewayPort, $FrontendPort)) {
    $label = if ($port -eq $GatewayPort) { "Gateway" } else { "Frontend" }
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "  OK ${label} port ${port} is free" -ForegroundColor Green
        continue
    }
    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        try {
            Write-Host "  Kill ${label} PID ${procId}" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Host "  PID ${procId} already gone" -ForegroundColor Gray
        }
    }
    # Wait for port release
    $waited = 0
    while ($waited -lt 10) {
        Start-Sleep -Seconds 1
        $still = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        if (-not $still) { break }
        $waited++
    }
    if ($waited -ge 10) {
        Write-Host "  WARN ${label} port ${port} still in use" -ForegroundColor Yellow
    } else {
        Write-Host "  OK ${label} port ${port} released" -ForegroundColor Green
    }
}

# === Step 2: Check dependencies ===
Write-Step "Step 2/5: Check dependencies"

$hasError = $false
foreach ($cmd in @("node", "pnpm", "python", "uv")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Host "  FAIL $cmd not found" -ForegroundColor Red
        $hasError = $true
    } else {
        $ver = & $cmd --version 2>&1 | Select-Object -First 1
        Write-Host "  OK ${cmd}: $ver" -ForegroundColor Green
    }
}
if ($hasError) {
    Write-Host "  Missing dependencies. Install them first." -ForegroundColor Red
    exit 1
}

# === Step 3: Check config ===
Write-Step "Step 3/5: Check config"

if (Test-Path "$RepoRoot\config.yaml") {
    Write-Host "  OK config.yaml exists" -ForegroundColor Green
} else {
    Write-Host "  FAIL config.yaml not found. Run: make config" -ForegroundColor Red
    exit 1
}

# Load .env
$envFile = "$RepoRoot\.env"
if (Test-Path $envFile) {
    Write-Host "  OK .env exists" -ForegroundColor Green
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx = $line.IndexOf('=')
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            Set-Item -Path "env:$key" -Value $val
        }
    }
} else {
    Write-Host "  WARN .env not found" -ForegroundColor Yellow
}

if ($env:OPENAI_API_KEY -and $env:OPENAI_API_KEY -ne 'sk-xxx') {
    Write-Host "  OK OPENAI_API_KEY is set" -ForegroundColor Green
} else {
    Write-Host "  WARN OPENAI_API_KEY not set or placeholder" -ForegroundColor Yellow
}

# Install deps if missing
if (-not (Test-Path "$RepoRoot\backend\.venv\Scripts\python.exe")) {
    Write-Host "  Installing backend deps..." -ForegroundColor Gray
    Push-Location "$RepoRoot\backend"; uv sync --quiet; Pop-Location
}
if (-not (Test-Path "$RepoRoot\frontend\node_modules")) {
    Write-Host "  Installing frontend deps..." -ForegroundColor Gray
    Push-Location "$RepoRoot\frontend"; pnpm install --silent; Pop-Location
}

# === Step 4: Start services ===
Write-Step "Step 4/5: Start services"

$logDir = "$RepoRoot\logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Start Gateway
Write-Host "  Starting Gateway on port $GatewayPort ..." -ForegroundColor Gray
$gwLog = "$logDir\gateway.log"

# Ensure env vars are clean (no trailing whitespace)
$env:OPENAI_API_KEY = $env:OPENAI_API_KEY.Trim()
$env:OPENAI_BASE_URL = $env:OPENAI_BASE_URL.Trim()

# Write a temporary launcher script to avoid cmd.exe set whitespace issues
$gwLauncher = "$logDir\_start_gateway.cmd"
$gwPython = "$RepoRoot\backend\.venv\Scripts\python.exe"
@"
@echo off
cd /d "$RepoRoot\backend"
set "OPENAI_API_KEY=$env:OPENAI_API_KEY"
set "OPENAI_BASE_URL=$env:OPENAI_BASE_URL"
"$gwPython" -m uvicorn app.gateway.app:app --host 0.0.0.0 --port $GatewayPort >> "$gwLog" 2>&1
"@ | Set-Content $gwLauncher -Encoding ASCII

$gwProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$gwLauncher`"" -WindowStyle Hidden -PassThru
Write-Host "  Gateway PID: $($gwProc.Id)" -ForegroundColor Gray

# Start Frontend
Write-Host "  Starting Frontend on port $FrontendPort ..." -ForegroundColor Gray
$feLog = "$logDir\frontend.log"
$feLauncher = "$logDir\_start_frontend.cmd"
@"
@echo off
cd /d "$RepoRoot\frontend"
call npx next dev --port $FrontendPort >> "$feLog" 2>&1
"@ | Set-Content $feLauncher -Encoding ASCII

$feProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$feLauncher`"" -WindowStyle Hidden -PassThru
Write-Host "  Frontend PID: $($feProc.Id)" -ForegroundColor Gray

# === Step 5: Health check ===
Write-Step "Step 5/5: Health check"

function Test-Endpoint {
    param([string]$Url, [string]$Label, [int]$TimeoutSec = 30)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -UseBasicParsing -MaximumRedirection 5 -ErrorAction Stop
            Write-Host "  OK ${Label} (HTTP $($resp.StatusCode))" -ForegroundColor Green
            return $true
        } catch {
            $code = 0
            if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
            if ($code -eq 401 -or $code -eq 308 -or $code -eq 301 -or $code -eq 302) {
                Write-Host "  OK ${Label} (HTTP $code - service running)" -ForegroundColor Green
                return $true
            }
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "  FAIL ${Label} not responding after ${TimeoutSec}s" -ForegroundColor Red
    return $false
}

$gwOk = Test-Endpoint -Url "http://127.0.0.1:$GatewayPort/docs" -Label "Gateway" -TimeoutSec 30
$feOk = Test-Endpoint -Url "http://127.0.0.1:$FrontendPort/deerflow/" -Label "Frontend" -TimeoutSec 60

# Summary
Write-Host ""
if ($gwOk -and $feOk) {
    Write-Host "  DeerFlow started successfully!" -ForegroundColor Green
} else {
    Write-Host "  Some services failed to start" -ForegroundColor Red
    if (-not $gwOk -and (Test-Path $gwLog)) {
        Write-Host "`n  Gateway log (last 15 lines):" -ForegroundColor Yellow
        Get-Content $gwLog -Tail 15
    }
    if (-not $feOk -and (Test-Path $feLog)) {
        Write-Host "`n  Frontend log (last 15 lines):" -ForegroundColor Yellow
        Get-Content $feLog -Tail 15
    }
}

Write-Host ""
Write-Host "  Gateway:   http://localhost:$GatewayPort" -ForegroundColor White
Write-Host "  Frontend:  http://localhost:$FrontendPort/deerflow" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:$GatewayPort/docs" -ForegroundColor White
Write-Host ""
Write-Host "  Logs: $logDir\gateway.log, $logDir\frontend.log" -ForegroundColor Gray

# Save PIDs
@{ gateway = $gwProc.Id; frontend = $feProc.Id } | ConvertTo-Json | Set-Content "$logDir\pids.json" -Encoding UTF8
Write-Host "  Stop: .\stop.ps1" -ForegroundColor Gray
