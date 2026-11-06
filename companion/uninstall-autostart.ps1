# Removes the Shuriken companion from Windows startup and stops it.
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Shuriken Companion.lnk'
# Also clean up the shortcut from the previous project name
$legacy = Join-Path ([Environment]::GetFolderPath('Startup')) 'NEXUS Companion.lnk'
if (Test-Path $legacy) { Remove-Item $legacy -Force }
if (Test-Path $lnk) { Remove-Item $lnk -Force }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*server.mjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Shuriken companion removed from startup."
