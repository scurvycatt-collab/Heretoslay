param(
  [string]$InputManifest="$PSScriptRoot\..\..\assets\cards\kickstarter-preview\manifest.json",
  # Owner-local folder the relative sheets[].path values resolve against (sheets are not committed).
  [string]$Source='E:\Code\Here to play asset\Expansion\UPDATED Here to Slay Kickstarter Exclusive Pack'
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$inputFile=[IO.Path]::GetFullPath($InputManifest)
$source=Get-Content -LiteralPath $inputFile -Raw | ConvertFrom-Json
$rights='FAN_MADE_NON_COMMERCIAL';$takedown='scurvycatt@gmail.com'  # ADR-004
$output=Join-Path (Split-Path $inputFile) 'png-webgame'
$spec=Get-Content -LiteralPath "$PSScriptRoot\..\..\docs\contracts\CARD_TEMPLATE_SPEC.json" -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path "$output\fronts" | Out-Null
$cards=@()
foreach($sheet in $source.sheets){
  if([IO.Path]::IsPathRooted($sheet.path)){throw "Manifest must hold relative sheet paths: $($sheet.path)"}
  $sheetFile=Join-Path $Source ($sheet.path -replace '/','\')
  if((Get-FileHash -LiteralPath $sheetFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sheet.sha256){throw "Source changed: $($sheet.path)"}
  $image=[System.Drawing.Bitmap]::new($sheetFile)
  foreach($card in ($source.cards | Where-Object sheet -EQ $sheet.id)){
    $sizeName=if([int]$card.sheet -ge 4){'tarot'}else{'poker'}
    $size=$spec.cardSizes.$sizeName
    $rect=[System.Drawing.Rectangle]::new($card.crop.x,$card.crop.y,$card.crop.width,$card.crop.height)
    $crop=$image.Clone($rect,[System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $crop.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone)
    $canvas=[System.Drawing.Bitmap]::new([int]$size.width,[int]$size.height,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g=[System.Drawing.Graphics]::FromImage($canvas)
    $g.Clear([System.Drawing.Color]::FromArgb(16,22,27))
    $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale=[Math]::Min($size.width/$crop.Width,$size.height/$crop.Height)
    $w=[int][Math]::Round($crop.Width*$scale);$h=[int][Math]::Round($crop.Height*$scale)
    $x=[int][Math]::Floor(($size.width-$w)/2);$y=[int][Math]::Floor(($size.height-$h)/2)
    $g.DrawImage($crop,[System.Drawing.Rectangle]::new($x,$y,$w,$h),0,0,$crop.Width,$crop.Height,[System.Drawing.GraphicsUnit]::Pixel)
    $asset="fronts/$($card.previewId).png"
    $canvas.Save((Join-Path $output $asset),[System.Drawing.Imaging.ImageFormat]::Png)
    $cards+=@{previewId=$card.previewId;definitionId=$null;group=$card.group;sheet=$card.sheet;row=$card.row;column=$card.column;src=$asset;width=$size.width;height=$size.height;template=$sizeName;sourceSha256=$card.sourceSha256;crop=$card.crop;rotationDegrees=270;fit='contain';contentRect=@{x=$x;y=$y;width=$w;height=$h};rightsStatus=$rights}
    $g.Dispose();$canvas.Dispose();$crop.Dispose()
  }
  $image.Dispose()
}
$manifest=@{schema=1;collection=$source.collection;gameplaySupported=$false;rightsStatus=$rights;takedownContact=$takedown;sheetPathBase=$source.sheetPathBase;assetType='complete-card-front';templateSpec='docs/contracts/CARD_TEMPLATE_SPEC.json';fit='contain; no cropping or distortion; opaque #10161b padding';sheets=$source.sheets;cards=$cards}
$manifest | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath "$output\manifest.json" -Encoding utf8
$html=Get-Content -LiteralPath "$PSScriptRoot\kickstarter-preview.html" -Raw
$html=$html.Replace('__CARD_DATA__',($cards | ConvertTo-Json -Depth 6 -Compress)).Replace('Tỉ lệ nguồn được giữ nguyên; không kéo giãn về kích thước template base.','PNG đúng khổ template webgame: Poker 745×1040, Tarot 827×1417. Fit contain, giữ đủ nội dung.').Replace('Tải front gốc đã cắt','Tải PNG webgame').Replace('FRONT ONLY','WEBGAME PNG')
$html.TrimEnd() | Set-Content -LiteralPath "$output\index.html" -Encoding utf8
@'
69 complete card fronts, exported directly from the supplied JPG source sheets.
Poker: 745x1040 (45 cards). Tarot: 827x1417 (24 cards).
Fit: contain, centered, no distortion or additional content crop. Opaque #10161b padding where required.
Use as a complete card face in the webgame; do not place under another text/frame overlay.
Expansion preview only; definitionId remains null until explicit data mapping is provided.
Rights: FAN_MADE_NON_COMMERCIAL (fan-made, non-commercial, Unstable Games watermarks kept; not a licence). DMCA/takedown: scurvycatt@gmail.com. No back images included. Source/crop/hash details: manifest.json.
Open index.html for a local gallery. Native-resolution source crops remain in the parent preview directory.
'@ | Set-Content -LiteralPath "$output\README.txt" -Encoding utf8
# Verify the exported pixels, independently of the metadata, before packaging.
foreach($card in $cards){
  $check=[System.Drawing.Image]::FromFile((Join-Path $output $card.src))
  try{if($check.Width -ne $card.width -or $check.Height -ne $card.height -or $check.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid){throw "Invalid PNG: $($card.previewId)"}}finally{$check.Dispose()}
}
if($cards.Count -ne 69 -or @($cards.previewId | Sort-Object -Unique).Count -ne 69){throw 'Wrong card count'}
$zip=Join-Path (Split-Path $output) 'kickstarter-fronts-webgame-png.zip'
Compress-Archive -Path "$output\*" -DestinationPath $zip -Force
Write-Output "Verified 69 PNGs; output: $output; ZIP: $zip"
