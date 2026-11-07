# Electron 动作登记与候选入口（2026-11-01）

唯一候选全身动画配置源为 `catalog/animation-profile.candidate.json`。共享宿主的61名配置作为本次来源，独立入口的18名旧配置不再作为候选制作基准。`prepare-profile-sync.cjs <profile> <baseline.json> <新的work目录>` 验证两处实际配置SHA后，只输出两份同步候选；仅合并动画、权重、角色几何字段，保留位置、大小、人设与关闭的事件开关。正式两处配置尚未改写。候选中的 `releaseStatus` 不是安装状态。

本目录只维护单个角色的候选准备和构建工具。共享播放器运行模块为 `app/electron-helper/action-registry.js`；`action-registry.cjs` 只重导出该模块，不维护第二套逻辑。

`prepare-candidate.py --config <已核对配置> --media <已核对WebM目录> --studio <工坊目录> --out <项目work下全新目录>`：只读输入，计算全部 WebM 的 SHA-256，按内容合并别名，读取工坊脚本文本的 AST 常量及母版索引，输出登记、候选配置和语义预检。不会导入工坊代码、访问凭证、执行生成器、修改生产素材或设置。新配置把登记嵌入 `animations.actionRegistry`。需按唯一部署流程明确安装后才影响正式运行。

自动池采用保守白名单：正面待机和脚本明确接入原生返程的六段完整动作。该判断仅用于动作接续前提，不等同美术批准。侧身、道具、独立返程、事件、未明确来源的动作保留在素材库；未知入口不能凭片名硬播。当前候选从分类池暂退32条引用，未删除任何文件。工作与额度开关保持关闭。输入抢占、松手后的短时最新状态和事件过期由运行模块处理。

登记中 `null` / `unknown` 表示未标注，尤其镜像许可、精确可中断点、步态支撑相位和最短展示时长。不得把空字段解释为已经通过。`productionBuildAttested=false` 明确表示：现有生产 WebM 的哈希可以追踪，但历史混合/几何/编码操作尚无完整锁定配方，不能声称从列出的母版必然重建相同字节。来源清单是目前找到的关联输入，不是完整生成链证明。

`build-explicit-candidate.py --recipe <JSON> --out <项目work下全新目录>`：默认只做预检。仅支持一段已经完成几何标定的 640×360、30fps 无损 MKV 母版；JSON 必须锁定 `masterPath/masterSha256/masterCodec`、`ffmpegPath/ffmpegSha256`、`stage:{width:640,height:360,fps:30}`、`geometryEvidence` 和 `quality:crf24|crf16|lossless`。工具实际核对输入编码及尺寸，拒绝 WebM 作为母版；不会从现场生产文件补齐片段或改变配置。加 `--execute` 才编码一个候选，并保存构建清单。该工具不代替尚待收拢的全库 normalizer，也不自动作图像混合或宣称自然收势。

旧工坊 `generate_phase3_ecosystem.py` / `normalize_step03.py` 保持只读，不能直接重跑作为本次发布入口：旧生成器仍可将事件片写入随机池、将字符串写入 moves.actions 并直写正式配置；旧 normalizer 仍可能把现场 WebM 再编码。新预检拒绝这些语义/结构回归。今后若需要完整重建，先补完整配方、来源哈希与逐片视觉结论，不能绕过缺口。

本轮单元验证：`node --test tests/action-registry.test.cjs tests/pet-event-priority.test.cjs` 7项通过；`python -B tests/test_gpt_candidate_preflight.py` 3项通过。只验证受控语义/异步逻辑和安全边界；真实Electron、视觉、实际编码A/B及安装由主协调记录。没有调用API或生成新美术。
