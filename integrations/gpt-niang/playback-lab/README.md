# GPT娘播放路径隔离实验

本轮素材调度与核查：`electron-materials.1`，入口指向 `work/gpt-playback-materials-20261102-01/candidate-source/`。新增候选随机表演、暂停与两项交互边界修复；正式43段与候选8段分别记录。见[素材与当前显示检查](../../../docs/GPT娘素材使用与当前显示核查-20261102.md)。下方架构第二版为上一轮记录。

2026-11-02 当前架构候选：`electron-architecture.2`，正式基线已重新核对为 `0.7.3-idle-variety.1`。本轮明确选择 Electron/Chromium 透明视频主路线，保留 WPF 日常入口。责任、状态表、实际证据和后续门槛以[本轮架构记录](../../../docs/GPT娘架构最小闭环-20261102.md)为准；下方各批数据均是历史现场。

新的试用入口由 `打开透明桌面试用.cmd` 指向 `work/gpt-playback-architecture-20261102-02/candidate-source/` 封存代码。启动前校验候选源码、视频/命中数据、运行时和正式基线 SHA。拖放物理与表演调度分离，松手保帧仅用于短暂取消交接，随后动态待机；不再整段惯性保持静帧。`desktop-release.js` 及旧 probe-release 仅为历史冻结策略探针，当前桌面入口不载入它们。

本轮候选不接产品任务、额度或半身，不写正式设置；走路仍是原地表演。软件合成隐藏验证不等同屏幕验收。正式试用始终显式 `--manual-exit`；右键人物或托盘退出后由控制器恢复正式版。忙碌检查拒绝交接时保留正式实例。尚未制作独立运行时分发包，目前只读复用已安装 Electron/Node 二进制，完全不载入 DeepSeek 正式共享代码；冻结的 vendor 物理副本与 MIT 来源保持。

透明桌面候选进展与恢复修正：[第四批记录](../../../docs/GPT娘透明桌面候选与恢复修正-20261102.md)。普通预览已获用户初步认可；透明窗口可见性与真实输入仍未验收。用户目前外出，试用已结束并恢复正式挂件，证据目录`work/gpt-playback-lab-20261102-06/`。

第三批入口与结果：见 [同口径对照及可视会话](../../../docs/GPT娘同口径播放对照与可视预览-20261102.md)，当前数据在`work/gpt-playback-lab-20261102-05/`。新增SourceMetrics同口径观察、A原安装模块对照、Electron进程内互斥量与一次性空闲后预览/恢复控制器。以下第一、二批的限制与数据为各自时刻记录，不能替代本批状态。

2026-11-02 后续进展：动作链、中断与首帧控制已扩展，当前证据为 `work/gpt-playback-lab-20261102-04/`。见下文“第二批验证”。下面第一批的性能数值只代表当时的代码与测试环境，不是当前候选的复测性能承诺。

2026-11-02。候选维护入口；不属于正式安装包。用户已授权启动架构评审后的推进计划。

本轮完成安装基线固定、被动遥测、编译C#播放组件初版、单片透明视频对照及不显示窗口的技术验证。**阶段①的屏幕证据仍缺，阶段②只完成技术可行性部分，不能进入阶段③部署。**未改正式应用、个人设置、DeepSeek共享代码；未重启、关闭或显示另一只桌宠。没有API调用。

当前证据目录：`work/gpt-playback-lab-20261102-03/`。-01因WinPS默认文本编码失败，-02因沙箱进程不可见失败，均仅保留小型失败现场，不是有效基线。-03显式UTF-8读取，在宿主只读采集进程数据。脚本不改变执行策略；入口用ScriptBlock读取本项目源码。

## 有效结果

