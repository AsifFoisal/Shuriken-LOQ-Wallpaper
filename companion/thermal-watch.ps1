<#
  Shuriken companion - thermal mode watcher (Fn+Q power mode).
  Runs elevated via the ShurikenThermalWatch scheduled task: the Lenovo GameZone
  WMI methods require admin rights. Writes the current mode to -OutFile whenever
  it changes (0 = quiet, 1 = balance, 2 = performance). The companion service
  picks the file up and serves it at /api/thermal.
#>
param([Parameter(Mandatory = $true)][string]$OutFile)

$ErrorActionPreference = 'SilentlyContinue'
$script:lastErr = ''

function Get-Mode {
  $script:lastErr = ''
  # the GameZone provider only answers on its instance, not statically
  $inst = Get-CimInstance -Namespace root/WMI -ClassName LENOVO_GAMEZONE_DATA | Select-Object -First 1
  if (-not $inst) { $script:lastErr = 'no WMI instance (access denied?)'; return -1 }
  $r = Invoke-CimMethod -InputObject $inst -MethodName GetSmartFanMode
  # ReturnValue is a boolean success flag here; the mode arrives in the out 'Data' param
  if ($r -and $null -ne $r.Data -and [int]$r.Data -ge 0) { return [int]$r.Data }
  $script:lastErr = 'method failed: ret=' + $r.ReturnValue
  return -1
}

$prev = Get-Mode
if ($prev -lt 0) {
  Set-Content -LiteralPath $OutFile -Value ('unsupported: ' + $script:lastErr) -Encoding ASCII
  exit 1
}
Set-Content -LiteralPath $OutFile -Value $prev -Encoding ASCII

# Push events fire on Fn+Q; the periodic re-query is a safety net.
Register-CimIndicationEvent -Namespace root/WMI -ClassName LENOVO_GAMEZONE_THERMAL_MODE_EVENT -SourceIdentifier ShurikenThermal | Out-Null

while ($true) {
  $e = Wait-Event -SourceIdentifier ShurikenThermal -Timeout 5
  if ($e) {
    # events are only a trigger; some payloads lag, so always re-query the EC
    Remove-Event -EventIdentifier $e.EventIdentifier
    $m = Get-Mode
  } else {
    $m = Get-Mode
  }
  if ($m -ge 0 -and $m -ne $prev) {
    $prev = $m
    Set-Content -LiteralPath $OutFile -Value $prev -Encoding ASCII
  }
}
