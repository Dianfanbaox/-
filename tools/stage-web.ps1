$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$app=Join-Path $root 'app'
$stage=Join-Path $root 'android/app/src/main/assets-v3'
New-Item -ItemType Directory -Force $stage, "$stage/assets/ip" | Out-Null
$files=@('ai-network.js','interactions.js','interactions.css','p2-ui.js','charts.js','redesign.css','redesign.js','startup.css','startup.js','engine.js','db.js','test.html','assets/app-icon-v3.png','assets/app-icon.jpg','assets/ip/shushu-atlas-v3.png')
foreach($file in $files){Copy-Item -LiteralPath (Join-Path $app $file) -Destination (Join-Path $stage $file) -Force}
$html=[IO.File]::ReadAllText((Join-Path $app 'index.html'))
$html=[regex]::Replace($html,'<script src="preview-data\.js[^\"]*"></script>\s*','')
$html=$html.Replace("new URLSearchParams(location.search).get('preview') === '1' ? 'pwos-ui-v3-preview' : 'pwos-ui-v3'", "'pwos-ui-v3'")
[IO.File]::WriteAllText((Join-Path $stage 'index.html'),$html,[Text.UTF8Encoding]::new($false))
Write-Output "Packaged production web assets: $stage"
