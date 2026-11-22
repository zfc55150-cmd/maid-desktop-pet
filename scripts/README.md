# `scripts/` 目录脚本索引与分类说明

本目录汇总了双宠（DeepSeek 蓝鲸女仆 + GPT 傲娇龙娘）的构建、校验、安全部署、便携包打包以及历史专项演练脚本。为避免维护者混淆日常主流程脚本与历史一次性脚本，特此分类登记（对应审计项 B-L1）：

## 1. 核心校验、同步与发版门禁（CI / 发版必跑）

| 脚本 | 用途 | 调用方 / 验证状态 |
|---|---|---|
| `verify.cjs` | 全量清单哈希、直接前驱 `previousRef` 哈希链、`app/` 完整性、共享文件同步、`resolveLanguage` 一致性及根测试套件校验 | `npm run verify` / CI `verify.yml` / `build-deepseek-portable-release.py`（v1.0.8 持续维护） |
| `check.cjs` | 全仓 `.js` / `.cjs` / `.mjs` 语法静态检查 | `npm run check` / `verify.cjs`（v1.0.8 持续维护） |
| `sync-shared.cjs` | 同步 `release-notice`、`release-reminder`、`update.mjs` 与 `shared-core.js` 派生副本 | `verify.cjs` / `prepare-release.cjs`（v1.0.8 持续维护） |
| `repo-sync.cjs` | Git 远端分支比对、推送前敏感路径与凭据扫描（`--pre-push` / `--scan-worktree`） | 维护者手动推送前必跑（v1.0.8 持续维护） |
| `tagged-release.cjs` | 校验当前 `HEAD` 绑定唯一正式 `vX.Y.Z` 标签且工作树干净 | `build-deepseek-portable-release.py --formal` / `prepare-release.cjs --formal` |

## 2. DeepSeek 便携版发布与 GitHub Release 校验

| 脚本 | 用途 | 调用方 / 验证状态 |
|---|---|---|
| `build-deepseek-portable-release.py` | 从干净基包构建正式/候选 DeepSeek 便携 ZIP（排除受限素材、接线单次提醒、注入 `DSH_HOME`、生成 `release-tag.json`） | 正式发版流程 / `tests/test_portable_release_builder.py` |
| `build-deepseek-portable-reminder.py` | 提供便携版提醒 `BOOT` 注入片段、安全 ZIP 条目读取与 `PORTABLE-README.md` 模板 | 被 `build-deepseek-portable-release.py` 导入 |
| `build-deepseek-portable-fix.py` | 首启配置隔离、独立停止与字体便携修复包构建器 | 候选便携基包制作 |
| `check-release-assets.py` | 扫描双宠发布 ZIP 的逐文件许可与隐私合规性 | 发版前必跑（见 `docs/仓库同步与便携版发布.md`） |
| `write-sha256sums.py` | 生成纯 ASCII（无 UTF-8 BOM）的 `SHA256SUMS.txt` | 发版前必跑 / `tests/test_portable_release_builder.py` |
| `verify-github-release.py` | 比对本地便携目录（`--portable-dir`）或分卷（`--parts`）与公开 GitHub Release 远端资产哈希与大小 | 发版上线后必跑 / `tests/test_portable_release_builder.py` |

## 3. 本机安装版安全部署与回滚（DeepSeek 维护安装）

| 脚本 | 用途 | 调用方 / 验证状态 |
|---|---|---|
| `build-manifest.cjs` | 刷新 `deployment.json`（支持传入 `v1.0.7` 等 Git tag 从历史清单生成 `previousSha256` 及 `previousRef`） | 发版前刷新清单 |
| `deployment-safety.cjs` | 安装前 preflight、回滚 preflight 与代码级隔离演练（`rehearse`） | `install.ps1` / `rollback.ps1` / `tests/deployment-safety.test.cjs` |
| `profile-deployment-safety.cjs` | 用户配置同步事务准备、应用与回滚保护 | `install.ps1` / `rollback.ps1` / `tests/profile-deployment-safety.test.cjs` |
| `media-deployment-safety.cjs` | 媒体素材部署事务准备、应用与回滚保护 | `install.ps1` / `rollback.ps1` / `tests/media-deployment-safety.test.cjs` |
| `assert-shared-runtime-idle.cjs` | 检查独立宿主进程是否空闲，防止运行中覆盖共享运行时 | `install.ps1` / `rollback.ps1` / `tests/shared-runtime-guard.test.cjs` |
| `install.ps1` / `rollback.ps1` | Windows 本机安装版事务升级与一键回滚脚本 | 本机升级维护 / `tests/install-rollback-scripts.test.cjs` |

## 4. 离线分卷分享包与冒烟辅助脚本（按需使用）

- **离线分卷包（Share / Offline）**：`build-share.py`、`split-share.py`、`validate-share.py`、`install-share.ps1`、`download-share.ps1`、`restore-offline.ps1`、`恢复安装.cmd`（由 `tests/test_share_package.py` 与 `tests/test_share_download.py` 覆盖）。
- **实机冒烟与诊断探针（Smoke / Probe）**：`smoke-electron.cjs`、`smoke-blue-drag.cjs`、`smoke-pet-form.cjs`、`smoke-pet-layer-order.cjs`、`voice-smoke.cjs`、`host-smoke.ps1`、`prepare-host-smoke.ps1`、`verify-electron-pet-layer.cjs`、`probe-gpt-drag-cost.ps1`、`probe-gpt-startup.ps1`、`probe-gpt-visibility-native.cjs`、`sample-pet-performance.ps1`。

## 5. 历史一次性归档脚本（One-off / Archived — 仅保留溯源，不再作为日常入口）

下列脚本为 2026-10 至 2026-11 期间特定批次素材迁移、动作接入或单次交付导出的历史一次性脚本，已完成使命，日常维护与发版**不再调用**：

- `build-pet-file-navigation.ps1`、`create-material-shortcuts.ps1`、`sync-pet-navigation-0.7.3.ps1`
- `curate-gpt-materials.py`、`integrate-gpt-material-library-20261028.py`、`organize-materials.py`
- `export-deliverables.py`、`export-gpt-optimization.cjs`、`export-update.py`、`package-recovery.py`、`final-check.ps1`、`install-deepseek-autostart.ps1`
- `prepare-gpt-drag-release.py`、`prepare-gpt-drag-responsive.py`、`prepare-gpt-gentle-takeoff.py`、`prepare-gpt-held-air-landing.py`、`prepare-gpt-idle-variety.cjs`、`prepare-gpt-physical-landing.py`、`prepare-gpt-six-materials.py`、`prepare-gpt-startup-fix.py`、`prepare-gpt-takeoff.py`、`prepare-walking-expression-approved.py`
- `record-gpt-review-20261028.py`、`review-gpt-electron.cjs`、`snapshot-gpt-optimization.cjs`、`summarize-gpt-review.cjs`