- GPT `0.7.3-gentle-takeoff.1` 的207项、DeepSeek `1.2.3-interaction-fix.2`的51项在开始及结束时一致。-03有冻结清单、动画JSON和解码器源码；按受控清单只读引用安装素材，不复制整套图集。
- 窗口DPI144，窗口外框453×453物理像素。**人物有效物理像素高度、显示器刷新率尚未测得**，不能拿窗口高度当人物高度。
- 约21.24秒被动样本来自正在运行的混合动作，私有内存789.2～881.1MiB；CPU增量约0.303个逻辑核心。这不是稳定动作基准、长期内存趋势或与候选的同负载对照。
- B组件沿用冻结解码器的抠图后像素、固定校准及Crop，改用编译C#时钟/提交和按字节预算的LRU缓存；不在播放路径调用强制GC。21页校准后整页像素哈希一致，42个页首尾单元一致。缓存自有页预算108MiB，**不是总进程内存上限**，另外还有解码缓冲、当前图像及WPF内部引用。
- B验证覆盖真实跨页、循环、错误哈希后的恢复、两个加载槽已占用时最新请求获胜、旧请求禁止提交及销毁后禁止绘制。最终约12.2秒运行累计355次提交（包含前面的准备提交），记录15个跳过源帧索引、0次缺页脉冲；采样观察到的最大提交间隔约69.3ms。均为不显示窗口的Image/Dispatcher结果，不能作为桌面帧率或观感认证。
- C样本只从同一frontidle校准后180帧BGRA本地重编码，384×384、30fps、VP9 Alpha、CRF12、4:2:0，2,098,122字节。不是新动作生成，也不是无损输出。
- 编码控制使用libvpx解码全部180帧，确认实际透明像素存在；逐帧核对编码输入哈希。0～255标度下，Alpha平均绝对误差0.0884、最大误差33，黑白背景合成平均绝对误差0.8034。平均值不能替代发丝/边缘的局部原速验收。
- C使用现有Electron43.3.0可执行文件，但载入的是本目录独立代码及独立临时profile，不载入或修改DeepSeek宿主代码。offscreen模式无可见窗口：176次paint事件，媒体统计179帧、0丢帧。GPU特性报告显示video_decode及gpu_compositing为软件路径。这只说明此探针配置，不是正式桌面的硬解认证。

## 能运行什么

使用现有Node，不安装依赖。以下命令在项目根目录运行，路径使用新目录；capture需要能读取宿主进程。

```powershell
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs capture work/新的实验目录
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs verify work/新的实验目录
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs encode work/新的实验目录
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs electron work/新的实验目录
& 'C:\Program Files (x86)\Microsoft Visual Studio\Shared\Python39_64\python.exe' -B integrations/gpt-niang/playback-lab/measure-encoding.py work/新的实验目录
```

每次verify会重新核对全部GPT受管文件；检测并行更新即停止，不绕过清单。capture目前明确针对gentle-takeoff成功回执：出现新成功版本时需先审查并更新回执入口，不把旧基线差异当损坏。Electron可执行文件目前只作为本机实验依赖，**尚不具备独立发行运行环境**。

## 下一阶段的具体缺口

1. 取得当前播放器A的屏幕/提交/输入时间对应证据，固定实际人物高度、刷新率、背景及负载；当前被动心跳不能替代这些数据。
2. B尚未接入产品调度、CPU淡化替代、任务状态、点击回弹、分段起飞时间映射、半身、真实窗口运动。现阶段只验证原速单片播放、任意常数倍速及请求生命周期，不能拿它替代整只宠物。
3. C目前仅单片offscreen探针；尚未实现双视频切换竞争/取消、桌面透明窗口、命中、无激活、多屏或物理。不得把offscreen的0丢帧与B的索引跳帧直接作优劣结论。
4. 对照扩展到已认可抱臂/回姿、起飞/落地、新版走路，以及确有离身物体的现存源片；新增样本不构成艺术认可。保留同源和编码误差控制。
5. 完成单一显示权与异常回收契约后，安排顺序可视A/B。旧人物确认隐藏、候选才可显示；恢复前先撤销候选。任何自动重启入口都必须服从同一显示权。正式DeepSeek保持独立。
6. 你验收原速画质和手感，再做60分钟资源收敛；只有胜出候选和产品功能都通过才制作匹配基线的小型部署包。未达到条件不安装。

当前不应变更架构推荐：继续局部替换验证，不宣称WPF已到平台上限，也不宣称Electron已胜出。基线报告和候选指标都不是你的视觉认可。

