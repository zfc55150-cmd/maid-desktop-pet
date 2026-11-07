param([string]$Report,[string]$Root,[string]$Stage)
$ErrorActionPreference='Stop'
$repo=if($Root){[IO.Path]::GetFullPath($Root)}else{[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../..'))}
$work=Join-Path $repo 'work/optimization-implementation-20261028-01/observers'
$root=Join-Path $work ('contract-fixture-'+[Guid]::NewGuid().ToString('N'));$null=[IO.Directory]::CreateDirectory($root)
$checks=New-Object 'System.Collections.Generic.List[string]'
function Check([bool]$Value,[string]$Name){if(!$Value){throw $Name};$checks.Add($Name)}
function Load-Functions([string]$File){$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($File,[Text.Encoding]::UTF8),[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PARSE_FAILED'};foreach($fn in $ast.FindAll({param($node)$node-is [Management.Automation.Language.FunctionDefinitionAst]},$true)){. ([ScriptBlock]::Create($fn.ToString().Replace('function '+$fn.Name,'function script:'+$fn.Name)))}}
try{
 $dragon=if($Stage){Join-Path $Stage 'runtime/dragon-animation/dragon-animation.ps1'}else{Join-Path $repo 'integrations/gpt-niang/animated/dragon-animation.ps1'}
 $completion=if($Stage){Join-Path $Stage 'runtime/completion-notifications.ps1'}else{Join-Path $repo 'integrations/gpt-niang/maintenance/runtime/completion-notifications.ps1'}
 Load-Functions $dragon
 Load-Functions $completion
 $script:dataDir=$root;$script:dragonActivityDir=Join-Path $root 'activity';$null=[IO.Directory]::CreateDirectory($script:dragonActivityDir)
 $script:dragonAnimationEnabled=$true;$script:dragonCodexEnabled=$true;$script:characterId='gpt-dragon';$script:dragonSnapshotCache=@{};$script:dragonSnapshots=@();$script:dragonNextScan=0;$script:dragonNextEventScan=0
 $script:dragonHasPauseControl=$false;$script:completionHasPauseControl=$false;$script:dragonPendingEvents=New-Object 'System.Collections.Generic.List[object]'
 $script:starts=0;$script:stops=0
 function Start-DragonActivityWatch {$script:starts++}
 function Stop-DragonActivityWatch {$script:stops++}
 function Update-DragonVisualEvents($records,[long]$now) {}
 $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
 foreach($entry in @(@{id='a';phase='waiting';terminal=$false},@{id='b';phase='working';terminal=$false},@{id='c';phase='happy';terminal=$true})){
  $snapshot=@{version=1;session=$entry.id*32;turn='d'*32;phase=$entry.phase;terminal=$entry.terminal;at=$now;expiresAt=$now+6500;tools=@()}
  [IO.File]::WriteAllText((Join-Path $script:dragonActivityDir (($entry.id*32)+'.json')),($snapshot|ConvertTo-Json -Compress))
 }
 [IO.File]::WriteAllText((Join-Path $script:dragonActivityDir 'observer-health.json'),(@{version=1;at=$now;lastScanAt=$now;status='ok';code='OBSERVER_OK'}|ConvertTo-Json -Compress))
 $script:widgetPetForm='bust';Sync-DragonActivityObserver $now
 Check ($script:starts-eq 1 -and $script:dragonActivityPhase-eq 'waiting') 'cold-bust-starts-observation-and-preserves-waiting-priority'
 Check ($script:dragonTaskSummary.active-eq 2 -and $script:dragonTaskSummary.waiting-eq 1 -and $script:dragonTaskSummary.working-eq 1 -and $script:dragonTaskSummary.completed-eq 1) 'anonymous-parallel-counts-without-private-text'
 Check ($script:dragonTaskSummary.observerStatus-eq 'ok') 'fixed-health-reaches-ui'
 $script:widgetPetForm='full';Sync-DragonActivityObserver ($now+1);Check ($script:starts-eq 2) 'both-forms-use-same-observer-contract'
 [IO.File]::WriteAllText((Join-Path $root 'task-observers-paused.flag'),'');$script:dragonPendingEvents.Add(@{id='old'})
 Sync-DragonActivityObserver ($now+2);Check ($script:stops-eq 1 -and $script:dragonActivityPhase-eq 'idle' -and $script:dragonTaskSummary.observerStatus-eq 'paused' -and $script:dragonPendingEvents.Count-eq 0) 'pause-stops-reading-and-discards-old-visual-reaction'
 [IO.File]::Delete((Join-Path $root 'task-observers-paused.flag'))
 $script:completionNotificationsEnabled=$true;$script:completionAcknowledgedAt=0;$script:completionPendingCount=0;$script:completionReceived=0;$script:completionPending=$false;$script:completionTemporary=$null;$script:collapsed=$true;$script:quiet=$true;$script:opened=0
 function Test-WidgetExperienceQuiet {return $script:quiet}
 function Start-CompletionMonitor {}
 function Stop-TemporaryCompletion {$script:completionTemporary=$null}
 function Reset-WidgetAutoQuoteSchedule {}
 function Read-CompletionMonitorOutput {}
 function Test-WidgetCompletionHostForeground {return $true}
 function Test-WidgetCompletionForeground {return $true}
 function Test-WidgetUpdateEditor {return $false}
 function Open-WidgetBubble {$script:opened++}
 $script:window=@{IsVisible=$true};$script:context=@{IsOpen=$false};$script:drag=$false
 Receive-CompletionMonitorLine (@{type='completion';sessionId='anonymous-a';turnId='turn-a';endedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json -Compress)
 Tick-CompletionNotifications $true
 Check (!$script:completionPending -and $script:completionPendingCount-eq 0 -and $script:completionReceived-eq 1 -and $script:opened-eq 0) 'quiet-consumes-completion-without-display'
 $script:quiet=$false;Tick-CompletionNotifications $true;Check ($script:opened-eq 0) 'leaving-quiet-does-not-replay-old-completion'
 Receive-CompletionMonitorLine ('{"type":"completion","sessionId":"anonymous-b","turnId":"turn-b","endedAt":'+([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+1)+'}')
 Receive-CompletionMonitorLine ('{"type":"completion","sessionId":"anonymous-c","turnId":"turn-c","endedAt":'+([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+1)+'}')
 Check ($script:completionPendingCount-eq 2) 'completion-pending-count-is-aggregated-anonymously'
 $result=@{ok=$true;checks=$checks.Count;names=@($checks);fakeState=$true;productionInstalled=$false}
 if($Report){[IO.File]::WriteAllText([IO.Path]::GetFullPath($Report),($result|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))}
 $result|ConvertTo-Json -Depth 4
}finally{if([IO.Path]::GetFullPath($root).StartsWith([IO.Path]::GetFullPath($work)+[IO.Path]::DirectorySeparatorChar)){Remove-Item -LiteralPath $root -Recurse -Force}}
