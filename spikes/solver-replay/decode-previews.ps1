# Turns the sky test preview JPEGs in device-reports/ into raw 8-bit greyscale files
# (.gray, row by row), so the replay can undo their stretch and run them through the
# detector. Uses Windows' own image decoder, so no extra tools are needed.
# Run from the repository root: powershell -File spikes/solver-replay/decode-previews.ps1
Add-Type -AssemblyName System.Drawing
Get-ChildItem device-reports -Filter 'sky-test-*.jpg' | ForEach-Object {
  $out = [System.IO.Path]::ChangeExtension($_.FullName, '.gray')
  if (Test-Path $out) { return }
  $bitmap = [System.Drawing.Bitmap]::FromFile($_.FullName)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $bitmap.Width, $bitmap.Height
  $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $bytes = New-Object byte[] ($data.Stride * $bitmap.Height)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
  $grey = New-Object byte[] ($bitmap.Width * $bitmap.Height)
  for ($y = 0; $y -lt $bitmap.Height; $y++) {
    $row = $y * $data.Stride
    for ($x = 0; $x -lt $bitmap.Width; $x++) {
      # The preview is grey, so any channel will do.
      $grey[$y * $bitmap.Width + $x] = $bytes[$row + $x * 3]
    }
  }
  $bitmap.UnlockBits($data)
  $bitmap.Dispose()
  [System.IO.File]::WriteAllBytes($out, $grey)
  Write-Output "$($_.Name) $($bitmap.Width)x$($bitmap.Height)"
}
