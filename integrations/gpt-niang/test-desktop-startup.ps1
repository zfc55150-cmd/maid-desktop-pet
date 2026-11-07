param([Parameter(Mandatory=$true)][string]$WidgetPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$tokens=$null; $errors=$null
$source=[IO.File]::ReadAllText($WidgetPath,[Text.Encoding]::UTF8)
$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw ($errors | Out-String)}
foreach($name in @('Limit-WidgetHorizontalPosition','Limit-WidgetVerticalPosition')){
    $definition=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    if(!$definition){throw "Function missing: $name"}
    . ([ScriptBlock]::Create($definition.Extent.Text))
}
$script:window=New-Object Windows.Window
$stage=New-Object Windows.Controls.Canvas
$root=New-Object Windows.Controls.Canvas
$girl=New-Object Windows.Controls.Image
$root.Children.Add($girl) | Out-Null
$stage.Children.Add($root) | Out-Null
$script:window.Content=$stage
$script:ui=@{Root=$root;Girl=$girl;FacingScale=(New-Object Windows.Media.ScaleTransform)}
$script:designWidth=378; $script:designHeight=378
$frame=[pscustomobject]@{Left=-1920;Right=0;Top=0;Bottom=1040}
$checks=0
try {
    if([Windows.PresentationSource]::FromVisual($root.Parent)){throw 'Expected an unattached startup visual'}
    foreach($dpi in @(1.0,1.5)){
        foreach($scale in @(0.6,0.8,1.0)){
            $script:displayScale=$scale
            foreach($requested in @(-5000,0,5000)){
                $x=Limit-WidgetHorizontalPosition $frame $dpi $requested
                $y=Limit-WidgetVerticalPosition $frame $dpi $requested
                if($x -lt $frame.Left -or $x+$script:designWidth*$scale*$dpi -gt $frame.Right+1){throw 'Horizontal first-frame placement left the monitor'}
                if($y -lt $frame.Top -or $y+$script:designHeight*$scale*$dpi -gt $frame.Bottom+1){throw 'Vertical first-frame placement left the monitor'}
                $checks+=2
            }
        }
    }
    "PASS: $checks hidden first-frame placement checks, including 80% sizing and a secondary monitor."
} finally { $script:window.Close() }
