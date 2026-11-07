param([Parameter(Mandatory=$true)][string]$Baseline,[string]$LabRoot=$PSScriptRoot)
$ErrorActionPreference='Stop'
if(!$LabRoot){$LabRoot=Join-Path (Get-Location) 'integrations/gpt-niang/playback-lab'}
$b=Get-Content (Join-Path $Baseline 'baseline.json') -Raw -Encoding UTF8|ConvertFrom-Json
foreach($f in $b.gptFiles){if((Get-FileHash -LiteralPath (Join-Path $b.gptRoot $f.target)).Hash-ne $f.sha256){throw 'Installed baseline drift'}}
$m=Get-Content (Join-Path $Baseline 'animation.json') -Raw -Encoding UTF8|ConvertFrom-Json
$clips=@{}
foreach($name in @('frontidle','proudarms','proudarmsreturn','flutter','draglanding','walking','fanmishap')){
 & ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $LabRoot 'encode-control.ps1')))) -Baseline $Baseline -ClipName $name
 $clips[$name]=@{file=$name+'-control.webm';fps=$m.states.$name.fps;frames=$m.states.$name.frames;loop=$m.states.$name.loop}
}
[IO.File]::WriteAllText((Join-Path $Baseline 'scenes.json'),(@{schema=1;sourceVersion=$b.gptVersion;clips=$clips;canvas=@(384,384);characterScreenHeightVerified=$false}|ConvertTo-Json -Depth 7),[Text.UTF8Encoding]::new($false))
