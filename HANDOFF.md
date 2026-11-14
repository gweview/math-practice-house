# Math Worksheet 优化项目交接说明

> 交接时间：2026-09-05（UTC）
> 项目目录：`/srv/math-worksheet`
> 主计划：`OPTIMIZATION_PLAN.md`
> 当前状态：架构阶段 A、UI/UX、打印/答案页、99 个题型迁移、旧兼容架构清理、首批严格答案协议/golden、数学边界/性能/文档收尾，以及最终打印无障碍小修均已通过主代理复核；全量自动化、真实 PDF/布局矩阵和人工视觉验收均已通过。工作区改动尚未提交，Docker 8088 服务保持不动，主代理自有 8091 预览进程已停止。

## 1. 交接目标（已完成）

本文件记录 `OPTIMIZATION_PLAN.md` 全部优化已经达到以下目标，供后续模型或发布人员核对：

- UI、移动端体验、键盘操作和可访问性达到计划验收标准。
- 数学启蒙至小学六年级的题库、课程范围、难度和语义质量完整可靠。
- 每种题型拥有自包含的定义、生成、求解和独立校验能力。
- 删除旧题型适配层、中央分发和重复难度数据。
- 数学、数独、二元推算在屏幕和真实 PDF 中均无裁切、重叠、跨题拆页和空白尾页。
- 所有测试、构建、真实打印回归和人工截图检查通过。

不要只修到“测试绿色”。题库内容、SVG、页面顺序、PDF 页数和实际视觉输出都需要独立审查。

## 2. 用户的执行要求

此前用户明确要求：

1. 由使用 Luna model 的 subagent 执行改动。
2. 主代理负责逐批 review。
3. 一批 review 通过后，才能继续下一批实际改动。
4. 所有改动完成后进行全方位最终检验，尤其关注打印时题目跨页、裁切、重叠和空白尾页。

继续工作时应维持“subagent 实现 → 主代理静态审查 → 主代理独立运行验证 → 明确接受或退回”的流程。只读审计可以并行，实际修改应按审查批次串行。

不要创建 commit，除非用户另行要求。

## 3. 工作区注意事项

- 当前 worktree 很脏，所有已修改和未跟踪文件都是本次优化的一部分，不要使用 `git reset --hard`、`git checkout --` 或类似命令清理。
- 需要保留用户补充过 comment 的 `OPTIMIZATION_PLAN.md`。
- 没有已知需要丢弃的“无关改动”。遇到重叠时先阅读 diff，再局部处理。
- 旧进程可能占用 `8088`。最终浏览器验证请使用新的独立端口（建议 `8091` 或更高），只终止自己启动的进程。
- 迁移批次由 Luna subagent 分段执行；主代理在每批结束后静态审查并独立运行测试后才接受。

## 4. 已经完成并通过主审的内容

### 4.1 应用壳层与会话基础

已经建立并验收：

- `src/app/AppShell.tsx`
- `src/app/ModeNavigation.tsx`
- `src/app/PrintController.ts`
- 版本化 LocalStorage 与旧配置迁移。
- 通用 `useWorksheetSession`。
- 数学、数独、二元推算各自独立的配置和生成会话。
- 打印目标隔离与 `afterprint` 清理。
- 基础按钮类型、ARIA 和预览过期状态。

基础设施测试此前为 11/11 通过。

### 4.2 组卷、页数预算和打印 footprint

已经建立并通过主审：

- 显式 seeded `GenerationContext`。
- 题型注册表接线和失败关闭检查。
- `WorksheetBlueprint`、题型权重、排序和 page-target 模式。
- 保持题序的 footprint 分页。
- 结构化题、表格、应用题、行内题的共享 footprint resolver。
- 横向/纵向、标准/大字体、1/2 页目标矩阵测试。
- 混合 full-span/inline 排版的排列测试。
- compact answer key 的纯逻辑 100 题单页测试。

真实浏览器/PDF 的最终闭环已完成，见第 8 节的人工验收记录。

