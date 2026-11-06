# Registers the Shuriken companion to start automatically when you sign in to Windows.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error "Node.js is not installed or not on PATH."; exit 1 }
if (-not (Test-Path (Join-Path $dir 'node_modules'))) { Push-Location $dir; npm install --omit=dev; Pop-Location }
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Shuriken Companion.lnk'
$sh = New-Object -ComObject WScript.Shell
$sc = $sh.CreateShortcut($lnk)
$sc.TargetPath = "$env:WINDIR\System32\wscript.exe"
$sc.Arguments = '"' + (Join-Path $dir 'start-hidden.vbs') + '"'
$sc.WorkingDirectory = $dir
$sc.Description = 'Shuriken wallpaper companion service'
$sc.Save()
Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList ('"' + (Join-Path $dir 'start-hidden.vbs') + '"')
Write-Host "Shuriken companion installed to startup and started: http://127.0.0.1:47811/api/system/status"
