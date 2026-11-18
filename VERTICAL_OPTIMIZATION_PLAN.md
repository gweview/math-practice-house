# 竖式计算优化方案：难度细化与出题优化

> 状态：已实施（2026-11-18），6 个提交 ff4b657..4fd9f8b（HEAD 4fd9f8b），654/654 测试通过、构建通过、lint 0 warning。
> 决策背景：2026-11-18 用户决定不做竖式计算独立 tab（不新增 `StudioMode`），优先把难度系数与出题优化做好。本方案只动现有竖式链路（`practiceMode` 模式内），不改变三 tab 结构。自定义出题（约束式）由本方案解锁，但不在本次实施范围内。

## 1. 现状诊断（代码实测）

| 问题 | 证据 | 影响 |
| --- | --- | --- |
| 生成全靠拒绝采样 | `src/core/generators/vertical.ts`：4 个生成器每题最多试 2000–4000 次；`generateVerticalQuestions` 外层去重又套 4000 次 | 最坏上千万次尝试；约束越紧越慢，且失败时抛错 |
| 约束采样器已存在但竖式没接 | `src/core/generators/sampling.ts` 只有 `arithmetic.ts`、`basic.ts`、`multiplication.ts` 在用 | 同类问题两套解法；竖式享受不到“枚举可行集、均匀抽取、无解返回 null”的语义 |
| 整张卷子只用一个难度档案 | `src/core/generate.ts:220-227` 注释写明：取第一个运算的 profile 代表全卷；4 个竖式题型共用 `difficultyProfiles(1000, { minimumMax: 20 })`（`manifests/calculation.ts:60-63`） | 加法和除法同卷共用同一个 max，无法分运算调难度 |
| 难度派生只有三个输入 | `resolveVerticalParameters` 只读 `max`、`carryRate`、`highRangeRate`；`complexTier = carryRate >= .75` | 位数模式、进位次数、余数策略都没有独立旋钮 |
| 难度分对竖式基本失效 | `scoreQuestionDifficulty`：步数、逆向两项对竖式恒为 0，进退位是二值，`regroupingCount` 被忽略；四项权重和为 1.15 再 clamp | 两位数不进位与四位数连续进位，分差只剩数字大小 |
| Phase C 混合难度对竖式卷不生效 | `generate.ts` 里竖式分支直接 return，不走 blueprint；builder 里分层递进开关只在 `standard` 显示 | 竖式卷只能一张卷子一个难度 |
| 进退位计数三处重复 | `vertical.ts` 的 `regroupingCountFor*` 与 `fill-vertical.ts` 校验器的 `regroupingAdd/Sub/Mul` 同逻辑两套实现 | 改一边漏一边，生成与校验打架 |
| 单题路径不尊重专项模式 | `generateVerticalQuestion` 不传 `verticalSubtractionMode` / `verticalMultiplicationMode` / `verticalDivisionMode`，永远 mixed | registry 单题路径与整卷路径行为不一致 |
| 乘法候选数组在循环内重建 | `generateVerticalMultiplication` 的 `simpleCandidates`（102 个数）在 3000 次循环内每次重建并过滤 | 无谓的重复计算 |
| 配额逻辑三分支重复 | `buildPageEntries` 三个分支里余数率计算重复两次 | 改配额规则要改三处 |
| 文档漂移 | `DIFFICULTY_MODEL.md` §3 公式漏了 Phase C 加的逆向项 | 文档与代码不一致 |

不在本次范围（但顺手可修）：`computeLongDivisionSteps` 从 `MathWorkbook.tsx` 导出导致 1 个 lint warning；`VERTICAL_PAGE_SIZE = 8` 写死不可调。

## 2. 出题优化（Part A）

### A1. 竖式采样器：拒绝采样 → 约束构造

在 `sampling.ts` 模式上扩展竖式专用采样器，全部“枚举可行集、均匀抽取、无解返回 null”：

- `sampleAddendPairWithRegrouping(sum, regroupingCount, { consecutive })`：指定进位次数（0/1/2），可要求连续进位。
- `sampleSubtrahendWithBorrows(minuend, borrowCount, { acrossZero })`：指定退位次数，可要求隔位退位（含 0 模式）。
- `sampleMultiplicationPair(digitsA, digitsB, carryCount)`：指定位数模式与进位次数。
- 除法保持现有的“先定商与余数、反推被除数”构造法（已是构造式），只做统一：抽成 `sampleDivision(quotientDigits, divisorDigits, { remainder, zeroQuotient })`。

