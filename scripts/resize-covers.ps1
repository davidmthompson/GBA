<#
 Companion to scripts/fetch-covers.mjs. Reads a job file of "source|destination" lines and writes
 each source image scaled so its longer side is 256px, centred on a transparent 256x256 PNG
 (no cropping). Windows PowerShell 5.1+ (System.Drawing).
 #>
param([Parameter(Mandatory = $true)][string]$JobFile)

Add-Type -AssemblyName System.Drawing
$size = 256
$failed = 0
foreach ($line in Get-Content -LiteralPath $JobFile -Encoding UTF8) {
    if (-not $line) { continue }
    $source, $destination = $line -split '\|', 2
    try {
        $image = [System.Drawing.Image]::FromFile($source)
        try {
            $scale = $size / [Math]::Max($image.Width, $image.Height)
            $width = [Math]::Max(1, [int][Math]::Round($image.Width * $scale))
            $height = [Math]::Max(1, [int][Math]::Round($image.Height * $scale))
            $canvas = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $graphics = [System.Drawing.Graphics]::FromImage($canvas)
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $attributes = New-Object System.Drawing.Imaging.ImageAttributes
            $attributes.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
            $target = New-Object System.Drawing.Rectangle ([int](($size - $width) / 2)), ([int](($size - $height) / 2)), $width, $height
            $graphics.DrawImage($image, $target, 0, 0, $image.Width, $image.Height, [System.Drawing.GraphicsUnit]::Pixel, $attributes)
            $graphics.Dispose()
            $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
            $canvas.Dispose()
        }
        finally {
            $image.Dispose()
        }
    }
    catch {
        $failed++
        [Console]::Error.WriteLine("resize failed: $source -> $destination : $($_.Exception.Message)")
    }
}
exit $failed
