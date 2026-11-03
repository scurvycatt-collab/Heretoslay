param(
  [string]$Source = 'E:\Code\Here to play asset\Expansion\UPDATED Here to Slay Kickstarter Exclusive Pack',
  [string]$Output = "$PSScriptRoot\..\..\assets\cards\kickstarter-preview"
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$Output = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force -Path "$Output\fronts" | Out-Null
$cards = @()
$sheets = @()
$fronts = Get-ChildItem -LiteralPath $Source -Recurse -File | Where-Object Name -Like '*Front*' | Sort-Object FullName
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -EQ 'image/jpeg'
$encoder = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoder.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality,[long]95)
foreach ($file in $fronts) {
  $sheet = $file.Directory.Name.Substring(6,2)
  $image = [System.Drawing.Bitmap]::new($file.FullName)
  if ($image.Width -ne 3600 -or $image.Height -ne 5400) { throw "Unexpected source dimensions: $($file.FullName)" }
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $sheets += @{ id=$sheet; path=$file.FullName; sha256=$hash; width=$image.Width; height=$image.Height }
  $tarot = [int]$sheet -ge 4
  for ($column=0; $column -lt $(if($tarot){2}else{3}); $column++) {
    for ($row=0; $row -lt 6; $row++) {
      if ($sheet -eq '01' -and $column -eq 0 -and $row -eq 0) { continue }
      if ($sheet -eq '02' -and ($column -eq 0 -or ($column -eq 1 -and $row -ge 4))) { continue }
      if ($tarot) {
        # Native tarot cut face (827x1417 upright), not the larger print cell.
        # The surrounding sheet contains substantial top/bottom bleed gutters.
        $xs = @(356,1860)
        $rect = [System.Drawing.Rectangle]::new($xs[$column],(75+884*$row),1417,827)
      } else {
        # Poker cut faces, excluding the surrounding coloured sheet gutters.
        $xs = @(196,1320,2448)
        $ys = @(304,1132,1956,2782,3606,4432)
        $rect = [System.Drawing.Rectangle]::new($xs[$column],$ys[$row],960,664)
      }
      $crop = $image.Clone($rect,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
      $crop.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
      $id = "ks-preview-$sheet-r$($row+1)-c$($column+1)"
      $crop.Save("$Output\fronts\$id.jpg",$jpeg,$encoder)
      $group = switch($sheet){'01'{'Heroes'} '02'{'Heroes · alternate'} '03'{'Challenges / Modifiers / Items'} '04'{'Monsters'} '05'{'Leaders / Monsters'}}
      $cards += @{ previewId=$id; definitionId=$null; group=$group; sheet=$sheet; row=$row+1; column=$column+1; src="fronts/$id.jpg"; width=$crop.Width; height=$crop.Height; sourceSha256=$hash; crop=@{ x=$rect.X;y=$rect.Y;width=$rect.Width;height=$rect.Height }; rotationDegrees=270; rightsStatus='UNVERIFIED' }
      $crop.Dispose()
    }
  }
  $image.Dispose()
}
$manifest = @{ schema=1; collection='Kickstarter Exclusive Pack — local visual test'; gameplaySupported=$false; rightsStatus='UNVERIFIED'; method='Deterministic source-front crop, counterclockwise rotation; no generated art/text. Native aspect retained.'; sheets=$sheets; cards=$cards }
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$Output\manifest.json" -Encoding utf8
# Embed data so the gallery also works when index.html is opened directly from disk.
$template = Get-Content -LiteralPath "$PSScriptRoot\kickstarter-preview.html" -Raw
$template.Replace('__CARD_DATA__',($cards | ConvertTo-Json -Depth 6 -Compress)).TrimEnd() | Set-Content -LiteralPath "$Output\index.html" -Encoding utf8
$encoder.Dispose()
Write-Output "Exported $($cards.Count) fronts from $($sheets.Count) sheets to $Output"