### 4.3 小学题库和结构化渲染

已经完成并通过主审：

- 启蒙至六年级的大量新增题型。
- 精确 `Fraction`、定点 `Decimal` 和课程常量（默认 `π≈3.14`）。
- 数轴、钟表、分数图、几何、表格、图表、pictograph、多小问等结构化内容。
- 内容与 operands/metadata 的篡改校验。
- 正方体展开图共享 cells 与 BFS 法向传播折叠判定。
- 扇形 SVG 端点和 large-arc 修复。
- 饼图/多序列图的黑白纹理和组件实例唯一 pattern ID。
- 题目态图形不通过 answer/correct 属性泄漏答案。

### 4.4 应用题质量

已经完成并通过主审：

- entity、容器、单位、动作与情境模板分离。
- 13 类数量关系语义，每类 8 个模板。
- 加减一步、未知量、相差、等组、平均分、包含除、连续加减、三步变化。
- 三年级以上恢复了 `×→+`、`×→-` 两步关系。
- preschool/grade1 不会生成乘除关系。
- 乘法两步受 `maxFactor` 和 `max` 约束，结果非负且不超过上限。
- 全部 semantic × template × entity 穷举检查，包含单位、重复句式、`undefined/NaN` 和不自然短语防护。

### 4.5 最近一次完整的已验证基线

数据题族迁移批次完成后，主代理独立运行了：

```bash
pnpm exec vitest run \
  tests/expanded-question-types.test.ts \
  tests/question-quality.test.ts \
  tests/question-visual-leak.test.ts \
  tests/registry.test.ts \
  tests/worksheet-v2.test.ts \
  tests/math-layout.test.ts
```

结果：B1 基础计算、B2 乘除法、B3 填空/竖式/单位/分数/周长、B4 高级计算、B5 早期概念/数感、B6 几何基础、B7 高级概念/数感、B8 几何高级、B9 数据与可能性、B10 应用题、B11 旧兼容架构清理、B12 首批严格答案协议/golden、B13 数学边界/性能/文档收尾，以及最终打印无障碍小修均已通过独立回归，当前基线为 29 个文件、545 项测试。B1 专项覆盖 16 个题型，B2 覆盖 7 个题型，B3 覆盖 9 个题型，B4 覆盖 7 个题型，B5 覆盖 10 个题型，B6 覆盖 13 个题型，B7 覆盖 10 个题型，B8 覆盖 9 个题型，B9 覆盖 10 个题型，B10 覆盖 8 个题型；其中 `fractionComparison` 已在 B3 迁移。B12 新增 `AnswerProtocol` 纯 domain 协议、解析/语义比较/legacy 转换和五类内容的独立手算 golden，首批在基础算术表达式与 `addition10` 接入并覆盖篡改和 malformed answer 不抛错。B13 补齐 Fraction/Decimal/单位换算边界、显式 π 常量检查、5 次核心生成性能基线（100 题最慢样本约 1.8ms，计时不含浏览器/Vite）及 README 架构/课程/答案页/打印/隐私说明。最终打印小修新增 `.skip-link` 的 print 隐藏规则和回归测试，避免焦点态无障碍链接出现在纸张顶部。概念题族、几何题族、数据题族和应用题族已全部迁移。应用题、旧架构清理、答案协议、B13 及最终小修后又独立通过 smoke；完整 layout、数独和二元推算 PDF/移动端矩阵也通过（100 题、PDF 页数、移动端、无控制台/请求错误）。

同时以下检查均通过：

```bash
git diff --check
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
```

当前工作区可构建，架构阶段 A、B11 旧兼容架构清理、B12 首批答案协议、B13 数学/性能/文档收尾及最终打印小修均已通过；最终视觉人工验收、发布前命令和自有 8091 进程收口均已完成。

## 5. 已完成架构阶段 A 与基础批次

### 5.1 已验收内容

以下内容已由主代理静态审查并通过独立测试：

