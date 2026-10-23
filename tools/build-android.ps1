param([string]$GradlePath='gradle')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
& (Join-Path $PSScriptRoot 'stage-web.ps1')
& $GradlePath -p (Join-Path $projectRoot 'android') :app:assembleDebug --console=plain
if($LASTEXITCODE -ne 0){throw 'Android build failed'}
Write-Output (Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk')
