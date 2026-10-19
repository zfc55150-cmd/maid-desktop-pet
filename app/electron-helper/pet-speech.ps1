$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
try {
  $taskText = [Console]::In.ReadToEnd()
  if ([string]::IsNullOrWhiteSpace($taskText)) { exit 0 }
  $taskToken = New-Object -ComObject SAPI.SpObjectToken
  $taskToken.SetId('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens\MSTTS_V110_zhCN_HuihuiM')
  $taskVoice = New-Object -ComObject SAPI.SpVoice
  $taskVoice.Voice = $taskToken
  $taskVoice.Rate = 0
  $taskVoice.Volume = 80
  # SVSFIsNotXML: text is never interpreted as markup, commands, or file paths.
  $null = $taskVoice.Speak($taskText, 17)
  while (-not $taskVoice.WaitUntilDone(200)) {
    if ($env:PET_SPEECH_PARENT -and -not (Get-Process -Id ([int]$env:PET_SPEECH_PARENT) -ErrorAction SilentlyContinue)) {
      $null = $taskVoice.Speak('', 3)
      exit 0
    }
  }
} catch { exit 1 }