调用方 fallback 链（代替抛错）：精确约束无解 → 放宽一档（如连续进位→任意进位、2 次→1 次）→ 仍无解才抛错，并带上“哪个约束不可行”的信息。fallback 次数有界（≤3 次），且记录在题目 `metadata` 里备查（只读字段，不进校验比对）。

### A2. 消除嵌套重试与去重耦合

- `generateVerticalQuestions` 的去重循环改用 Phase B 的同构签名（`deduplication.ts` 的 canonical signature），换序同一题也算重复；尝试次数上限与“允许重复”开关解耦：达到上限时返回已生成题目并附注“未能凑满不重复题数”，而不是抛错丢弃整卷。
- 采样器返回 null 时不计入去重尝试，避免无解约束烧掉全部重试预算。

### A3. 进退位计数单一来源

- 三个计数函数收敛到一处（`sampling.ts` 或 `domain/math-core/` 新模块），`vertical.ts` 与 `fill-vertical.ts` 校验器同 import 一份。计数语义以校验器现有实现为准（已跑通 610 个测试），生成器侧对齐。
- 校验器里 `a % 10 === 0` 之类格式排除规则保持不动（只收敛计数函数，不动格式规则）。

### A4. 小修复打包

- 乘法 `simpleCandidates` 按因数预计算一次（`Map<factor, candidates>`），移出 attempt 循环。
- `buildPageEntries` 三分支合并为统一配额函数：输入各运算 slot 列表 + 配额表（complex 数、remainder 数），输出带指令的 entries；余数率只算一次。
- `generateVerticalQuestion` 透传 `config` 的三个专项模式（签名改为接收 `WorksheetConfig` 或三个 mode 参数），与整卷路径一致。

## 3. 难度细化（Part B）

### B1. 分运算难度档案

- `manifests/calculation.ts`：4 个竖式题型不再共用 `difficultyProfiles(1000)`，各声明自己的档案（`max` 与比例参数按运算区分，复用 Phase C 修好的自定义 `max` 解析）。
- `generate.ts` 竖式分支：按运算分别解析 profile（`getProblemProfile` 每个运算一次），`generateVerticalQuestions` 接收 `Record<VerticalOperation, ProblemProfile>`；`resolveVerticalParameters` 改为按运算解析，返回分运算参数集。
- `VerticalParameters` 扩展字段（向后兼容，现有 mode 映射为字段值）：

| 字段 | 含义 |
| --- | --- |
| `digitPattern` | 位数模式，如加法 `2+2` / `3+2` / `3+3`，乘法 `2×1` / `3×1` / `2×2`，除法商位数 + 除数位数 |
| `regroupingTarget` | 进退位次数目标：`0` / `1` / `2` / `2+`，及 `consecutive` 是否要求连续 |
| `remainderPolicy` | 除法：`exact` / `mixed` / `remainder` + 余数率 |
| `zeroQuotientRate` | 商含 0 占比（0 表示不出现，与现有 mixed 行为一致） |
| `acrossZeroRate` | 隔位退位占比（减法） |

- 现有三个专项 mode（`verticalDivisionMode` 等）保留为 UI 快捷开关，内部映射为上述字段的预设组合，不删除、不改名，避免破坏已保存配置（`normalizeStoredWorksheetConfig` 仍识别）。

### B2. 建议的分运算难度表（初版数值，实施时以测试校准）

| 档位 | 加法 | 减法 | 乘法 | 除法 |
| --- | --- | --- | --- | --- |
| 入门 entry | 2+2，无进位 | 2-2，无退位 | 2×1，无进位 | 两位数÷一位数，整除 |
| 简单 easy | 2+2，至多 1 次进位 | 2-2，至多 1 次退位 | 2×1，至多 1 次进位 | 整除为主，少量余数 |
| 标准 standard | 2+2 / 3+2，1 次进位为主 | 3-2 / 3-3，1 次退位 | 2×1 / 3×1，进位 | 整除/余数混合 |
| 提高 advanced | 3+3，1–2 次进位 | 3-3，1–2 次退位，含隔位退位 | 3×1，多次进位 | 商含 0，较大商 |
| 挑战 challenge | 3+3 / 4+3，2 次以上或连续进位 | 3-3 / 4-3，连续退位/隔位退位 | 2×2，部分积 | 除数两位数，商含 0 + 余数 |

