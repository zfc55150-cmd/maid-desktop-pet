param([string]$Package=(Join-Path $PSScriptRoot '../../../work/gpt-gentle-takeoff-20261102-01'))
$ErrorActionPreference='Stop';$Package=[IO.Path]::GetFullPath($Package)
$probe=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'test-real-held.ps1'))
$live='$env:LOCALAPPDATA/Programs/GPTNiangUsage/gpt-niang-usage'
$probe=$probe.Replace("(Join-Path `$Package 'files/runtime/dragon-animation/motion-selection.ps1')",("'"+$live+"/runtime/dragon-animation/motion-selection.ps1'"))
$probe=$probe.Replace("(Join-Path `$Package 'files/runtime/native-motion.cs')",("'"+$live+"/runtime/native-motion.cs'"))
$probe=$probe.Replace("(Join-Path `$PSScriptRoot 'test-real-wpf.ps1')",("'"+(Join-Path $PSScriptRoot 'test-real-wpf.ps1').Replace("'","''")+"'"))
. ([ScriptBlock]::Create($probe)) -Package $Package