- 从 `src/core/types.ts` 下沉类型到：
  - `src/domain/questions/problem-type.ts`
  - `src/domain/questions/model.ts`
  - `src/domain/questions/contracts.ts`
  - `src/domain/worksheet/config.ts`
- 新增 `src/domain/questions/groups.ts`、`coverage.ts`、题型 manifest 和显式 seeded context。
- 将 `src/domain/questions/registry.ts` 改成组合五类 manifest，并完成 99 个题型的完整性检查。
- 抽离 AppShell、会话状态、版本化存储、公共 UI、纸张 footprint 分页及 compact/detailed 答案页。
- 迁移 `addition10` 至 `mixedFour` 共 16 个基础计算题型到 `src/question-types/calculation/basic.ts`，并从旧 handler map 删除对应项。
- 迁移 `multiplication` 至 `mixedMulDiv` 共 7 个乘除法题型到 `src/question-types/calculation/multiplication.ts`，并从旧 handler map 删除对应项。
- 迁移 `fillBlank`、`multiplicationBlank`、4 种竖式题型，以及 `unitConversion`、`fractionComparison`、`perimeter` 到 `src/question-types/calculation/fill-vertical.ts` 与 `src/question-types/calculation/unit-fraction.ts`，并从旧 handler map 删除对应项。
- 迁移 `rounding`、`decimalOperation`、`fractionOperation`、`simpleEquation`、`percent`、`makeTarget`、`operationErrorDiagnosis` 到 `src/question-types/calculation/advanced.ts`，从 `expanded.ts` 生成器映射删除对应项，并保留兼容答案分支至最终清理。
- 迁移 `numberRecognition`、`comparison`、`compareSigns`、`numberSequence`、`numberComposition`、`placeValue`、`numberLine`、`numberPattern`、`arithmeticFamily`、`estimation` 到 `src/question-types/concept/number-sense.ts`，从 `legacy-handlers.ts` 和 `expanded.ts` 生成器映射删除对应项。
- 迁移 `clockReading`、`elapsedTime`、`shapeRecognition`、`area`、`angleClassification`、`lineRaySegment`、`angleMeasurement`、`triangleQuadrilateralClassification`、`translationRotation`、`directionRoute`、`shapeClassification`、`countShapes`、`axisSymmetry` 到 `src/question-types/geometry-measurement/foundation.ts`，从 `expanded.ts` 生成器映射删除对应项，并增加操作数数量、题型、难度档案、图形/时间编码和面积正方形不变量校验。
- 迁移 `largeNumberPlaceValue`、`operationLaw`、`decimalComparison`、`factorsMultiples`、`ratio`、`negativeNumber`、`calendarWeekday`、`fractionVisual`、`primeComposite`、`commonFactorsMultiples` 到 `src/question-types/concept/advanced.ts`，在 manifest 中直接绑定，删除 `expanded.ts`/旧 handler map 的生成映射；validator 深比较题面、布局、签名、metadata、结构化内容和答案详情，并覆盖 malformed/extra operands。
- 迁移 `polygonArea`、`cuboidVolume`、`compositeArea`、`cuboidNet`、`surfaceArea`、`circle`、`scale`、`sector`、`cylinder` 到 `src/question-types/geometry-measurement/advanced.ts`，在 geometry manifest 中直接绑定，删除 `expanded.ts`/旧 handler map 的生成映射；validator 独立计算 Fraction/Decimal 答案，固定使用课程 `π=3.14`，并深比较题面、布局、签名、metadata、结构化几何内容和答案详情，覆盖拓扑、范围、难度、篡改及 malformed/extra operands。
- 迁移 `dataTableReading`、`barChartReading`、`average`、`lineChartReading`、`probability`、`chartAnalysis`、`quantityEstimate`、`pictureClassification`、`pieChartReading`、`multiChartAnalysis` 到 `src/question-types/data/foundation.ts`，在 data manifest 中直接绑定，删除 `expanded.ts`/旧 handler map 的生成映射；validator 独立求解并深比较表格、图表、pictograph、metadata、答案详情和结构字段，覆盖答案/题面/布局/签名/operators/额外字段/NaN/extra operands、年级门槛及课程范围。
- 迁移 `wordProblem`、`moneyCalculation`、`priceQuantityTotal`、`proportionalReasoning`、`discount`、`inverseProportion`、`concentration`、`budgetPlan` 到 `src/question-types/application/foundation.ts`，在 application manifest 中直接绑定，删除 `expanded.ts`/旧 handler map 的生成映射；validator 按数量关系、货币/单位、步骤、课程年级、结果范围独立求解并深比较题面、metadata、结构化内容和答案详情，覆盖语义/模板索引、篡改、wrong type、malformed/extra operands、NaN 及边界配置。
- B11 清理旧运行时兼容层：删除 `src/question-types/expanded.ts`、`legacy-handlers.ts`、`legacy-validator.ts`，移除 `generateLegacyOne`、legacy ID counter、中央旧生成/校验 fallback、`GENERATORS`/`expectedExpandedAnswer` 等死代码；所有 99 个题型通过 registry 直接绑定 definition，manifest 使用普通共享 metadata/profile 工厂，补齐 registry 与 malformed/NaN/extra operands 边界测试。
- B12 建立 `src/domain/questions/answers.ts` 严格 `AnswerProtocol`：整数、定点小数、最简分数/假分数/带分数、百分数、比、比较符号、文字、带单位、多问和可选步骤；提供安全 parser、完整 envelope 比较及 legacy scalar adapter。`Question.answer` 和旧 `answerDetails` 暂时保留，基础表达式族与 `addition10` 首批写入 protocol；新增五类内容的独立手算 golden，以及 value/display/extra-field/malformed answer 篡改测试。
- B13 完成数学内核和收尾：限制并测试 Decimal 外部/中间精度与负数 half-up 舍入，覆盖 Fraction 负带分数、负分母、约分及形式边界；单位换算对极小/非法 max 安全兜底；π 计算统一使用 `DEFAULT_PI`（`Math.PI` 仅用于 SVG 弧度转换并有注释）；新增 `tests/performance-baseline.test.ts`，预热后 5 次测量 `generateWorksheet` 的 100 道普通题，稳定预算 500ms；README 已同步六年级、99 题型、五类内容、实际目录、答案模式、打印矩阵和隐私定位。

