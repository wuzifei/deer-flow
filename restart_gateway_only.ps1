# Restart deer-flow gateway only (port 8001), venv python + .env + log to file
$ErrorActionPreference = 'Continue'
$repo = 'E:\Code\Git\helper\deer-flow'
$port = 8001
Set-Location $repo

# 1. Kill old gateway on $port
$conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($conns) {
    $procId = ($conns | Select-Object -First 1 -ExpandProperty OwningProcess)
    Write-Host "Killing old gateway PID $procId"
    Stop-Process -Id $procId -Force
    Start-Sleep -Seconds 3
} else {
    Write-Host "No process on $port"
}

# 2. Build cmd launcher with .env loaded (venv python + log redirect)
$envFile = "$repo\.env"
$envLines = @()
if (Test-Path $envFile) {
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $idx = $line.IndexOf('=')
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            $envLines += "set `"$key=$val`""
        }
    }
}
$envBlock = $envLines -join "`r`n"
$gwPython = "$repo\backend\.venv\Scripts\python.exe"
$gwLog = "$repo\logs\gateway.log"
$launcher = "$repo\logs\_restart_gw.cmd"
@"
@echo off
cd /d "$repo\backend"
$envBlock
"$gwPython" -m uvicorn app.gateway.app:app --host 0.0.0.0 --port $port >> "$gwLog" 2>&1
"@ | Set-Content $launcher -Encoding ASCII

# 3. Start gateway detached
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$launcher`"" -WindowStyle Hidden -PassThru
Write-Host "Gateway launcher PID: $($proc.Id)"
Write-Host "Log: $gwLog"
