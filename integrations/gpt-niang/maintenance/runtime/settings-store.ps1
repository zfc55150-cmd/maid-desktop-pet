# Settings bytes stay local. Never replace the last valid backup with bad input.
function Get-WidgetSettingsDigest([string]$Path) {
  if(![IO.File]::Exists($Path)){return $null}
  $stream=[IO.File]::OpenRead($Path);$sha=[Security.Cryptography.SHA256]::Create()
  try{return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
}
function Read-WidgetSettingsDocument([string]$Path) {
  if(![IO.File]::Exists($Path)){return [pscustomobject]@{Exists=$false;Valid=$false;Data=$null;Digest=$null}}
  try{
    if(([IO.FileInfo]::new($Path)).Length-gt 1048576){return [pscustomobject]@{Exists=$true;Valid=$false;Data=$null;Digest=$null;ErrorCode='SETTINGS_TOO_LARGE'}}
    $raw=[IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8)
    if($raw-notmatch '^\s*\{' -or $raw-notmatch '\}\s*$'){throw 'SETTINGS_OBJECT_REQUIRED'}
    $data=$raw|ConvertFrom-Json -ErrorAction Stop
    if($null-eq $data -or ($data-isnot [pscustomobject] -and $data-isnot [Collections.IDictionary])){throw 'SETTINGS_OBJECT_REQUIRED'}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$digest=([BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    # A concurrent editor must not make the parsed object refer to other bytes.
    if([IO.File]::ReadAllText($Path,[Text.Encoding]::UTF8)-cne $raw){throw 'SETTINGS_CHANGED'}
    return [pscustomobject]@{Exists=$true;Valid=$true;Data=$data;Digest=$digest}
  }catch{return [pscustomobject]@{Exists=$true;Valid=$false;Data=$null;Digest=$null}}
}
function Open-WidgetSettingsStore([string]$Path) {
  $state=[pscustomobject]@{Path=[IO.Path]::GetFullPath($Path);Data=[pscustomobject]@{};CanSave=$false;Revision=$null;Recovered=$false;ErrorCode='SETTINGS_UNREADABLE'}
  $main=Read-WidgetSettingsDocument $state.Path
  if($main.Valid){$state.Data=$main.Data;$state.Revision=$main.Digest;$state.CanSave=$true;$state.ErrorCode=$null;return $state}
  $backup=Read-WidgetSettingsDocument ($state.Path+'.bak')
  if($main.ErrorCode-eq 'SETTINGS_TOO_LARGE'){
    if($backup.Valid){$state.Data=$backup.Data}
    $state.ErrorCode='SETTINGS_TOO_LARGE';return $state
  }
  if(!$main.Exists -and !$backup.Exists){$state.CanSave=$true;$state.ErrorCode=$null;return $state}
  if(!$backup.Valid){return $state}
  $state.Data=$backup.Data
  $temp=$state.Path+'.recover-'+[Guid]::NewGuid().ToString('N')
  try{
    $before=Get-WidgetSettingsDigest $state.Path
    if($main.Exists){[IO.File]::Copy($state.Path,($state.Path+'.corrupt-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'-'+[Guid]::NewGuid().ToString('N')),$false)}
    [IO.File]::Copy(($state.Path+'.bak'),$temp,$false)
    if((Get-WidgetSettingsDigest $temp)-ne $backup.Digest -or (Get-WidgetSettingsDigest $state.Path)-ne $before){throw 'SETTINGS_CHANGED'}
    if([IO.File]::Exists($state.Path)){[IO.File]::Replace($temp,$state.Path,[NullString]::Value)}else{[IO.File]::Move($temp,$state.Path)}
    $restored=Read-WidgetSettingsDocument $state.Path
    if(!$restored.Valid -or $restored.Digest-ne $backup.Digest){throw 'SETTINGS_RECOVERY_FAILED'}
    $state.Data=$restored.Data;$state.Revision=$restored.Digest;$state.CanSave=$true;$state.Recovered=$true;$state.ErrorCode='SETTINGS_RECOVERED_BACKUP'
  }catch{$state.CanSave=$false;$state.ErrorCode='SETTINGS_RECOVERY_FAILED'}
  finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
  return $state
}
function Save-WidgetSettingsStore($State,$Value) {
  if(!$State -or !$State.CanSave){throw 'SETTINGS_SAVE_BLOCKED'}
  $current=Read-WidgetSettingsDocument $State.Path
  if(($current.Exists -and !$current.Valid) -or $current.Digest-ne $State.Revision){$State.CanSave=$false;$State.ErrorCode='SETTINGS_CHANGED';throw 'SETTINGS_SAVE_BLOCKED'}
  $temp=$State.Path+'.save-'+[Guid]::NewGuid().ToString('N')
  try{
    $raw=$Value|ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText($temp,$raw,[Text.UTF8Encoding]::new($false))
    $next=Read-WidgetSettingsDocument $temp
    if(!$next.Valid -or (Get-WidgetSettingsDigest $State.Path)-ne $State.Revision){throw 'SETTINGS_CHANGED'}
    if($current.Exists){[IO.File]::Replace($temp,$State.Path,($State.Path+'.bak'),$true)}else{[IO.File]::Move($temp,$State.Path)}
    $State.Revision=$next.Digest;$State.Data=$next.Data
  }catch{$State.CanSave=$false;$State.ErrorCode='SETTINGS_SAVE_FAILED';throw 'SETTINGS_SAVE_FAILED'}
  finally{if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}}
}
