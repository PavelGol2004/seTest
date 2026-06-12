$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Device

$watcher = New-Object System.Device.Location.GeoCoordinateWatcher
$watcher.Start()

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
  if ($watcher.Status -eq 'Ready' -and -not $watcher.Position.Location.IsUnknown) {
    break
  }
  Start-Sleep -Milliseconds 400
}

if ($watcher.Position.Location.IsUnknown) {
  Write-Error 'Windows Geolocation failed: enable Location in Windows Settings and Wi-Fi'
  exit 1
}

$loc = $watcher.Position.Location
@{
  latitude  = $loc.Latitude
  longitude = $loc.Longitude
  accuracy  = $loc.HorizontalAccuracy
  source    = 'windows-geocoordinate-watcher'
} | ConvertTo-Json -Compress
