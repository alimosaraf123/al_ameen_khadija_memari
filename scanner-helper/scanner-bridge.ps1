param(
  [int]$Port = 4789
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$WIA_FORMAT_PNG  = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$WIA_FORMAT_BMP  = '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}'
$WIA_FORMAT_JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'

function Get-WiaScanners {
  $list = @()
  try {
    $dm = New-Object -ComObject WIA.DeviceManager
    foreach ($info in $dm.DeviceInfos) {
      if ($info.Type -eq 1) {
        $name = 'Scanner'
        try { $name = [string]$info.Properties['Name'].Value } catch {}
        $list += @{ id = [string]$info.DeviceID; name = $name }
      }
    }
  } catch {}
  return ,$list
}

function Find-Naps2Path {
  $candidates = @(
    "$env:ProgramFiles\NAPS2\NAPS2.Console.exe",
    "${env:ProgramFiles(x86)}\NAPS2\NAPS2.Console.exe"
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  return $null
}

function Convert-BytesToJpegBase64([byte[]]$RawBytes) {
  $inStream = New-Object System.IO.MemoryStream(, $RawBytes)
  try {
    $img = [System.Drawing.Image]::FromStream($inStream)
    try {
      $outStream = New-Object System.IO.MemoryStream
      try {
        $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
        $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]90)
        $img.Save($outStream, $jpegCodec, $encParams)
        return [Convert]::ToBase64String($outStream.ToArray())
      } finally {
        $outStream.Dispose()
      }
    } finally {
      $img.Dispose()
    }
  } finally {
    $inStream.Dispose()
  }
}

function Set-WiaProp($Item, [string]$PropId, $Value) {
  try {
    foreach ($p in $Item.Properties) {
      if ([string]$p.PropertyID -eq $PropId -and -not $p.IsReadOnly) {
        $p.Value = $Value
        return
      }
    }
  } catch {}
}

function Invoke-ScannerAcquire([string]$RequestedDeviceId, [int]$Dpi = 200, [bool]$ShowDialog = $false) {
  $scanners = @(Get-WiaScanners)
  if ($scanners.Count -eq 0) {
    $naps2 = Find-Naps2Path
    if ($naps2) {
      $tmp = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), '.jpg')
      try {
        $proc = Start-Process -FilePath $naps2 -ArgumentList @('-o', $tmp, '--force') -Wait -NoNewWindow -PassThru
        if ($proc.ExitCode -eq 0 -and (Test-Path $tmp)) {
          $bytes = [System.IO.File]::ReadAllBytes($tmp)
          $b64 = Convert-BytesToJpegBase64 $bytes
          return @{ scannerName = 'NAPS2 Scanner'; base64 = $b64 }
        }
      } finally {
        if (Test-Path $tmp) { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
      }
    }
    throw 'No scanner detected on this PC. Please check USB/power connection and scanner driver.'
  }

  $target = $null
  if ($RequestedDeviceId) {
    $target = $scanners | Where-Object { $_.id -eq $RequestedDeviceId } | Select-Object -First 1
  }
  if (-not $target) { $target = $scanners[0] }

  $dm = New-Object -ComObject WIA.DeviceManager
  $devInfo = $null
  foreach ($d in $dm.DeviceInfos) {
    if ([string]$d.DeviceID -eq $target.id) { $devInfo = $d; break }
  }
  if (-not $devInfo) { throw "Selected scanner ($($target.name)) is no longer connected." }

  # Silent direct WIA transfer first (1-click, zero popup)
  if (-not $ShowDialog) {
    try {
      $device = $devInfo.Connect()
      $item = $device.Items.Item(1)
      Set-WiaProp $item '6146' 1        # Color
      Set-WiaProp $item '6147' $Dpi     # Horizontal DPI
      Set-WiaProp $item '6148' $Dpi     # Vertical DPI

      $wiaImg = $null
      try {
        $wiaImg = $item.Transfer('{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}')
      } catch {
        $wiaImg = $item.Transfer($WIA_FORMAT_BMP)
      }
      if ($wiaImg) {
        $raw = [byte[]]$wiaImg.FileData.BinaryData
        $b64 = Convert-BytesToJpegBase64 $raw
        return @{ scannerName = $target.name; base64 = $b64 }
      }
    } catch {
      $silentErr = $_.Exception.Message
      Write-Host "Silent WIA transfer fallback to dialog: $silentErr"
    }
  }

  # Fallback: native Windows WIA Scan Dialog
  $dlg = New-Object -ComObject WIA.CommonDialog
  $wiaImg2 = $dlg.ShowAcquireImage(1, 1, 65536, '{B96B3CAB-0728-11D3-9D7B-0000F81EF32E}', $false, $true, $false)
  if (-not $wiaImg2) {
    throw 'Scan canceled or no paper/scanner ready.'
  }
  $raw2 = [byte[]]$wiaImg2.FileData.BinaryData
  $b64_2 = Convert-BytesToJpegBase64 $raw2
  return @{ scannerName = $target.name; base64 = $b64_2 }
}

