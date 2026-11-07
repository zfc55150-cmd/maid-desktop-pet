param([string]$PackageRoot=(Join-Path (Get-Location) 'work/gpt-idle-variety-20261102-01'))
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$m=Get-Content (Join-Path $PackageRoot 'deployment.json') -Raw -Encoding UTF8|ConvertFrom-Json
$script:appDir=$m.targetRoot;$script:dataDir=Join-Path $PackageRoot 'fake-state';$script:dragonTestMode=$true
$null=[IO.Directory]::CreateDirectory($script:dataDir)
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/characters.ps1'))))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/dragon-animation/dragon-animation.ps1'))))
$runtime=[IO.File]::ReadAllText((Join-Path $script:appDir 'runtime/dragon-animation/motion-runtime.ps1'))
$needle='$file=Join-Path $script:appDir ''runtime\dragon-animation\animation.json'''
if(!$runtime.Contains($needle)){throw 'Candidate manifest injection target missing'}
$candidate=[IO.Path]::GetFullPath((Join-Path $PackageRoot 'files/runtime/dragon-animation/animation.json'))
. ([ScriptBlock]::Create($runtime.Replace($needle,('$file='''+$candidate.Replace("'","''")+''''))))
function Save-Settings {throw 'Test must not write settings'}
$script:ui=@{Girl=[Windows.Controls.Image]::new()};$script:context=[Windows.Controls.ContextMenu]::new()
$script:window=[pscustomobject]@{IsVisible=$true};$script:characterId='gpt-dragon';$script:widgetPetForm='full'
$script:bitmap=Read-WidgetCharacterImage (Join-Path $script:appDir 'assets/gpt-dragon-niang-bust.png');$script:ui.Girl.Source=$script:bitmap
Initialize-DragonAnimationSettings ([pscustomobject]@{dragonMotionVersion=1;dragonCodexEnabled=$false})
Start-DragonAnimation
if(!$script:dragonTimer -or $script:dragonLastError){throw ('Candidate runtime startup failed: '+$script:dragonLastError)}
$script:dragonTimer.Stop()
$actions=@($script:context.Items|Where-Object{$_ -is [Windows.Controls.MenuItem] -and $_.Items.Count-gt 0})
$items=@($actions|ForEach-Object{$_.Items}|ForEach-Object{$_.Items}|Where-Object{$_ -is [Windows.Controls.MenuItem] -and $_.Tag})
$tags=@($items|ForEach-Object{[string]$_.Tag})
if($tags.Count-ne 43 -or @($tags|Select-Object -Unique).Count-ne 43){throw ('Manual menu coverage failed: '+$tags.Count)}
$pages=0
foreach($name in @($script:dragonManifest.idleInteractionPool)){
 $item=@($items|Where-Object{$_.Tag-eq $name})[0]
 $item.RaiseEvent([Windows.RoutedEventArgs]::new([Windows.Controls.MenuItem]::ClickEvent))
 if($script:dragonManualPhase-ne $name){throw ('Manual menu routing failed: '+$name)}
 foreach($p in $script:dragonManifest.states.$name.pages){
  $file=Join-Path $script:appDir ('assets/dragon-animation/motion-v1/'+$p.file)
  $task=[DragonMotionDecoder]::LoadAsync($file,384,[int]$p.rows,[string]$p.sha256)
  $decoded=$task.GetAwaiter().GetResult()
  if(!$decoded.IsFrozen -or $decoded.PixelWidth-ne 3072){throw ('Decode failed: '+$p.file)}
  $decoded=$null;$task=$null;$pages++
 }
}
[DragonMotionDecoder]::TrimMemory($true)
$script:dragonTimer.Stop()
$result=@{ok=$true;manualMenuStates=$tags.Count;automaticMenuSelections=14;decodedPages=$pages;candidateVersion=$script:dragonManifest.releaseVersion;visibleWindowCreated=$false;formalStateWritten=$false;scope='Real WPF candidate manifest validation, menu click handlers, hash-checked frozen atlas decoding; no live screen playback'}
$result|ConvertTo-Json|Set-Content (Join-Path $PackageRoot 'wpf-verification.json') -Encoding UTF8
$result|ConvertTo-Json -Compress
