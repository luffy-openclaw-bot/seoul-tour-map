#!/bin/bash

# Default port
PORT=8092

# Read PORT from .env if it exists
if [ -f .env ]; then
    while IFS= read -r line; do
        if [[ "$line" =~ ^PORT=(.*) ]]; then
            PORT="${BASH_REMATCH[1]}"
            PORT=$(echo "$PORT" | xargs)  # Trim whitespace
        fi
    done < .env
fi

powershell -NoProfile -Command "
\$port = [int]'$PORT'
Write-Host \"Looking for processes listening on port \$port...\"

for (\$attempt = 1; \$attempt -le 3; \$attempt++) {
    \$connections = Get-NetTCPConnection -LocalPort \$port -State Listen -ErrorAction SilentlyContinue |
        Sort-Object OwningProcess -Unique

    if (-not \$connections) {
        if (\$attempt -eq 1) {
            Write-Host \"No process is currently listening on port \$port.\"
        } else {
            Write-Host \"Port \$port has been cleared.\"
        }
        exit 0
    }

    foreach (\$conn in \$connections) {
        \$processId = \$conn.OwningProcess
        if (\$processId -eq 0) {
            continue
        }

        \$process = Get-CimInstance Win32_Process -Filter \"ProcessId = \$processId\" -ErrorAction SilentlyContinue
        if (-not \$process) {
            continue
        }

        Write-Host \"Killing process '\$($process.Name)' (PID: \$processId) on port \$port...\"
        Stop-Process -Id \$processId -Force -ErrorAction SilentlyContinue

        \$parentId = \$process.ParentProcessId
        if (\$parentId -and \$parentId -ne 0) {
            \$parent = Get-CimInstance Win32_Process -Filter \"ProcessId = \$parentId\" -ErrorAction SilentlyContinue
            if (\$parent) {
                \$parentCmd = [string]\$parent.CommandLine
                \$isTraeShell = (\$parent.Name -match '^(bash|sh)\.exe$') -and
                    (\$parentCmd -match 'shellIntegration-bash\.sh' -or \$parentCmd -match '\\\\Trae\\\\')

                if (\$isTraeShell) {
                    Write-Host \"Killing parent Trae shell '\$($parent.Name)' (PID: \$parentId)...\"
                    Stop-Process -Id \$parentId -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }

    Start-Sleep -Milliseconds 500
}

\$remaining = Get-NetTCPConnection -LocalPort \$port -State Listen -ErrorAction SilentlyContinue |
    Sort-Object OwningProcess -Unique

if (\$remaining) {
    \$remainingIds = (\$remaining | Select-Object -ExpandProperty OwningProcess) -join ', '
    Write-Host \"Port \$port is still in use by PID(s): \$remainingIds\"
    exit 1
}

Write-Host \"Port \$port has been cleared.\"
"
