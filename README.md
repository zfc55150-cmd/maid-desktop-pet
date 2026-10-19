# 蓝鲸女仆桌宠 · 维护版本 1.1.0

基于本机 dsh-pet 0.3.7。此目录是定制代码、回归测试与部署脚本的统一来源。实际安装仍在 `%LOCALAPPDATA%\Programs\DeepSeekActionPet`。

## 本次改动

- 本机 HTTP 控制与回调使用每次启动重新生成的随机令牌，检查 Host 与浏览器来源。关闭接口仅接受经过认证的 POST。
- 宿主固定绑定指定端口，不再因并发启动而顺延端口。启动器等待健康状态；关闭时核对会话 PID。
- 发送失败保留内存草稿，重新打开对话即可恢复；正常完成后清除草稿。关闭程序会丢弃未发送草稿。
- 区分 `stop`、`length` 与异常结束。达到长度上限会显示提示，右键菜单提供用户主动触发的续写。
- 清空成功后取消旧回复更新并清除气泡；生成中拒绝清空。回复或朗读进行中拒绝重载和应用大小。
- 新设置页可查看、复制最近记录；可编辑最长 6000 字的长期记忆，每次聊天作为上下文发送。不会自动提取或新增私人记忆。
- 清空操作允许分别选择清理上一版本备份和长期记忆，默认不勾选。保留二次确认和版本冲突检查。
- 流式片段使用本次回复的语音开关状态，避免每个片段同步读盘。保存仍执行互斥、版本校验及原子替换。
- 主窗口开启 Electron 沙箱，限制导航、弹窗与 IPC 调用者。语音日志仅写固定事件与错误码，超过 256 KiB 滚动，保留一份旧日志。
- 离线恢复包含现有 Node、Electron、Python、依赖、动作、参考音色及 Base 权重；不含个人聊天记录或 API 密钥。

## 源码布局

| 源文件 | 安装位置 |
| --- | --- |
| `app/launcher.mjs` | 程序根目录 `launcher.mjs` |
| `app/standalone.mjs` | `node_modules/dsh-pet/lib/standalone.js` |
| `app/electron-helper/*` | `node_modules/dsh-pet/runtime/electron-helper/*` |
| `app/voice-runtime/*` | `voice-runtime/*` |

`standalone.mjs` 是当前定制宿主的可维护发行源码。不要直接运行上游构建覆盖它；升级上游时先在此目录合并差异并通过测试，再生成部署清单。上游 MIT 许可与完整依赖许可随安装和离线包保留。

## 验证

使用程序自带 Node 或兼容的 Node 22.12+：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeekActionPet\node.exe" scripts/check.cjs
& "$env:LOCALAPPDATA\Programs\DeepSeekActionPet\node.exe" --test tests/core.test.cjs
```

`scripts/smoke-electron.cjs` 使用假数据、隐藏窗口验证真实沙箱预加载和设置 IPC。它不调用付费接口，不读取真实密钥。

先运行 `scripts/prepare-host-smoke.ps1`，再运行 `scripts/host-smoke.ps1`，可对工作目录中的隔离宿主执行并发启动、鉴权及渲染检查；不会修改正式安装。

## 安装与回退

`deployment.json` 针对审查时的已安装版本记录新旧 SHA-256。安装前应重新检查目标版本，不能在未知版本上强制覆盖。

```powershell
./scripts/install.ps1
./scripts/rollback.ps1 -BackupRoot '维护版本目录\更新前代码'
```

安装脚本先验证源文件与目标文件，备份代码，关闭桌宠，替换并核对文件，然后启动。密钥、人设、记录、大小、参考声音均校验保留。回退只恢复代码，不回退个人数据。

## 完整离线恢复

将 `restore-offline.ps1`、完整离线 ZIP 和 `恢复包校验.json` 放在同一文件夹，运行脚本。默认目标是当前账户的标准安装目录，已有安装时拒绝覆盖。恢复会核对整个 ZIP 和每个文件，调整 Python 路径，再验证依赖；新电脑需要兼容的 NVIDIA 驱动与可用显存。本地语音不可用时仍可使用文字聊天。

新账户请自行填写 API Key。现有个人数据不会由恢复包覆盖；若需要迁移聊天，可另行备份个人数据，跨账户后重新填写密钥。

长期稳定性、蓝牙/声卡切换后的听感仍取决于实际设备。此次保留原语音生成、分句、参考音频和 400ms 尾部缓冲。
