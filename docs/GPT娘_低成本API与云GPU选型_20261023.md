# GPT娘低成本API与云GPU研究

核对日期：2026-10-23。仅只读研究和本机文件检查；未调用付费模型、租用实例、上传素材、下载新权重或恢复自动任务。现有付费锁继续有效。本文件是选型建议，不是新增付费授权。

## 作者使用豆包的证据边界

PC2005-cloud/dsh-pet 当前README明确写明素材由豆包生成，并说明全部正式动作走PR手工抠像路线。未找到具体Seedance版本、作者订单、网页额度或每个动作重试次数，因此不能确认作者用了Seedance2.5，不能倒推出他的实际制作成本。

字节Seed官方2026-02-12公告确认Seedance2.0已上线豆包、即梦和火山方舟；这些是不同入口，其网页额度、订阅和API费用不能混用。应核对具体界面的模型和用量。

来源：
- https://github.com/PC2005-cloud/dsh-pet
- https://seed.bytedance.com/zh/blog/seedance-2-0-正式发布

## 更低成本API候选

火山当前价格页：Seedance1.0ProFast输出4.2元/百万token；Seedance1.0Pro输出15元/百万token。按1280×720、24fps、5秒、无参考视频输入估算108000token，分别约0.4536元和1.62元。仅为估算，具体分辨率/帧数和最终usage决定实扣，账号可开通性另查。Fast图生支持首帧，不具备Pro的首尾帧控制，不能把低价普通图生与专门动作迁移视为相同功能。

万相wan2.6-i2v-flash北京区无声720P原价0.15元/秒，五秒0.75元；1080P无声0.25元/秒，五秒1.25元。尚未在当前龙娘上测试。此前用的是Wan3.0，不能以旧Wan2.2本地试片代表这个API的表现。

Seedance2.5并不是低价替代：官方720P、16:9、不含视频输入的五秒示例7.56元。网页赠送额度或会员权益与上述API价格另算，不能由此认定豆包网页每次收费7.56元。

来源：
- https://console.volcengine.com/ark/region:cn-beijing/docs/model-pricing
- https://docs.volcengine.com/docs/LakeAIService/SeedanceVideoGenerationDoubaoSeries?lang=zh
- https://help.aliyun.com/zh/model-studio/wan2-6-i2v-flash

## 本机实际情况

本次nvidia-smi核对：RTX5070 Laptop，8151MiB显存。现有Wan2.2-TI2V-5B-Diffusers仍在work/gpt-niang-animation/video/wan2.2-ti2v-5b，九份safetensors合计34179863648字节，约31.8GiB。没有重新下载。

已有idle-quality-mouth-v2记录：576×832、193帧、24fps，报告elapsedSeconds2161，约36分钟。这个时间是历史试片记录，不是新GPU速度。此次再次查看contact-keyed.png，仍有灰底/噪声残留和人物脸、服装细节漂移，未改变淘汰结论。代码卸载和CPU拼接解决了可运行性，没有解决艺术质量。

同模型同参数迁到更大GPU主要改善运行条件与速度；不能承诺自动变精细。更合理的云端试验应改变具体假设：用适合角色动作迁移的模型及明确的动作参考，而不重复原5B长试片。

## 开放权重候选与硬件边界

- Wan2.2-Animate-14B：第一优先研究。输入角色图与动作参考，提供animation/replacement模式，功能更贴近大幅度挥手、鞠躬。要准备合适驱动视频、保留小嘴，并独立检查Q版比例、饰品和透明边缘。具体显存必须绑定分辨率、精度、卸载策略和工作流；不能用5B的24GB示例证明14B也只需24GB。
- Wan2.2-I2V-A14B：普通图生对照候选。官方未经进一步优化的单卡示例注明80GB显存；24GB/32GB量化或卸载工作流需另外核实，不与原精度等同。
- HunyuanVideo1.5：第二套图生候选，官方标注启用offload时最低14GB显存。该数字不是任意分辨率、时长都能容纳的保证，也未在龙娘上实测。
- Wan-Animate-2：已有公开代码及Base/Distillation权重。官方默认示例针对8×A800，另测过2×A800的480P。研究价值高，但当前不作为小预算第一条部署路线；不能套用旧Animate的单卡低显存说法。
- LTX2.5：开放权重候选，官方快速开始约66GiB下载，另有速度与质量不同的管线；当前没有本项目人物一致性证据，不宜仅凭生成速度改成主线。

来源：
- https://github.com/Wan-Video/Wan2.2
- https://huggingface.co/Wan-AI/Wan2.2-Animate-14B
- https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5
- https://github.com/Wan-Video/Wan-Animate-2
- https://github.com/Lightricks/LTX-2

## 云GPU费用与试验建议

AutoDL官网公开价格搜索结果参考：4090/24GB每时1.88元，5090/32GB每时2.78元，A800/80GB每时5.59元。实际库存、机型和结算需租用前核对，公开参考价不是已锁定报价。48GB候选也可比较，但要按工作流确认显存与速度。来源：https://autodl.com/ 。

费用计算：每次原片GPU成本=GPU小时价×单次实际分钟/60。应另计部署、下载、失败、筛片和存储；关网页不等于停实例，GPU停止后磁盘是否计费须看选定平台规则。不能在没有实测前承诺每小时生成条数或合格率。

建议先离线确定一套可复现的Wan2.2-Animate-14B工作流与动作参考，优先准备预装依赖/权重的镜像。然后如用户明确授权，以总额20元、最多两小时（先到者停止）的独立试验验证一段约五秒挥手/鞠躬，保存耗时、显存和原片；用户接受后才扩展动作库。20元只是建议预算，当前尚未批准和执行。显存不足不得自动扩大卡型、下载或预算。

优先级建议：少量素材先核对豆包网页可用额度或低成本API；若要连续打磨很多段，再用按时租GPU建立可重复流程。两条路线都先验收一段，不能把价格低、显存大或技术检查通过当成美术合格。
