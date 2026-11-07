param([string]$Output="$env:USERPROFILE\Documents\Codex_产出\DeepSeek桌宠\桌宠文件导航")
$ErrorActionPreference='Stop'
$project="$env:USERPROFILE\Documents\ChatGPT\女仆桌宠"
$gpt="$env:LOCALAPPDATA\Programs\GPTNiangUsage\gpt-niang-usage"
$deep="$env:LOCALAPPDATA\Programs\DeepSeekActionPet"
$manifest=[IO.File]::ReadAllText((Join-Path $gpt 'runtime\dragon-animation\animation.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json
if($manifest.releaseVersion-ne '0.7.3-continuity'){throw 'Verify current formal version before building navigation'}
$items=@(
 @{pet='GPT娘';label='启动GPT娘';role='稳定启动入口';path="$env:LOCALAPPDATA\GPTNiangUsage\update-agent\agent-launch.vbs"},
 @{pet='GPT娘';label='程序文件';role='实际运行程序';path=$gpt},
 @{pet='GPT娘';label='个人数据';role='设置、状态和回退备份';path="$env:LOCALAPPDATA\GPTNiangUsage\state"},
 @{pet='GPT娘';label='维护源码';role='动画、形态与维护源码';path=(Join-Path $project 'integrations\gpt-niang')},
 @{pet='GPT娘';label='素材浏览入口';role='37段认可动作和2张角色参考';path="$env:USERPROFILE\Documents\Codex_产出\DeepSeek桌宠\素材总库\GPT素材\打开GPT素材.html"},
 @{pet='GPT娘';label='素材目录';role='原片与透明母版导航';path="$env:USERPROFILE\Documents\Codex_产出\DeepSeek桌宠\素材总库\GPT素材"},
 @{pet='GPT娘';label='当前优化与衔接设计';role='优化说明、增量包、验收与衔接设计';path="$env:USERPROFILE\Documents\Codex_产出\DeepSeek桌宠\GPT娘交互优化\GPT娘衔接与待机优化_0.7.3_20261028_01"},
 @{pet='DeepSeek娘';label='启动DeepSeek娘';role='普通桌面启动入口';path=(Join-Path $deep 'start.vbs')},
 @{pet='DeepSeek娘';label='程序文件';role='实际运行程序1.2.3';path=$deep},
 @{pet='DeepSeek娘';label='个人数据';role='聊天、设置及个人数据';path="$env:LOCALAPPDATA\DeepSeekActionPet"},
 @{pet='DeepSeek娘';label='维护源码';role='定制宿主、界面与交互源码';path=(Join-Path $project 'app')},
 @{pet='共同维护';label='完整维护项目';role='统一维护来源、测试和文档';path=$project}
)
foreach($item in $items){if(!(Test-Path -LiteralPath $item.path)){throw ('Missing navigation target '+$item.path)}}
if(Test-Path -LiteralPath $Output){throw 'Use a fresh navigation directory'}
$null=New-Item -ItemType Directory -Path $Output
$shell=New-Object -ComObject WScript.Shell
$builder=[Text.StringBuilder]::new();$null=$builder.AppendLine('# 两只桌宠的文件地址');$null=$builder.AppendLine('');$null=$builder.AppendLine('2026-10-28 已核对。导航只建立快捷方式，不复制或移动程序、原片、母版及个人数据。历史交付与回退备份继续保留原位置。');$null=$builder.AppendLine('')
$html=[Text.StringBuilder]::new();$null=$html.AppendLine('<!doctype html><meta charset="utf-8"><title>桌宠文件导航</title><style>body{font:17px system-ui;max-width:1050px;margin:40px auto;color:#302e39;background:#f8f6fa}article{background:white;padding:18px;margin:12px 0;border-radius:12px}a{color:#6452ac}code{overflow-wrap:anywhere;font-size:14px}</style><h1>桌宠文件导航</h1><p>GPT娘 0.7.3-continuity；DeepSeek娘 1.2.3。程序、个人数据、源码和素材按用途分别列出，原位置保持。</p>')
foreach($pet in @('GPT娘','DeepSeek娘','共同维护')){
 $folder=Join-Path $Output $pet;$null=New-Item -ItemType Directory -Path $folder
 $null=$builder.AppendLine('## '+$pet);$null=$builder.AppendLine('');$null=$html.AppendLine('<h2>'+$pet+'</h2>')
 foreach($item in @($items|Where-Object{$_.pet-eq $pet})){
  $linkFile=Join-Path $folder ($item.label+'.lnk');$link=$shell.CreateShortcut($linkFile);$link.TargetPath=$item.path;$link.Description=$item.role;$link.Save()
  if($shell.CreateShortcut($linkFile).TargetPath-ine $item.path){throw 'Shortcut verification failed'}
  $null=$builder.AppendLine('- **'+$item.label+'**（'+$item.role+'）：`'+$item.path+'`');$null=$builder.AppendLine('')
  $uri=([Uri]::new($item.path)).AbsoluteUri
  $null=$html.AppendLine('<article><a href="'+[Net.WebUtility]::HtmlEncode($uri)+'">'+$item.label+'</a><p>'+[Net.WebUtility]::HtmlEncode($item.role)+'</p><code>'+[Net.WebUtility]::HtmlEncode($item.path)+'</code></article>')
 }
}
$utf8=[Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $Output '文件地址说明.md'),$builder.ToString(),$utf8)
[IO.File]::WriteAllText((Join-Path $Output '打开桌宠文件导航.html'),$html.ToString(),$utf8)
$record=@{ok=$true;createdAt=[DateTimeOffset]::Now.ToString('o');shortcuts=$items.Count;sourceMediaMoved=0;personalDataCopied=0;items=$items}
[IO.File]::WriteAllText((Join-Path $Output '导航清单.json'),($record|ConvertTo-Json -Depth 6),$utf8)
@{ok=$true;output=$Output;shortcuts=$items.Count;sourceMediaMoved=0;personalDataCopied=0}|ConvertTo-Json -Compress