### 5.2 当前迁移边界

工作区已通过 lint、TypeScript、生产构建、安全检查、差异检查、全量 Vitest 和 smoke/layout/sudoku/binary E2E。B1～B13 及最终打印无障碍小修均已接受；旧题型运行时兼容层已经删除，首批答案协议、数学边界、性能基线和文档已建立。最终人工截图/PDF 复核与发布前收口也已完成；不要使用破坏性清理命令。

### 5.3 阶段 A 的验收结果

以下项目已经完成并验收：

1. 五个 manifest 文件存在并包含全部题型，每题只出现一次。
2. `registry.ts` 只组合 manifests、构建 map、暴露查询和完整性检查，不再包含逐题元数据数组。
3. `QuestionDefinition` 明确包含五类 `contentCategory`：
   - `calculation`
   - `concept`
   - `geometry-measurement`
   - `data`
   - `application`
4. `contentCategory` 与四类 `CurriculumDomain` 并存，语义不能混为一谈。
5. 每项 definition 必须显式绑定 generate/validate；helper 不得静默注入运行时 fallback。
6. 将 `core/difficulty-config.ts` 的 `TYPE_MAX` 和 `legacy-validator.ts` 的第二份 `TYPE_MAX` 合并为 definition/profile 单一数据源。
7. 新增 `domain/questions/difficulty.ts` resolver；`core/difficulty-config.ts` 只作为兼容 facade。
8. 新增 `coverage.ts`，提供按年级和五类内容查询/断言。
9. comprehensive preset 与 blueprint 按五个 `contentCategory` 平衡，不再只按四个 curriculum domain。
10. 建立独立 `REQUIRED_CORE_TYPES` fixture，覆盖 preschool、grade1～grade6 × 五类内容；不能只用 registry 对自身断言。
11. 每个年级五类内容都同时具有 allowed 和 recommended 代表题型。
12. 增加 dependency-boundary 与 definition-contract 测试，禁止题型模块反向依赖 registry/core generate/core validators/core difficulty。
13. 阶段 A 不删除 `legacy-handlers.ts`、`legacy-validator.ts`、`expanded.ts`；它们在阶段 B/C 迁移。
14. 全量 test、lint、tsc、build 通过。

