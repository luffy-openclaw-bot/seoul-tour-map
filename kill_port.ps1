$Port = 8092

# Read PORT from .env if it exists
if (Test-Path .env) {
    foreach ($line in Get-Content .env) {
        if ($line -match '^PORT=(.*)') {
            $Port = $matches[1].Trim()
        }
    }
}

Write-Host "Looking for processes listening on port $Port..."
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

if ($connections) {
    foreach ($conn in $connections) {
        $processId = $conn.OwningProcess
        if ($processId -ne 0) {
            $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
            if ($process) {
                Write-Host "Killing process '$($process.ProcessName)' (PID: $processId) on port $Port..."
                Stop-Process -Id $processId -Force
            }
        }
    }
    Write-Host "Port $Port has been cleared."
} else {
    Write-Host "No process is currently listening on port $Port."
}