年级门控优先于一切档案（现有 `grade-config.ts` 规则不变）：低年级不出乘除、高年级专项。

### B3. 难度分：竖式专用计分

`scoreQuestionDifficulty` 增加竖式分支（题目 `layout` 为 `vertical` / `longDivision` 时），四项权重和为 1：

```
0.35 × 位数分（最大操作数位数 / 档案最大位数，上限 1）
+ 0.35 × 进退位分（regroupingCount / 2，上限 1；除法用余数与商含 0 折算：余数 0.5，商含 0 0.5）
+ 0.15 × 模式分（部分积行 / 隔位退位 / 两位数除数出现计 1，否则 0）
+ 0.15 × 数字大小比（现有 magnitude ratio）
```

- 分数仍是纯函数、不存进题目对象（现有约定不变，side map 传递）。
- 通用公式权重和 1.15 的问题一并修正：四项归一化为 0.45 / 0.30 / 0.125 / 0.125（保持原相对比例），或在文档中明确 clamp 语义；二选一，实施时定。
- `DIFFICULTY_MODEL.md` §3 同步更新：补逆向项、补竖式分支公式。

### B4. 卷内混合难度

- `buildPageEntries` 接受按 slot 的档位分配：`difficultyDistribution`（Phase C 已有）映射为每页内各档位的题数配额，`progressive` 排序复用 B3 的竖式难度分。
- Builder：分层递进开关对竖式模式开放（现在只在 `standard` 显示），文案改为竖式档位说明（如“三位数+三位数，连续进位”），`VERTICAL_DIFFICULTY_HINTS` 改为按运算+档位生成的实际说明，不再是固定五句。
- `typeDifficulties` 对竖式题型暂不接入（竖式题型进不了 standard 混合卷，见 §1 校验器限制），留待后续。

## 4. 实施顺序与验收

| 步骤 | 内容 | 验收 |
| --- | --- | --- |
| 1 | A3 计数收敛 + A4 小修复（采样器扩展除外） | 610+ 测试全绿；行为零变化（同 seed 同输出） |
| 2 | A1 采样器扩展 + A2 去重/重试改造 | 新增测试：精确进位次数、无解 fallback、去重同构；性能基线：5 页竖式卷生成耗时对比（`performance-baseline.test.ts`） |
| 3 | B1 分运算档案 + `generate.ts` 分支改造 | 新增测试：每运算档案解析、mode→字段映射、已保存配置兼容 |
| 4 | B3 难度分竖式分支 + 文档同步 | 新增测试：同档位内难度分单调性（进位多 > 进位少、位数多 > 位数少）；`DIFFICULTY_MODEL.md` 与代码一致 |
| 5 | B4 卷内混合难度 + Builder 开关与文案 | 新增测试：配额精确到题、progressive 排序按竖式分；界面手动验收 |
| 6（可选） | `computeLongDivisionSteps` 移纯模块，消 lint warning；`VERTICAL_PAGE_SIZE` 可配 | lint warning 归零；测试 import 更新（`math-layout.test.ts` 1 处） |

每步独立提交、可独立回滚；推 / 部署仍按现有约定（用户一句话才动）。

## 5. 兼容性说明

- **试卷复现编号**：生成器改动会改变同一 seed 下的题目流（Phase B 已有先例）。已生成的卷子用旧编号复现时会得到不同题目——属于预期变化，不阻塞；实施时在 CHANGELOG 里记一笔。
- **已保存配置**：三个专项 mode 字段保留，`normalizeStoredWorksheetConfig` 不用改；新字段只加不改，旧配置默认映射为现有行为。
- **测试基线**：当前 610/610（2026-11-15 验证）。步骤 1 要求零行为变化；步骤 2 起允许题目流变化，但全部现有校验器测试必须继续通过（只改生成侧，不改校验规则）。

## 6. 本方案解锁、但不在本次范围

- **约束式自定义出题**：A1 采样器 + B1 档案字段齐备后，自定义出题只剩一个 UI（选运算、位数模式、进退位要求、数量）+ 一次采样调用；自由输入算式（解析 `345+278` 这类文本）是再后一步。
- **竖式独立 tab**：用户已否决（2026-11-18），不做；如未来重启，本方案的采样器与档案层可直接平移。
- **题型扩展**：不新增题型（2026-11-14 方向不变）。