## 6. 架构阶段 A 之后已完成的工作

### 6.1 阶段 B/C：题型迁移与旧运行时清理（已完成）

B1～B10 已将全部 99 个题型迁入按题族组织的自包含模块；B11 又删除了：

```text
src/question-types/legacy-handlers.ts
src/question-types/legacy-validator.ts
src/question-types/expanded.ts
generateLegacyQuestion
validateLegacyQuestion
generateLegacyOne
LEGACY_GENERATORS
legacyIdCounter
createLegacyId
TYPE_MAX
GENERATORS
expectedExpandedAnswer
```

`core/difficulty-config.ts`、`core/grade-config.ts` 仍可作为薄兼容入口，实际难度与课程上限由 definition/domain 提供。以下检查当前无运行时命中（存储迁移语义中的 `legacy` 字样可以保留）：

```bash
rg -n "legacy-handlers|legacy-validator|generateLegacy|validateLegacy|TYPE_MAX|GENERATORS|expectedExpandedAnswer" src
```

每个题型仍通过 registry 直接提供 generate/validate，ID 使用注入的 `QuestionGenerationInput.createId`；registry、wrong type、malformed、NaN、extra operands 和全部 99 题型回归均已通过。

### 6.2 独立答案协议与 golden fixtures（首批已完成）

B12 已新增 `src/domain/questions/answers.ts`，以纯 domain 类型表达整数、定点小数、普通/假/带分数、百分数、比、比较符号、文字、带单位、多问组合和可选分步过程，并提供：

- 安全 `parseAnswer` / `parseAnswerProtocol`，拒绝未知字段、非法分母、错误 display 和 malformed nested value。
- 基于 Fraction/Decimal 的跨表示语义比较，以及带单位、多问和步骤结果的完整 envelope 比较。
- `fromLegacyAnswer` / `fromLegacyParts` 适配器，迁移期间保留 `Question.answer` 与旧 `answerDetails`。
- 基础算术表达式族和 `addition10` 的首批 protocol 接入；validator 对协议 value、display、compact、steps 和 malformed legacy answer 做异常隔离。
- calculation、concept、geometry、data、application 五类各一组独立手算 golden；generator 与 validator 的算术断言分开书写。

后续若要全面替换旧 scalar，应按题族小批次接入并保持兼容字段，不能一次性修改所有渲染器。当前协议批次已接受。

### 6.3 数学内核、性能与文档收尾（已完成）

B13 已完成并由主代理独立复核：

- `Fraction.parse` 和 `Fraction` 构造覆盖负带分数、零/负分母、约分及真/假/带分数边界。
- `Decimal` 采用公开 scale ≤30、有限中间 scale 的精度策略，覆盖负数 half-up、负除数、非法精度和最大精度后的继续运算。
- 单位换算在 profile 或直接调用传入极小、NaN、Infinity 范围时保持 total，不从空候选数组取值。
- 题目 solver/validator 的 π 计算统一使用 `DEFAULT_PI=3.14`；`QuestionVisual.tsx` 中的 `Math.PI` 只负责 SVG 角度到弧度的几何转换。
- `tests/performance-baseline.test.ts` 预热后重复测量核心 `generateWorksheet`，100 道普通题 5 次最慢样本远低于 500ms；未把浏览器、Vite 或测试收集计入。
- README 已与实际代码同步，包含启蒙至六年级、99 题型、五类内容、目录、答案协议/双模答案页、打印矩阵、安全和隐私说明。

