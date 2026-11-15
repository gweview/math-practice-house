# 难度模型（Difficulty Model）

本文档描述 v2.0.0 之后的难度模型：难度档案新增的两个结构维度、配额指令协议，以及题目难度分。

## 1. 难度档案的两个新维度

`DifficultyProfile`（`src/domain/questions/contracts.ts`）在原有数值维度（范围、项数、进位率等）之外新增：

| 字段 | 含义 |
| --- | --- |
| `reverseRate` | 一套卷子里必须考察逆向思考（求未知起数/变化量、逆向填空）的题目占比 |
| `multiStepRate` | 一套卷子里必须用两步以上推理的题目占比，受 `wordSteps` 上限约束 |

两档模板（`manifests/_shared.ts` 的 `difficultyProfiles` 与 `application/foundation.ts` 的 `profile`）使用同一组取值：

| 档位 | reverseRate | multiStepRate |
| --- | --- | --- |
| 入门 entry | 0 | 0 |
| 简单 easy | 0.10 | 0.10 |
| 标准 standard | 0.25 | 0.30 |
| 提高 advanced | 0.35 | 0.50 |
| 挑战 challenge | 0.45 | 0.55 |

两个比例之和不超过 1：每个 slot 只取一种结构模式（逆向 / 多步 / 正向单步），剩余 slot 为正向单步。`wordSteps < 2` 的档位上多步占比不生效（该档位本身只出单步题），这部分 slot 回落为正向单步。

解析器（`resolveProblemProfile`）保证两个字段恒有值：定义缺省时取 FALLBACK（标准档取值）。

## 2. 配额指令协议

组卷器（`generateWorksheet`）按题型分配 slot 后，对声明支持指令的题型做**分类配额**：每个 slot 预先定好结构模式，再把指令传给生成器。指令字段（`GenerationDirective`）：

- `reverse: true` 强制逆向题，`false` 排除逆向题；
- `steps: 1` 强制单步题，`2` 强制恰好两步，`>= 3` 允许多步（含三步）。

题型通过定义中的 `directives` 字段显式加入（`QuestionDirectives`）：

```ts
directives: { reverse: true, multiStep: true }
```

加入即承诺：生成器必须遵守指令。未声明的题型收不到这两个字段，行为与旧版完全一致。

目前只有 `wordProblem` 加入：

- 逆向语义：`unknown-start`、`unknown-change`、`difference`；
- 多步语义：`groups-plus`、`groups-minus`、`add-then-subtract`、`subtract-then-add`、`three-step-change`；
- 两类语义目前没有交集，`reverse` 与 `steps` 同时出现时逆向优先；年级门控（低年级不出乘除/多步）优先于一切指令。

给新题型接指令时：在定义上加 `directives`，在生成器里按 `input.directive` 过滤候选池，无指令时保持原有行为，并在 `tests/difficulty-model.test.ts` 里补一条精确配额测试。

## 3. 题目难度分

`scoreQuestionDifficulty(question, profile)`（`src/domain/questions/difficulty-score.ts`）是纯函数，返回值 ∈ [0, 1]：

```
0.50 × 数字大小比（最大量值 / profile.max，上限 1）
+ 0.35 × 步数分（1 步 0，2 步 0.5，3 步以上 1）
+ 0.15 × 进退位（metadata.regrouping 为 true 时计 1）
```

难度分**不存进题目对象**：各题型的严格校验器会精确比对题目结构，存入的额外字段会导致复验失败。组卷器在生成时用 side map 暂存分数，供 `progressive`（渐难）排序使用；之后任何时候都可从题目 + 档案重新算出同一分数。

## 4. 本阶段改动与未做事项

已做：上述两个维度、分类配额、`wordProblem` 接入、难度分与渐难排序（原先只按数字大小排序）。测试：`tests/difficulty-model.test.ts`（12 个），全量 573 个测试通过。

未做（后续阶段）：其他题型接入指令（填空、比较类优先）、逆向多步复合语义、难度分持久化（需先放宽校验器）。

已在 Phase B（生成器框架升级）完成：竖式模式并入同一难度体系、基于约束的采样器。见 `GENERATOR_FRAMEWORK.md`。
