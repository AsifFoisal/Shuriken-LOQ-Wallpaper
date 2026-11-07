<#
  Shuriken companion - icon extraction for pinned files and folders.
  Extracts the shell icon (or a thumbnail for images) of any filesystem path
  as a 256px PNG into -IconDir, cached by -Id.
  Outputs { "ok": true, "icon": true|false } to stdout.
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$Id,
  [Parameter(Mandatory = $true)][string]$IconDir,
  [switch]$Force
)

$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

if (-not ('ShPin' -as [type])) {
  Add-Type -ReferencedAssemblies System.Drawing.dll -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class ShPin {
  // IShellItemImageFactory::GetImage works for ANY shell item (files, folders,
  // shortcuts, drives) and honours desktop.ini custom folder icons.
  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b")]
  public interface IShellItemImageFactory {
    void GetImage(SIZE size, SIIGBF flags, out IntPtr phbm);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  public static extern void SHCreateItemFromParsingName(string pszPath, IntPtr pbc, ref Guid riid,
      [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory ppv);

  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);

  [DllImport("user32.dll")]
  public static extern bool DestroyIcon(IntPtr hIcon);

  [DllImport("gdi32.dll")]
  public static extern bool DeleteObject(IntPtr hObject);

  [DllImport("gdi32.dll")]
  public static extern int GetObject(IntPtr hgdiobj, int cbBuffer, out BITMAP lpBitmap);

  [DllImport("gdi32.dll")]
  public static extern int GetDIBits(IntPtr hdc, IntPtr hbmp, uint start, uint lines, [In, Out] int[] bits, ref BITMAPINFO bmi, uint usage);

  [DllImport("user32.dll")]
  public static extern IntPtr GetDC(IntPtr hwnd);

  [DllImport("user32.dll")]
  public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

  [StructLayout(LayoutKind.Sequential)]
  public struct SIZE { public int cx; public int cy; public SIZE(int x, int y) { cx = x; cy = y; } }

  public enum SIIGBF {
    RESIZETOFIT = 0,
    BIGGERSIZEOK = 1,
    MEMORYONLY = 2,
    ICONONLY = 4,
    THUMBNAILONLY = 8,
    INCACHEONLY = 16
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
    public string szTypeName;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct BITMAP {
    public int bmType; public int bmWidth; public int bmHeight; public int bmWidthBytes;
    public ushort bmPlanes; public ushort bmBitsPixel; public IntPtr bmBits;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct BITMAPINFOHEADER {
    public uint biSize; public int biWidth; public int biHeight; public ushort biPlanes; public ushort biBitCount;
    public uint biCompression; public uint biSizeImage; public int biXPelsPerMeter; public int biYPelsPerMeter;
    public uint biClrUsed; public uint biClrImportant;
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct RGBQUAD { public byte rgbBlue; public byte rgbGreen; public byte rgbRed; public byte rgbReserved; }

  [StructLayout(LayoutKind.Sequential)]
  public struct BITMAPINFO { public BITMAPINFOHEADER bmiHeader; public RGBQUAD bmiColors; }

  const uint SHGFI_ICON = 0x100;
  const uint SHGFI_LARGEICON = 0x0;

  // Convert an HBITMAP (32bpp premultiplied-BGRA DIB from GetImage) to a Bitmap
  // keeping the alpha channel, so icons stay transparent on the dark wallpaper.
  public static System.Drawing.Bitmap FromHBitmap(IntPtr hBmp) {
    BITMAP bm;
    if (GetObject(hBmp, Marshal.SizeOf(typeof(BITMAP)), out bm) == 0 || bm.bmWidth <= 0 || bm.bmHeight <= 0) return null;
    if (bm.bmBitsPixel != 32) return System.Drawing.Image.FromHbitmap(hBmp);
    int n = bm.bmWidth * bm.bmHeight;
    int[] px = new int[n];
    var bmi = new BITMAPINFO();
    bmi.bmiHeader.biSize = (uint)Marshal.SizeOf(typeof(BITMAPINFOHEADER));
    bmi.bmiHeader.biWidth = bm.bmWidth;
    bmi.bmiHeader.biHeight = -bm.bmHeight; // top-down
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    IntPtr hdc = GetDC(IntPtr.Zero);
    try { GetDIBits(hdc, hBmp, 0, (uint)bm.bmHeight, px, ref bmi, 0); }
    finally { ReleaseDC(IntPtr.Zero, hdc); }
    bool allZero = true;
    for (int i = 0; i < n; i++) { if (((px[i] >> 24) & 0xff) != 0) { allZero = false; break; } }
    var bmp = new System.Drawing.Bitmap(bm.bmWidth, bm.bmHeight, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    var rect = new System.Drawing.Rectangle(0, 0, bm.bmWidth, bm.bmHeight);
    var bd = bmp.LockBits(rect, System.Drawing.Imaging.ImageLockMode.WriteOnly, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
    Marshal.Copy(px, 0, bd.Scan0, n);
    bmp.UnlockBits(bd);
    if (allZero) {
      // DDB without alpha data: force opaque so the icon does not vanish
      for (int i = 0; i < n; i++) px[i] = (px[i] & 0xffffff) | unchecked((int)0xff000000);
      bd = bmp.LockBits(rect, System.Drawing.Imaging.ImageLockMode.WriteOnly, System.Drawing.Imaging.PixelFormat.Format32bppPArgb);
      Marshal.Copy(px, 0, bd.Scan0, n);
      bmp.UnlockBits(bd);
    }
    return bmp;
  }

  // Icon (iconOnly) or thumbnail for any shell item; null when the shell has none.
  public static System.Drawing.Bitmap GetShellImage(string path, int px, bool iconOnly) {
    var iid = typeof(IShellItemImageFactory).GUID;
    IShellItemImageFactory factory;
    SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
    if (factory == null) return null;
    IntPtr hb;
    factory.GetImage(new SIZE(px, px), iconOnly ? SIIGBF.ICONONLY : SIIGBF.RESIZETOFIT, out hb);
    if (hb == IntPtr.Zero) return null;
    try { return FromHBitmap(hb); }
    finally { DeleteObject(hb); }
  }

  // 32px class-icon fallback for items the factory cannot serve.
  public static System.Drawing.Bitmap GetSmallIcon(string path) {
    var fi = new SHFILEINFO();
    if (SHGetFileInfo(path, 0, ref fi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), SHGFI_ICON | SHGFI_LARGEICON) == IntPtr.Zero || fi.hIcon == IntPtr.Zero) return null;
    try { return System.Drawing.Icon.FromHandle(fi.hIcon).ToBitmap(); }
    finally { DestroyIcon(fi.hIcon); }
  }
}
"@
}

if (-not (Test-Path -LiteralPath $IconDir)) { New-Item -ItemType Directory -Path $IconDir -Force | Out-Null }

$file = Join-Path $IconDir ($Id + '.png')
if ((Test-Path -LiteralPath $file) -and -not $Force) {
  ConvertTo-Json @{ ok = $true; icon = $true } -Compress
  exit 0
}

function Save-Bitmap($bmp) {
  if (-not $bmp) { return $false }
  try {
    $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
    return $true
  } catch {
    return $false
  } finally {
    $bmp.Dispose()
  }
}

$ok = $false
try {
  $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  $imgExt = '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tif', '.tiff'
  if ($imgExt -contains $ext) {
    # photos: prefer a real thumbnail
    try { $ok = Save-Bitmap ([ShPin]::GetShellImage($Path, 256, $false)) } catch { }
  }
  if (-not $ok) {
    try { $ok = Save-Bitmap ([ShPin]::GetShellImage($Path, 256, $true)) } catch { }
  }
} catch { }

if (-not $ok) {
  try { $ok = Save-Bitmap ([ShPin]::GetSmallIcon($Path)) } catch { }
}

ConvertTo-Json @{ ok = $true; icon = $ok } -Compress