B13 已接受；最终视觉验收期间未发现数学内核或文档回归。

### 6.4 最终打印无障碍小修（已完成）

最终截图复核发现焦点态 skip link 可能出现在打印纸张顶部。Luna 在 `@media print` 中加入 `.skip-link{display:none!important}`，并新增 `tests/print-styles.test.ts` 作为回归保护。焦点态下的 print computed style 已确认 `display:none`，不会进入 PDF。

## 7. UI 与可访问性验收（已完成）

共享 UI 已建立并在三个模式复用，最终视觉回归已确认三种模式的一致性：

```text
Button.tsx
ChoiceGroup.tsx
ToggleField.tsx 或 Switch.tsx
FieldSection.tsx
StickyActionBar.tsx
PreviewStatus.tsx
PrintGuide.tsx
```

本批已完成的验收点：

1. 数独和二元推算生成后将焦点移动到预览标题（`tabIndex={-1}` 和 `.focus()`）。
2. 增加 skip link 和模式面板语义。
3. 将数独/二元推算的 `aria-live` 缩小到摘要和 stale 状态。
4. 三模式统一 stale/error/status、生成、重置、答案和打印按钮名称。
5. 三模式复用移动端 sticky action bar 和打印/PDF 指引。
6. 打印指引覆盖微信/QQ 内置浏览器、普通系统浏览器、A4、100%、关闭页眉页脚和避免二次缩放。
7. sticky bar 使用 `env(safe-area-inset-bottom)`，并补 forced-colors/reduced-motion 与高对比度样式。
8. 已完成 320、360、390、768、1440px 的 DOM/布局回归；关键数学题卡、结构化题/答案页和二元推算纸张已人工查看，无裁切、重叠或异常留白。

共享 UI 单测和统一 Playwright 可访问性/响应式断言已纳入现有测试；项目仍不引入不必要的运行时依赖。

## 8. 打印与真实 PDF：最终验收已完成

打印/布局 E2E 的已知失败已修复，并由主代理和 Luna agent 在独立端口完成回归。最新完整 layout、e2e-smoke、e2e-sudoku、e2e-binary-reasoning 及真实 PDF 页数/MediaBox 检查均通过；覆盖纵横向、标准/大字体、无答案/紧凑/详解、结构化题、竖式、320/360/390/768/1440px 视口，浏览器监控无 console/page/request/外部请求错误。主代理人工查看了混合题型练习页、结构化题页、详解答案页、二元推算纸张，以及焦点态 skip link 的打印截图；均无跨页、裁切、重叠、答案泄漏或空白尾页，且 skip link 已从打印输出隐藏。

### 8.1 已验收错误契约

`scripts/e2e-layout.mjs` 已将纯短表达式与结构化题分开检查，CSS 允许结构化题按需要换行。最终契约为：

- 纯短算式可验证 nowrap。
- structured、multiPart、table、chart、geometry、pictograph 可必要换行。
- 结构化题必须作为原子块整体换页，而不是通过 nowrap 强行压缩。

### 8.2 已完成的浏览器几何检查

脚本已针对每张 `.paper`、每个 `.question` 及其 SVG/table/visual descendant 检查：

- bounding box 完全位于所属纸张安全区。
- `scrollWidth <= clientWidth`、`scrollHeight <= clientHeight`。
- 题卡之间没有 pairwise overlap。
- 题干与图形没有分离到不同物理页。
- 没有因 `.paper { overflow: hidden }` 而静默裁掉内容。
- 问题顺序和题号保持一致。

### 8.3 最终打印矩阵（已覆盖）

至少覆盖：

