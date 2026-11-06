<#
  Shuriken companion - Windows application discovery.
  Outputs a JSON array of discovered applications to stdout.
  Icons are extracted as PNG files into -IconDir (cached by id).
#>
param(
  [Parameter(Mandatory = $true)][string]$IconDir,
  [switch]$ForceIcons
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

# SHDefExtractIcon pulls the jumbo (256px) icon directly from exe/dll/ico files,
# so tiles stay sharp at any icon size. ExtractAssociatedIcon only offers 32px.
if (-not ('ShIcon' -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class ShIcon {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern uint SHDefExtractIcon(string pszIconFile, int iIndex, uint uFlags, out IntPtr hiconLarge, out IntPtr hiconSmall, uint nIconSize);
  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr hIcon);
}
"@
}

if (-not (Test-Path -LiteralPath $IconDir)) { New-Item -ItemType Directory -Path $IconDir -Force | Out-Null }

$shell = New-Object -ComObject WScript.Shell
$md5 = [System.Security.Cryptography.MD5]::Create()
$results = New-Object System.Collections.ArrayList

# Names / targets that are not useful launcher entries
$skipName = '(?i)(uninstall|readme|read me|help|documentation|release notes|changelog|website|web site|manual|license|licence|eula|setup|installer|repair|feedback|support|what''s new|\bsdk\b|redistributable|runtime|driver|debugger|tutorial|sample|faq|on the web|homepage|safe mode|reset)'
$skipExt = '(?i)\.(chm|txt|pdf|htm|html|rtf|md|log|ini|msc|cpl|bat|cmd|vbs|reg|msi|xml|json)$'

function Get-Id([string]$s) {
  $bytes = $md5.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($s.ToLowerInvariant()))
  (($bytes | ForEach-Object { $_.ToString('x2') }) -join '').Substring(0, 12)
}

function Split-IconLocation([string]$loc) {
  if (-not $loc) { return $null }
  $p = $loc.Trim().Trim('"')
  $p = ($p -replace ',\s*-?\d+\s*$', '').Trim('"')
  $p = [Environment]::ExpandEnvironmentVariables($p)
  if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  return $null
}

function Save-Icon([string]$id, [string[]]$candidates) {
  $file = Join-Path $IconDir ($id + '.png')
  if ((Test-Path -LiteralPath $file) -and -not $ForceIcons) { return $true }
  foreach ($c in $candidates) {
    if (-not $c) { continue }
    if (-not (Test-Path -LiteralPath $c)) { continue }
    try {
      $hl = [IntPtr]::Zero; $hs = [IntPtr]::Zero
      $size = 256 -bor (48 -shl 16)
      if ([ShIcon]::SHDefExtractIcon($c, 0, 0, [ref]$hl, [ref]$hs, $size) -eq 0 -and $hl -ne [IntPtr]::Zero) {
        $bmp = [System.Drawing.Icon]::FromHandle($hl).ToBitmap()
        $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        [ShIcon]::DestroyIcon($hl) | Out-Null
        [ShIcon]::DestroyIcon($hs) | Out-Null
        return $true
      }
    } catch { }
    try {
      $ico = [System.Drawing.Icon]::ExtractAssociatedIcon($c)
      if ($ico) {
        $bmp = $ico.ToBitmap()
        $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose(); $ico.Dispose()
        return $true
      }
    } catch { }
  }
  return $false
}

function Add-Result($entry) { [void]$results.Add([pscustomobject]$entry) }

# ---------------------------------------------------------------- Shortcuts
$folders = @(
  @{ Path = [Environment]::GetFolderPath('StartMenu');              Source = 'startmenu-user'; Recurse = $true },
  @{ Path = [Environment]::GetFolderPath('CommonStartMenu');        Source = 'startmenu-all';  Recurse = $true },
  @{ Path = [Environment]::GetFolderPath('Desktop');                Source = 'desktop-user';   Recurse = $false },
  @{ Path = [Environment]::GetFolderPath('CommonDesktopDirectory'); Source = 'desktop-public'; Recurse = $false }
)

