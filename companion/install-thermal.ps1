<#
  Installs the Shuriken thermal watcher as an elevated scheduled task (one UAC
  prompt). The task runs at every logon and reports Fn+Q power-mode changes to
  the companion service.
#>
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f (Join-Path $dir 'install-thermal.ps1'))
  )
  Write-Host 'Thermal sync task installed (elevated).'
  exit 0
}

$outFile = Join-Path $env:APPDATA 'ShurikenWallpaper\thermal.txt'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
  '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}" -OutFile "{1}"' -f (Join-Path $dir 'thermal-watch.ps1'), $outFile
)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName 'ShurikenThermalWatch' -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName 'ShurikenThermalWatch'
Write-Host 'ShurikenThermalWatch task registered and started.'