```text
orientation: portrait / landscape
font: standard / large
answerMode: none / compact / detailed
renderKind: expression / equation / choice / word / clock / geometry /
            table / chart / multiPart / pictograph / numberLine
ordering: random / grouped / progressive
page target: 1 / 2
viewport: 320 / 360 / 390 / 768 / 1440
```

### 8.4 真实 PDF 验收记录

- PDF 页数等于屏幕物理纸张数。
- MediaBox 宽高符合 A4 和所选方向。
- 没有空白尾页。
- compact 模式 100 道短标量答案为一张 A4。
- detailed 模式复杂答案按实际空间分页且不裁切。
- 每页存在预期有效内容，最后一页不能只有空框或装饰。
- 数学、数独、二元推算只能打印当前目标模式。
- `afterprint` 后 `body.dataset.printTarget` 被清除。

### 8.5 监控和答案泄漏验收

Playwright 统一监控：

- console error。
- pageerror。
- requestfailed。
- 非预期非 2xx response。
- 任何外部网络请求。

题目态需要枚举所有 renderKind，检查可见文本、SVG、`aria-label`、`title`、`data-*`，确保不存在 final answer 或 answer/correct 语义泄漏。图表中作为题设的数据不应被误判为答案。

## 9. 数学内核、性能和文档收尾（已完成）

B13 已覆盖并通过独立测试：

- `Fraction.parse('-0 1/2')`、分母为零/负分母、约分、假分数/带分数互换。
- Decimal 舍入、负除数、货币/单位换算边界和最大公开 scale。
- 所有 π solver/validator 使用课程档案默认 `DEFAULT_PI=3.14`；仅 SVG 几何角度换算保留 `Math.PI`。
- 100 道普通数学题核心生成的 5 次性能样本最慢约 1.8ms，稳定低于 500ms。
- README、实际目录、课程覆盖、答案页、打印说明和隐私定位已同步。
- `OPTIMIZATION_PLAN.md` 已在全部人工视觉检查完成后更新为“实施完成”。

## 10. 最终收口记录

最终收口已按以下顺序完成：

1. 保留 Docker 的 8088 服务，停止主代理自行启动的 8091 预览进程。
2. 执行最终全量 unit/e2e/PDF、截图和安全验收；人工查看关键横向/纵向、标准/大字体、compact/detailed 页面。
3. 更新 `OPTIMIZATION_PLAN.md` 状态并准备交付；不创建 commit。

不要在架构半成品尚未恢复编译时开始 UI 或打印改动。

## 11. 验证记录与后续变更规则

题型或架构批次至少运行：

```bash
git diff --check
pnpm exec vitest run \
  tests/generators.test.ts \
  tests/expanded-question-types.test.ts \
  tests/question-quality.test.ts \
  tests/question-visual-leak.test.ts \
  tests/registry.test.ts \
  tests/worksheet-v2.test.ts \
  tests/math-layout.test.ts \
  tests/math-core.test.ts
pnpm lint
pnpm exec tsc -b --pretty false
pnpm build
```

阶段完成后运行全量：

```bash
pnpm test
pnpm test:e2e
pnpm test:layout
pnpm test:sudoku-layout
pnpm test:binary-reasoning-layout
```

最终验收还必须使用新的本地端口启动生产或预览服务，生成真实 PDF，并人工查看关键横向/纵向、标准/大字体、compact/detailed 截图。不能只依赖 DOM 模型测试。

## 12. 如需后续模型接手

请先执行以下任务，不要同时展开 UI 或打印：

> 阅读完整 `OPTIMIZATION_PLAN.md` 和本文件。当前实现已完成 B1～B13、最终打印无障碍小修及发布前验收；不要重新开启已完成批次或创建 commit。若后续发现新的明确缺陷，仍须另开 Luna 小批次，主代理先静态 review、再独立测试；否则可直接基于当前工作区提交/发布。

本项目的计划批次和最终验收均已完成；后续如有新增需求，应另立变更批次，不要把当前工作区当作已提交版本。
