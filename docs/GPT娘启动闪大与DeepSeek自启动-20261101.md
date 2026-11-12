# GPT娘启动闪大与DeepSeek自启动

2026-11-01已按用户要求完成两项操作。

## GPT娘首次显示尺寸

已安装 `0.7.3-startup-size.1`，只修改 `widget.ps1` 的 `Set-WidgetPixelSize`。原函数在首次Show前取不到WPF CompositionTarget，默认使用1倍换算，造成150%屏幕把物理像素数直接写成DIP：隔离复现中，正常约529 DIP被设成794 DIP，显示后重新计算才恢复约529 DIP。

修复后，隐藏但已有HWND时先读取GetDpiForWindow；没有HWND时使用目标放置DPI。窗口可见后继续沿用WPF换算矩阵。修复后隔离探测在首次Show前为529.2 DIP，首次Show后因原生像素取整为529.333 DIP，后续不再出现1.5倍闪大。静态预览读取成功，未将问题归因给动画素材。

维护片段：`integrations/gpt-niang/startup/pixel-size-dpi.ps1`；构建入口：`scripts/prepare-gpt-startup-fix.py`。有效包：`work/gpt-startup-size-20261101-02/`。使用当前安装的完整分叉widget作预映像，仅替换DPI片段，不用冻结的旧baseline覆盖它。

- 安装前widget SHA：`968d50045c9ea92c6448da54e8d9eacf1b8d79afb31817be938f66fbbac6de32`。
- 安装后widget SHA：`ca3dde29c5906947d4bb5d0d43b9a9ac88bc69cc50d23e8ca49d05863f9eceb5`。
- 43段/7500帧/125图集、B节奏、提前松手落地和现有悬停提示均保留。没有修改个人大小、位置或其他设置。

既有拖放包对悬停模块的依赖声明仍指向旧SHA，当前独立悬停维护源与实装SHA均为 `417385707bf825ef4317b0aff7bc0281739ccdae06f48756f9776d20940fb753`。本轮核对源与实装相同，明确保留此依赖并在新包重新绑定；不改旧交付包、不把旧声明直接当成当前安装损坏。第一次构建因此停止；未部署。-01仅留下失败探测目录，-02为有效包。

验证：

- `scripts/probe-gpt-startup.ps1`：真实WPF、安装模块及图集、假个人设置。记录隐藏/Show/布局/动画首帧的尺寸与DPI，未启动正式第二只桌宠或配额工作进程。
- `integrations/gpt-niang/startup/test-startup-size.ps1`：真实屏外窗口，人物倍率0.6/1/1.4/2.5及目标DPI换算1/1.25/1.5/2，共16组合。旧代码16组首帧偏大，修复后0组；比较首次原生窗口像素尺寸与目标及稳定尺寸，容许1像素取整。实际硬件屏幕是150% DPI，其他比例是目标尺寸输入，并非多显示器人工视觉验收。
- 新包受保护预检、安装及健康检查通过；203项应用文件、8项代理文件SHA一致。当前单实例由维护健康检查核验，末次presence可见、timer-started、无动画错误。
- 安装回执：protectedFilesUnchanged=true、rectanglePreserved=true，正常重启一次GPT娘。回退备份只读预检通过，未为了验证回退再重启。
- DeepSeek51项源码/安装哈希一致，没有改其应用代码。本轮没有调用付费API或生成/下载素材。

真实桌面重启的肉眼观感仍由用户复核；不将隔离窗口尺寸检查称为逐帧屏幕录像或艺术验收。修复仅纠正首次显示换算，不调整用户大小偏好。

GPT娘回退备份：`%USERPROFILE%\AppData\Local\GPTNiangUsage\state\animation-backups\20261101-234016-3887c6fb3c914c9d949b179b470e03fe`。从项目根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File work/gpt-startup-size-20261101-02/reviewed-delta.ps1 -RollbackBackup '%USERPROFILE%\AppData\Local\GPTNiangUsage\state\animation-backups\20261101-234016-3887c6fb3c914c9d949b179b470e03fe' -Apply
```

## DeepSeek娘登录自启动

已在当前用户Windows启动文件夹创建 `DeepSeekActionPet.lnk`：

`%USERPROFILE%\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\DeepSeekActionPet.lnk`

目标为系统 `wscript.exe`，参数为现有安装目录的 `start.vbs`，工作目录为 `%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet`。复用现有隐藏窗口启动及固定端口/单实例保护；不添加第二套宿主、服务或计划任务，不重启DeepSeek。当前启动文件夹此前无其他桌宠入口，所选快捷方式不存在，StartupApproved中也无禁用项。

脚本：`scripts/install-deepseek-autostart.ps1`，默认只预检，`-Apply`创建。写后重新打开快捷方式，核对目标/参数/目录；再次预检显示alreadyPresent=true、wasDisabled=false。receipt保存在 `work/deepseek-autostart-20261101-01/receipt.json`。创建前无同名入口，无需覆盖旧快捷方式；未修改StartupApproved记录。

下次登录Windows后自动启动，未注销或重启Windows来验证。可在任务管理器“启动应用”禁用；撤销本轮新增项也可删除上述单个快捷方式。此操作只改变当前账户的登录启动行为，不改变桌宠聊天或语音设置。
