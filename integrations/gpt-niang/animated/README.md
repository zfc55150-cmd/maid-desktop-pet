2026-11-02：当前正式人物已迁移为 **0.8.0-electron**。本目录保留既有素材、来源与WPF维护历史；下面的“当前实装”属于历史记录。当前人物源码为 `integrations/gpt-niang/product-electron`；正式自检使用新人物包app/package-doctor.cjs。不要将旧WPF部署清单覆盖回新正式入口。[迁移记录](../../../docs/GPT娘Electron正式迁移与旧版清理-20261102.md)。

2026-11-02 当前实装：`0.7.3-gentle-takeoff.1`；有效清单 `work/gpt-gentle-takeoff-20261102-01/deployment.json`，仅起飞准备时长改为1.2秒。[本轮记录](../../../docs/GPT娘起飞准备稍放缓-20261102.md)。

2026-11-02 当前实装：`0.7.3-held-air-landing.1`，有效清单 `work/gpt-held-air-landing-20261102-01/deployment.json`；同时支持手持已离地松手与实际甩出停稳两条落地路径。[本次记录](../../../docs/GPT娘拖动中已离地松手落地修复-20261102.md)。

2026-11-02 当前实装：`0.7.3-physical-landing.1`；有效清单 `work/gpt-physical-landing-20261102-03/deployment.json`，三项原生/动画模块更新，普通拖放不触发落地。[判定及回退](../../../docs/GPT娘按真实飞行判定落地-20261102.md)。

2026-11-02 当前实装：`0.7.3-drag-responsive.2`；有效清单 `work/gpt-drag-takeoff-20261102-02/deployment.json`，恢复完整起飞、落地1.2倍速，保留并行身份提示及其余更新。[本次记录](../../../docs/GPT娘完整起飞与落地适度提速-20261102.md)。

2026-11-01 当前实装：`0.7.3-drag-responsive.1`；有效清单 `work/gpt-drag-responsive-20261101-03/deployment.json`，保留并行步行/悬停v2与DPI修复。当前运行模块维护源在 `../drag-response/`；[验证与回退](../../../docs/GPT娘拖动入场与落地节奏优化-20261101.md)。

2026-11-01 当前实装：`0.7.3-startup-size.1`，修复首次显示DPI换算；43段、B节奏、提前松手落地及悬停提示保留。有效清单 `work/gpt-startup-size-20261101-02/deployment.json`；[修复与回退](../../../docs/GPT娘启动闪大与DeepSeek自启动-20261101.md)。下述其他清单为此前基线。

2026-11-01当前实装新增：`0.7.3-drag-release.1` 已修复飞行中途松手直接回待机，单模块更新，43段与B节奏保持。当前有效清单为 `work/gpt-drag-release-20261101-03/deployment.json`；[修复与回退](../../../docs/GPT娘提前松手落地修复-20261101.md)。下述B清单为此次更新前基线。

# GPT娘：当前维护入口

2026-11-01当前实装：用户已允许B单项受保护试用，使用`work/gpt-candidate-b-trial-20261101-04/`安装成功，只改自动池/节奏。203项WPF按B校验通过，设置/GC未混装，DeepSeek冻结。实际回退路径与首次停机失败记录见[安装与实机试用](../../../docs/GPT娘B单项安装与实机试用-20261101.md)。视觉验收仍待完成；下方-03未安装状态为本次授权前历史，旧37段构建器仍不可覆盖当前43段。

2026-11-01最新：B单项受保护试用包 `work/gpt-candidate-b-trial-20261101-03/` 已完成23个隔离场景与实际目录只读预检。只改动画清单，不混装设置/GC修复；旧白名单不改。**未部署、未重启，正式试用须先解除交接的不重启边界。** 见[包、演练与回退](../../../docs/GPT娘B单项试用包与保护演练-20261101.md)。

2026-11-01新窗口先读：[观感体检执行交接](../../../docs/GPT娘观感体检执行交接-20261101.md)及[当前分叉保全与隔离修复](../../../docs/GPT娘当前分叉保全与隔离修复-20261101.md)。DeepSeek冻结。Gemini第三次返回的核心实机补证有限通过；节奏B仍未实机运行。当前另有设置重试修复及GC第3版独立候选，均未安装。阿里云复杂审查使用Qwen3.8 Max。

2026-11-01 复核：当前 WPF 实际安装已有 **43 个动作、7500 帧、125 张图集**。下述维护发布清单仍对应 **0.7.3-continuity / forms-1.24-continuity**（宿主基线1.3.5）的37组6780帧旧基线，不能据此覆盖当前安装。相对旧清单的13项差异已找到旧声明原件、完成diff并保全当前字节，尚未归并为正式发布源或白名单；旧整包构建和安装不能作为本轮续接入口。

本轮沿用原版 PNG 帧路径，保留新增返程及当前定制；Electron 视频替换候选已撤回。见[清晰度复核与原版续接](../../../docs/GPT娘清晰度复核与原版续接-20261101.md)。下方命令中只读正式校验仍可运行，但预期会报告上述漂移，不能把其误读为当前安装损坏。

> **114 张 PNG 帧与 `frost-glass-cheek.png` 说明（R2-L13 / R4-P6）**：`deployment.json` 中登记的 114 张 `assets/dragon-animation/motion-v1/*.png` 图集帧属于历史 WPF 阶段（`0.7.3-continuity`）本地视频抽帧产物，为避免二进制大体积膨胀未直接入 Git 仓库（`verify-installed.cjs` 现已区分 `codeFailures` 与 `mediaFailures` / `MEDIA_MISSING`）。自 `0.8.0-electron` 起正式版已全面切换为 59 段 WebM 视频 + 384×384 位掩码（`hit-masks.json`），不再消费上述 PNG 序列；半身形态若包内未含 `assets/pet-forms/frost-glass-cheek.png`，`app/main.cjs` 的 `imageMask()` 会自动安全回落至包内 `assets/gpt-dragon-niang-bust.png` 或 `assets/frontidle.png`。

右键 → 设置 → 陪伴与任务：查看匿名任务状态、安静一会儿、暂停观察、清理自产状态、可选待机节奏及顺姿态点播。新选项默认保持原有行为。

- [本轮改动、使用与回退](HANDOFF-CONTINUITY-20261028.md)
- [0.6.8稳定性修复记录](HANDOFF-RESILIENCE-20261028.md)
- [历史说明](history/README-before-0.7.0.md)（历史命令不作为当前操作入口）

从项目根目录运行只读正式校验，不复制素材、不启动程序或联网：

```powershell
& "$env:LOCALAPPDATA\Programs\DeepSeekActionPet\node.exe" integrations/gpt-niang/animated/verify-installed.cjs
```

隔离整套验证：`node integrations/gpt-niang/animated/verify.cjs`。

更新与回退统一使用包内 `maintenance-runner.ps1`；默认只预检，`-Apply`才写入，回退加`-RollbackBackup`。底层apply不允许绕开锁与停止守护的维护上下文。每次新建交付目录、保留新旧SHA和可回退备份；维护源码在本项目，主窗口负责正式安装。

通用上游整包更新在定制版仅检查并通知。素材和母版保留原速原帧；技术检查与人工美术验收分别记录。
