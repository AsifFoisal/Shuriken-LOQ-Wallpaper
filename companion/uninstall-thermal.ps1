<#
  Removes the Shuriken thermal watcher task and its state file.
#>
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $MyInvocation.MyCommand.Path)
  )
  Write-Host 'Thermal sync task removed.'
  exit 0
}
Unregister-ScheduledTask -TaskName 'ShurikenThermalWatch' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $env:APPDATA 'ShurikenWallpaper\thermal.txt') -Force -ErrorAction SilentlyContinue
Write-Host 'ShurikenThermalWatch task removed.'
