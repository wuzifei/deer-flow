# stop.ps1 - Stop DeerFlow services
$ErrorActionPreference = "Continue"
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$logDir = "$RepoRoot\logs"
$pidFile = "$logDir\pids.json"

Write-Host "Stopping DeerFlow..." -ForegroundColor Cyan

# Kill by PID file
if (Test-Path $pidFile) {
    $data = Get-Content $pidFile -Encoding UTF8 | ConvertFrom-Json
    foreach ($prop in $data.PSObject.Properties) {
        $procId = $prop.Value
        try {
            $p = Get-Process -Id $procId -ErrorAction Stop
            Write-Host "  Kill $($prop.Name) (PID $procId)" -ForegroundColor Yellow
            Stop-Process -Id $procId -Force
        } catch {}
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

# Kill by port (cleanup leftovers)
foreach ($port in @(8001, 3000)) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $portPids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $portPids) {
            try {
                Stop-Process -Id $procId -Force
                Write-Host "  Kill PID $procId on port $port" -ForegroundColor Yellow
            } catch {}
        }
    }
}

Start-Sleep -Seconds 2
Write-Host "DeerFlow stopped." -ForegroundColor Green