function Send-JsonResponse($Ctx, [int]$StatusCode, $Obj) {
  $Ctx.Response.StatusCode = $StatusCode
  $Ctx.Response.Headers['Access-Control-Allow-Origin'] = '*'
  $Ctx.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $Ctx.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, Access-Control-Request-Private-Network'
  $Ctx.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $Ctx.Response.ContentType = 'application/json; charset=utf-8'
  $json = ($Obj | ConvertTo-Json -Depth 5 -Compress)
  $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Ctx.Response.ContentLength64 = $buf.Length
  $Ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
  $Ctx.Response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

Write-Host "=================================================="
Write-Host " Al-Ameen Admission Form Scanner Helper Running!"
Write-Host " Listening on: http://127.0.0.1:$Port"
$initial = @(Get-WiaScanners)
Write-Host " Detected WIA Scanners: $($initial.Count)"
foreach ($s in $initial) { Write-Host "  - $($s.name)" }
Write-Host " Keep this window minimized while scanning forms."
Write-Host "=================================================="

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $method = $ctx.Request.HttpMethod.ToUpperInvariant()
    $path = $ctx.Request.Url.AbsolutePath.TrimEnd('/')
    if (-not $path) { $path = '/' }

    if ($method -eq 'OPTIONS') {
      $ctx.Response.StatusCode = 204
      $ctx.Response.Headers['Access-Control-Allow-Origin'] = '*'
      $ctx.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
      $ctx.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, Access-Control-Request-Private-Network'
      $ctx.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
      $ctx.Response.OutputStream.Close()
      continue
    }

    if ($method -eq 'GET' -and ($path -eq '/health' -or $path -eq '/devices' -or $path -eq '/')) {
      $scanners = @(Get-WiaScanners)
      $naps2Found = [bool](Find-Naps2Path)
      Send-JsonResponse $ctx 200 @{
        ok = $true
        port = $Port
        scanners = $scanners
        count = $scanners.Count
        naps2_available = $naps2Found
      }
      continue
    }

    if ($method -eq 'POST' -and $path -eq '/scan') {
      $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream)
      $bodyText = $reader.ReadToEnd()
      $bodyObj = @{}
      if ($bodyText -and $bodyText.Trim().StartsWith('{')) {
        try { $bodyObj = $bodyText | ConvertFrom-Json } catch {}
      }
      $devId = if ($bodyObj.deviceId) { [string]$bodyObj.deviceId } else { '' }
      $dpi = if ($bodyObj.dpi) { [int]$bodyObj.dpi } else { 200 }
      $showDlg = if ($bodyObj.showDialog) { [bool]$bodyObj.showDialog } else { $false }

      $scanOut = Invoke-ScannerAcquire -RequestedDeviceId $devId -Dpi $dpi -ShowDialog $showDlg
      $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
      Send-JsonResponse $ctx 200 @{
        success = $true
        scannerName = $scanOut.scannerName
        fileName = "admission_form_$ts.jpg"
        mimeType = 'image/jpeg'
        dataUrl = "data:image/jpeg;base64,$($scanOut.base64)"
      }
      continue
    }

    Send-JsonResponse $ctx 404 @{ success = $false; message = 'Not found' }
  } catch {
    $msg = $_.Exception.Message
    Write-Host "Scanner Helper Error: $msg"
    try { Send-JsonResponse $ctx 500 @{ success = $false; message = $msg } } catch {}
  }
}
