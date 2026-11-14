# 基础版本说明（BASE）

本目录是《快乐数学练习屋》旧版（React 版 v2.0.0）的基础版本快照，
以 2026-11-14 建立，作为后续优化的起点。线上运行地址：
https://zucchini-art-production.up.railway.app

## 来源

- 源自本地副本 `~/workspace/math-practice-update/repo/`（2026-10-22 从旧版
  仓库复制，旧版仓库 gweview/- 现已无法访问，应为私有仓库）。
- 包含 2026-10-22 的 os-taxonomy 补题型改动：题型从 99 种增至 109 种
  （新增 10 种 + 单位换算扩展），构建与全部测试通过。
  详见 `~/workspace/math-practice-update/gap-analysis.md`。
- 注意：线上 zucchini 部署的是补题型之前的版本（99 种题型），本快照
  在其基础上多了上述补题型内容，排版与出题逻辑与线上版一致。
  手头没有不含补题型改动的原版代码。

## 技术栈

React 19 + TypeScript + Vite 6，纯前端，Dockerfile + Caddy 部署，
与线上 zucchini 服务的部署方式一致。

## 验证状态

- 2026-11-13 在原副本上验证：`npm run build` 成功（108 modules）。
- 2026-11-14 在本快照上复验：`npm run build` 成功，561/561 测试通过，
  git 工作区干净。

## 后续

- 本快照的 Git 初始提交即为 base；后续优化在此基础上分提交进行。
- 推送到 GitHub 需要用户新建空仓库并给现有 fine-grained PAT 加上
  该仓库的 Contents 读写权限，之后可通过 Git Data API 推送。