foreach ($f in $folders) {
  if (-not $f.Path -or -not (Test-Path -LiteralPath $f.Path)) { continue }
  $items = if ($f.Recurse) { Get-ChildItem -LiteralPath $f.Path -Recurse -File } else { Get-ChildItem -LiteralPath $f.Path -File }
  foreach ($item in $items) {
    $ext = $item.Extension.ToLowerInvariant()
    if ($ext -ne '.lnk' -and $ext -ne '.url') { continue }
    $name = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
    if ($name -match $skipName) { continue }

    if ($ext -eq '.lnk') {
      $sc = $shell.CreateShortcut($item.FullName)
      $target = [Environment]::ExpandEnvironmentVariables([string]$sc.TargetPath)
      if ($target -and ($target -match $skipExt)) { continue }
      if ($target -and ($target -match '(?i)\\(unins\d*|uninstall)[^\\]*\.exe$')) { continue }
      $key = if ($target -and $target -match '(?i)\.exe$') { $target + '|' + [string]$sc.Arguments } else { $item.FullName }
      $id = Get-Id $key
      $iconPath = Split-IconLocation ([string]$sc.IconLocation)
      $hasIcon = Save-Icon $id @($iconPath, $target, $item.FullName)
      Add-Result @{
        id = $id; name = $name; source = $f.Source; kind = 'shortcut'
        shortcut = $item.FullName; target = $target; args = [string]$sc.Arguments
        workingDir = [string]$sc.WorkingDirectory; icon = $hasIcon
        location = if ($target) { $target } else { $item.FullName }
      }
    } else {
      # Internet shortcut (.url) - keep only app protocols (steam://, com.epicgames.launcher://, ...)
      $content = Get-Content -LiteralPath $item.FullName -Raw
      $url = if ($content -match '(?im)^URL=(.+)$') { $Matches[1].Trim() } else { '' }
      if (-not $url -or $url -match '(?i)^(https?|ftp|file|mailto):') { continue }
      $iconFile = if ($content -match '(?im)^IconFile=(.+)$') { Split-IconLocation $Matches[1].Trim() } else { $null }
      $id = Get-Id ($item.FullName)
      $hasIcon = Save-Icon $id @($iconFile)
      Add-Result @{
        id = $id; name = $name; source = $f.Source; kind = 'url'
        shortcut = $item.FullName; target = $url; args = ''; workingDir = ''
        icon = $hasIcon; location = $item.FullName
      }
    }
  }
}