临时Electron profile在成功后清理；仅保留小型对照视频、报告和必要源码快照。没有生成完整运行环境副本。

## 第二批验证

安装基线仍为gentle-takeoff.1，开始时重新核对207项；没有并行安装差异。本批不重复采集负载基准，-04记录从-03派生的来源。

### 已完成

- B新增多段动作链、真实末帧提交后的返回、外部新请求中断、80/180ms沿用原解码器CPU混合、逐次提交记录，以及当前起飞0～66帧/1200ms、后续1.25倍、落地1.2倍的时间映射。收到新请求后，旧链即使自然结束也不得夺回播放权。
- B真实图集场景按原速播放抱臂→收势→待机；模拟操作在flutter第85帧切入完整落地→待机。源片并未加速用于缩短测试。现有校验中的原生速度/首末帧、取消、缓存和像素检查通过。
- C扩展为独立双video播放器，制作同源七段对照（待机、抱臂、收势、起飞、落地、走路、展扇）。全部从冻结清单和原解码器校准后BGRA输出，逐帧输入SHA、压制参数、文件SHA及大小随样本保存。约14.3MiB，没有复制全库或生成新表演。展扇是现有场景样本，**尚未认证为离身道具覆盖**。
- C真实Chromium场景验证原速抱臂→收势→待机、新操作覆盖旧请求、分段起飞和1.2倍落地→待机。另有受控回调测试覆盖旧请求晚到、同一视频槽复用、失败后迟到回调、无效时间参数及销毁收尾。
- 实测发现“等play完成才订阅首帧”会从源片第1～2帧提交。最终改为在load前订阅暂停首帧，首帧确认后再play；最后一轮七次动作提交的mediaTime均为0，并加入硬性断言。`electron-sequence-before-frame0.json`保留首次现象；它不是当前通过结果。
- 新增B普通预览窗口入口，复用正式widget的既有命名互斥量。候选保有互斥量直到预览关闭；正式入口无法同时取得同一互斥量。ProbeOnly在宿主实际测得正式互斥量忙，未创建任何候选窗口。另测同进程重复占有被拒绝、释放后可重新占有。本批未正向打开预览窗口，不能声称可视UI已验收。

### 使用与边界

```powershell
# 不显示窗口的验证
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs sequence work/gpt-playback-lab-20261102-04
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs video-sequence work/gpt-playback-lab-20261102-04
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs visibility-probe work/gpt-playback-lab-20261102-04

# 可视预览入口：正式实例存在时直接拒绝；不自动关闭正式宠物。
# 正式实例已退出且基线匹配时，才会打开普通预览窗；关闭即释放互斥量。
& '%USERPROFILE%\AppData\Local\Programs\DeepSeekActionPet\node.exe' integrations/gpt-niang/playback-lab/run-lab.cjs review-wpf work/gpt-playback-lab-20261102-04
```

预览只提供待机、抱臂/收势、原地走路、起飞计时、落地、展扇的点播；并未集成真实拖动和窗口物理。目标人物高度按首帧335/384比例和窗口DPI换算，**还没有屏幕测量认证**。这是实验工具，不是产品替代。

B的CPU混合与C的CSS交叉淡化并不保证像素等价：零淡化的动作链用于时序控制，淡化段仅验证功能，不将其外观/成本当作公平性能收益。C分段变速依赖媒体播放与rAF调度，虽有边界场景检查，仍需屏幕侧核对相位误差。模拟“空中松手”不代表真实鼠标速度资格和物理已经迁移。

可视接管、A/B/C同条件屏幕呈现、真实输入延迟、多屏/命中/无激活、任务与半身功能、离身道具和60分钟资源收敛仍未完成。Electron可视宿主尚未接入进程内的正式互斥量，因此只允许offscreen模式，不提供不安全的可视开关。

本批结果保持“局部替换待验证”的推荐，不作迁移胜负结论。`phase2-summary.json`记录结束安装校验及未验证项；`candidate-source/`保留本批源码快照。复跑会改变运行结果，原有汇总和快照仍只属于封存时刻；后续实验使用新的work目录。
