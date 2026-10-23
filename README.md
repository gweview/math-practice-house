# 数学练习屋 · 独立新版

一年级至三年级数学练习网站。按知识点、思维方式和难度组合练习；在线作答，或打印为A4练习单。

## 运行

需要 Node.js 22.12+（本机验证环境 Node 26）。

```bash
npm ci
npm run dev -- --port 4173
```

浏览器打开终端显示的地址。生产构建与本机预览：

```bash
npm test
npm run build
npm run preview -- --port 4173
```

`dist/` 可放到静态站点，不需要数据库、API Key或第三方在线字体。开发服务器只是本机/服务器进程，不代表已经配置公网域名或HTTPS。题库 JSON 会在构建时打入 dist/assets，部署时保留整个 dist 结构即可（包括子路径部署）。

## 功能
- 年级、学期、领域和知识点选择；查看先修点。
- 基础、填空、等量代换、规律、逆向、推理、应用：依具体知识点的模板能力提供，不声称所有组合都可用。
- 起步/进阶/挑战梯度、固定种子、去重与不足数量提示。
- 答案检查、分步提示、解析、本机错题重练。
- 打印版式与独立答案页，练习JSON导出。

项目设计和教学边界见 `docs/PRODUCT-DESIGN.md`，精确模板能力见 `docs/ENGINE.md`。

**当前覆盖边界：**108点均有来源基础题；其中36点增加参数化原创模板。挑战级支持32个算术知识点的两步题，以及二年级“简单的变化规律”和三年级“等量代换”；其他挑战组合明确提示不支持，不降级凑题。当前题目主要采用文字、算式和选择题；几何图示等专用可视化题型仍待扩展。

## 验证和样张

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run audit:data
```

后两项中，浏览器测试会自动启动并关闭测试服务器；数据核验需要Python3。额外的印刷页检查需要 `pypdf`，执行 `python tests/verify_pdf.py`；它读取由 `tests/production.browser.mjs` 生成的样张，生产浏览器测试默认要求4173端口运行构建预览。

`artifacts/` 中提供界面截图和一年级填空、二年级规律、三年级等量代换的PDF示例。每份示例包含1页学生卷和1页独立答案解析。完整验证摘要见 `docs/VERIFICATION.md`。

## 数据来源与许可

知识点、先修边及来源题目抽取自 [xiaoyang111222/cn-math-taxonomy](https://github.com/xiaoyang111222/cn-math-taxonomy)，固定修订 `1e9f3d278b90e5a5c36e832c340e262feff0ca78`。仅使用`cnm_`数学命名空间的一至三年级：108个知识点、153条先修边、432道原题。原项目没有被修改；本项目使用独立仓库 [gweview/math-practice-house](https://github.com/gweview/math-practice-house)。

上游数据按 **CC BY-NC 4.0（署名—非商业性使用）** 提供；完整许可位于 `data/LICENSE-CC-BY-NC-4.0.txt`，来源与修改说明位于 `data/provenance.json`。不要将数据当作无条件可商用素材；商业使用需另行取得授权。

上游明确声明为AI生成初稿、未经教师审核。新界面和程序测试不等同于人工教学审定。不承诺覆盖某教材所有知识点或提供专业能力诊断。

## 项目结构

- `data/`：筛选数据、许可、来源。
- `src/engine.js`：确定性出题和答案校验。
- `src/main.js`、`src/style.css`：交互和打印界面。
- `tests/`：数据、引擎、交互测试。
- `docs/`：产品设计与能力边界。

浏览器历史/错题存于本机localStorage，不跨设备同步，不需要填写儿童个人信息。备份或清理浏览器数据前请先导出需要的练习。
