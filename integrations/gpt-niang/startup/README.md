# GPT娘首次显示尺寸

2026-11-01 已安装 `0.7.3-startup-size.1`。当前有效安装清单在 `work/gpt-startup-size-20261101-02/deployment.json`，保留43段动画、B节奏、提前松手落地和独立悬停提示更新。

`pixel-size-dpi.ps1` 是 `Set-WidgetPixelSize` 的受维护替换片段；`scripts/prepare-gpt-startup-fix.py` 针对当前安装精确哈希生成单文件widget更新包，不使用旧37段整包，不修改冻结baseline。新包保全安装前完整widget字节，替换片段之外字节不变，沿用维护锁、备份、健康检查和回退流程。

`test-startup-size.ps1` 用真实屏外WPF窗口验证首次显示尺寸与后续稳定尺寸。四种人物大小、四种目标DPI换算比例，共16种组合；实际显示器DPI为150%，不代表在四台不同DPI显示器上的人工验收。旧函数16组复现尺寸偏大，新函数0组偏差。

故障原因是隐藏窗口尚无WPF CompositionTarget，旧函数默认除以1，将物理像素当成DIP写入窗口尺寸。修复在隐藏阶段使用原生HWND的DPI；还未创建HWND时使用目标放置DPI；可见后沿用WPF矩阵。没有改人物大小偏好，也没有通过延时或透明遮挡掩盖问题。

完整结果、使用和回退见 [本次记录](../../../docs/GPT娘启动闪大与DeepSeek自启动-20261101.md)。
