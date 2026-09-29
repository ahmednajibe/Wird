# Wird one-line installer for Windows.
#   powershell -NoProfile -Command "irm https://github.com/ahmednajibe/Wird/releases/latest/download/install.ps1 | iex"
# Overrides for testing: WIRD_VERSION, WIRD_ASSET_DIR, WIRD_INSTALL_DIR,
# WIRD_SHORTCUT_DIR, WIRD_NO_LAUNCH. Never call exit here: this script is
# expected to be piped into iex.

function Install-Wird {
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

  $repo = 'ahmednajibe/Wird'
  $releasesUrl = "https://github.com/$repo/releases"

  # Resolve the tag only when downloading: with WIRD_ASSET_DIR the version is
  # derived from the zip file name and no network is needed.
  if (-not $env:WIRD_ASSET_DIR) {
    $tag = $env:WIRD_VERSION
    if (-not $tag) {
      $headers = @{ 'User-Agent' = 'wird-installer' }
      $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
      $tag = $latest.tag_name
    }
    if (-not $tag) { throw 'Could not determine the latest Wird release.' }
  }

  $work = Join-Path ([IO.Path]::GetTempPath()) ("wird-install-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $work | Out-Null
  try {
    # Fetch (or copy, when WIRD_ASSET_DIR points at a local folder) the zip and
    # the checksum file.
    if ($env:WIRD_ASSET_DIR) {
      $zipSrc = Get-ChildItem -Path $env:WIRD_ASSET_DIR -Filter 'Wird-*-win-x64-portable.zip' |
        Select-Object -First 1
      if (-not $zipSrc) { throw "No Wird-*-win-x64-portable.zip found in $env:WIRD_ASSET_DIR" }
      if ($zipSrc.Name -notmatch '^Wird-(.+)-win-x64-portable\.zip$') {
        throw "Cannot parse version from $($zipSrc.Name)"
      }
      $version = $Matches[1]
      Copy-Item $zipSrc.FullName -Destination (Join-Path $work $zipSrc.Name)
      Copy-Item (Join-Path $env:WIRD_ASSET_DIR 'SHA256SUMS.txt') -Destination (Join-Path $work 'SHA256SUMS.txt')
      $zipName = $zipSrc.Name
    } else {
      $version = $tag -replace '^v', ''
      $zipName = "Wird-$version-win-x64-portable.zip"
      $headers = @{ 'User-Agent' = 'wird-installer' }
      Invoke-WebRequest -Uri "$releasesUrl/download/$tag/$zipName" -OutFile (Join-Path $work $zipName) -Headers $headers
      Invoke-WebRequest -Uri "$releasesUrl/download/$tag/SHA256SUMS.txt" -OutFile (Join-Path $work 'SHA256SUMS.txt') -Headers $headers
    }

    # Verify the SHA-256 before anything is installed.
    $expected = (Get-Content (Join-Path $work 'SHA256SUMS.txt') |
      Where-Object { $_ -match "  $([regex]::Escape($zipName))`$" } |
      ForEach-Object { ($_ -split '\s+')[0] } | Select-Object -First 1)
    if (-not $expected) { throw "No checksum entry for $zipName; nothing was installed." }
    $actual = (Get-FileHash (Join-Path $work $zipName) -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $expected.ToLower()) {
      throw "Checksum mismatch for $zipName; nothing was installed."
    }

    $installDir = if ($env:WIRD_INSTALL_DIR) { $env:WIRD_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\Wird' }

    # Stop a running copy so its files can be replaced.
    Get-Process wird -ErrorAction SilentlyContinue |
      Where-Object { $_.Path -and $_.Path.StartsWith($installDir, [StringComparison]::OrdinalIgnoreCase) } |
      ForEach-Object { $_.Kill(); $_.WaitForExit(10000) | Out-Null }

    Expand-Archive -Path (Join-Path $work $zipName) -DestinationPath (Join-Path $work 'extract') -Force
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
    # The exe image lock can outlive the process exit by a beat: retry briefly.
    foreach ($i in 1..10) {
      try {
        Copy-Item (Join-Path $work 'extract\Wird\wird.exe') -Destination (Join-Path $installDir 'wird.exe') -Force
        break
      } catch [System.IO.IOException] {
        if ($i -eq 10) { throw }
        Start-Sleep -Milliseconds 500
      }
    }
    Copy-Item (Join-Path $work 'extract\Wird\README.txt') -Destination (Join-Path $installDir 'README.txt') -Force
    Unblock-File (Join-Path $installDir 'wird.exe') -ErrorAction SilentlyContinue

    $exePath = Join-Path $installDir 'wird.exe'

    function New-WirdShortcut([string]$lnkPath) {
      $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath)
      $s.TargetPath = $exePath
      $s.WorkingDirectory = $installDir
      $s.IconLocation = "$exePath,0"
      $s.Description = 'Wird'
      $s.Save()
    }

    if ($env:WIRD_SHORTCUT_DIR) {
      New-Item -ItemType Directory -Path $env:WIRD_SHORTCUT_DIR -Force | Out-Null
      New-WirdShortcut (Join-Path $env:WIRD_SHORTCUT_DIR 'Wird (Start menu).lnk')
      New-WirdShortcut (Join-Path $env:WIRD_SHORTCUT_DIR 'Wird.lnk')
    } else {
      $startDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
      New-Item -ItemType Directory -Path $startDir -Force | Out-Null
      New-WirdShortcut (Join-Path $startDir 'Wird.lnk')
      New-WirdShortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Wird.lnk')
    }

    Write-Output "Wird $version installed to $installDir"
    Write-Output "Your data lives in $env:LOCALAPPDATA\Wird"

    if ($env:WIRD_NO_LAUNCH -ne '1') {
      Start-Process -FilePath $exePath -WorkingDirectory $installDir
    }
  } finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
}

Install-Wird