# ---------------------------------------------------------------- Registry
$regPaths = @(
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($rp in $regPaths) {
  foreach ($e in (Get-ItemProperty -Path $rp)) {
    $name = [string]$e.DisplayName
    if (-not $name) { continue }
    if ($e.SystemComponent -eq 1 -or $e.ParentKeyName -or $e.ReleaseType) { continue }
    if ($name -match $skipName -or $name -match '(?i)(update|hotfix|security|\bkb\d+|language pack|visual c\+\+|\.net|framework|helper|service|bootstrapper|plugin|plug-in|extension)') { continue }
    $exe = $null
    $icon = Split-IconLocation ([string]$e.DisplayIcon)
    if ($icon -and $icon -match '(?i)\.exe$' -and $icon -notmatch '(?i)(unins|uninstall|setup|install)') { $exe = $icon }
    if (-not $exe -and $e.InstallLocation -and (Test-Path -LiteralPath $e.InstallLocation)) {
      $guess = Get-ChildItem -LiteralPath $e.InstallLocation -Filter *.exe -File |
        Where-Object { $_.Name -notmatch '(?i)(unins|uninstall|setup|install|update|crash|helper|report)' } |
        Sort-Object Length -Descending | Select-Object -First 1
      if ($guess) { $exe = $guess.FullName }
    }
    if (-not $exe) { continue }
    $id = Get-Id ($exe + '|')
    $hasIcon = Save-Icon $id @($exe, $icon)
    Add-Result @{
      id = $id; name = $name; source = 'registry'; kind = 'exe'
      shortcut = ''; target = $exe; args = ''; workingDir = (Split-Path -Parent $exe)
      icon = $hasIcon; location = $exe
    }
  }
}

# ---------------------------------------------------------------- Store (UWP) apps
$pkgByFamily = @{}
foreach ($p in (Get-AppxPackage)) { $pkgByFamily[$p.PackageFamilyName] = $p }

# Copy the app's own packaged logo PNG (resolving the scale/targetsize variants the manifest omits)
function Get-UwpIcon([string]$family, [string]$praid, [string]$id) {
  $file = Join-Path $IconDir ($id + '.png')
  if ((Test-Path -LiteralPath $file) -and -not $ForceIcons) { return $true }
  $pkg = $pkgByFamily[$family]
  if (-not $pkg -or -not $pkg.InstallLocation) { return $false }
  try {
    $manifest = [xml](Get-Content -LiteralPath (Join-Path $pkg.InstallLocation 'AppxManifest.xml') -Raw)
    $ns = New-Object System.Xml.XmlNamespaceManager($manifest.NameTable)
    $ns.AddNamespace('d', 'http://schemas.microsoft.com/appx/manifest/foundation/windows10')
    $app = $manifest.SelectNodes('//d:Applications/d:Application', $ns) | Where-Object { $_.Id -eq $praid } | Select-Object -First 1
    if (-not $app -or -not $app.VisualElements) { return $false }
    $logo = [string]$app.VisualElements.GetAttribute('Square44x44Logo')
    if (-not $logo) { $logo = [string]$app.VisualElements.GetAttribute('Square150x150Logo') }
    if (-not $logo) { $logo = [string]$app.VisualElements.GetAttribute('Logo') }
    if (-not $logo) { return $false }
    $base = Join-Path $pkg.InstallLocation ($logo -replace '/', '\')
    $dir = Split-Path -Parent $base
    if (-not (Test-Path -LiteralPath $dir)) { return $false }
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($base)
    $ext = [System.IO.Path]::GetExtension($base)
    if (-not $ext) { $ext = '.png' }
    $candidates = @()
    foreach ($s in @('400','200','150','125','100')) { $candidates += (Join-Path $dir ($stem + '.scale-' + $s + $ext)) }
    foreach ($t in @('256','48','32','24','16')) { $candidates += (Join-Path $dir ($stem + '.targetsize-' + $t + $ext)) }
    $candidates += $base
    foreach ($c in $candidates) {
      if (Test-Path -LiteralPath $c) { Copy-Item -LiteralPath $c -Destination $file -Force; return $true }
    }
    # last resort: any variant of the logo stem (altform-unplated etc.), biggest file first
    $any = Get-ChildItem -LiteralPath $dir -Filter ($stem + '*' + $ext) -File | Sort-Object Length -Descending | Select-Object -First 1
    if ($any) { Copy-Item -LiteralPath $any.FullName -Destination $file -Force; return $true }
    return $false
  } catch { return $false }
}

if (Get-Command Get-StartApps -ErrorAction SilentlyContinue) {
  foreach ($a in (Get-StartApps)) {
    if (-not $a.AppID -or $a.AppID -notmatch '!') { continue }
    if ($a.Name -match $skipName) { continue }
    $id = Get-Id ('uwp|' + $a.AppID)
    $family, $praid = $a.AppID -split '!', 2
    $hasIcon = Get-UwpIcon $family $praid $id
    Add-Result @{
      id = $id; name = [string]$a.Name; source = 'store'; kind = 'uwp'
      shortcut = ''; target = [string]$a.AppID; args = ''; workingDir = ''
      icon = $hasIcon; location = 'shell:AppsFolder\' + $a.AppID
    }
  }
}

ConvertTo-Json -InputObject @($results) -Depth 3 -Compress
