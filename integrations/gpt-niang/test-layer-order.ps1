param([Parameter(Mandatory=$true)][string]$WidgetPath,[Parameter(Mandatory=$true)][string]$HostLayerPath,[Parameter(Mandatory=$true)][string]$WorkDir,[Parameter(Mandatory=$true)][long]$ElectronHandle)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,WindowsBase
. $HostLayerPath
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class GptWidgetNative {
 [DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int z,uint flags);
}
'@
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText($WidgetPath,[Text.Encoding]::UTF8),[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors|Out-String)}
$fn=$ast.Find({param($node)$node-is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name-eq 'Raise-WidgetForInteraction'},$true)
if(!$fn){throw 'Missing production interaction function'}
. ([ScriptBlock]::Create($fn.Extent.Text))
function Assert-Above([IntPtr]$Above,[IntPtr]$Below,[string]$Label){
    $current=[GptWidgetZOrderNative]::GetWindow($Below,3)
    for($i=0;$i-lt 10000 -and $current-ne [IntPtr]::Zero;$i++){
        if($current-eq $Above){return}
        $current=[GptWidgetZOrderNative]::GetWindow($current,3)
    }
    throw "Incorrect native window order: $Label"
}
function Request-Electron([string]$Command){
    $id=[Guid]::NewGuid().ToString('N')
    @{id=$id;command=$Command}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $WorkDir 'request.json') -Encoding UTF8
    $deadline=[DateTime]::UtcNow.AddSeconds(5)
    do{
        Start-Sleep -Milliseconds 60
        try{$reply=Get-Content -LiteralPath (Join-Path $WorkDir 'response.json') -Raw -Encoding UTF8|ConvertFrom-Json}catch{$reply=$null}
        if($reply.id-eq $id){if(!$reply.ok){throw 'Electron interaction failed'};return}
    }while([DateTime]::UtcNow-lt $deadline)
    throw 'Electron interaction timeout'
}
$script:window=New-Object Windows.Window
$script:window.Title='Isolated GPT pet layer regression'
$script:window.Width=100;$script:window.Height=100;$script:window.Opacity=0
$script:window.ShowActivated=$false;$script:window.ShowInTaskbar=$false
$script:followHost=$false;$script:desktopTopmost=$true
$checks=@()
try{
    $script:window.Show()
    $script:widgetHandle=([Windows.Interop.WindowInteropHelper]::new($script:window)).Handle
    Raise-WidgetForInteraction
    Assert-Above $script:widgetHandle ([IntPtr]$ElectronHandle) 'GPT interaction above Electron'
    $checks+='GPT interaction raises its real WPF window'
    Start-Sleep -Milliseconds 6500
    Assert-Above $script:widgetHandle ([IntPtr]$ElectronHandle) 'idle Electron watchdog retains order'
    $checks+='6.5 seconds of Electron watchdog leaves GPT in front'
    Request-Electron 'interact'
    Assert-Above ([IntPtr]$ElectronHandle) $script:widgetHandle 'Electron interaction above GPT'
    $checks+='DeepSeek interaction raises its real Electron window'
    Raise-WidgetForInteraction
    Assert-Above $script:widgetHandle ([IntPtr]$ElectronHandle) 'second GPT interaction reverses order'
    $checks+='later GPT interaction reverses the order'
    Request-Electron 'interact'
    $script:followHost=$true
    Raise-WidgetForInteraction
    Assert-Above ([IntPtr]$ElectronHandle) $script:widgetHandle 'window-follow mode leaves desktop priority alone'
    $checks+='window-follow mode does not force desktop topmost'
    $script:followHost=$false;$script:desktopTopmost=$false
    Raise-WidgetForInteraction
    Assert-Above ([IntPtr]$ElectronHandle) $script:widgetHandle 'topmost off leaves priority alone'
    $checks+='disabled desktop topmost is respected'
    @{ok=$true;checks=$checks}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $WorkDir 'native-result.json') -Encoding UTF8
}catch{
    @{ok=$false;error=$_.Exception.Message;checks=$checks}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $WorkDir 'native-result.json') -Encoding UTF8
    throw
}finally{$script:window.Close()}
