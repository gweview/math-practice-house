# 生成器框架（Generator Framework）

本文档描述 Phase B 的三项生成器框架升级：公共带约束采样器、同构去重、竖式模式统一。与 `DIFFICULTY_MODEL.md`（Phase A，难度模型）互补：Phase A 定义“难度是什么”，本阶段解决“题目怎么生成、怎么去重、竖式怎么取难度参数”。

> 注：`DIFFICULTY_MODEL.md` §4 曾把“约束采样器”和“竖式统一”列为未做事项，本阶段已完成这两项（该文件按约定未改动，此处声明以本文档为准）。

## 1. 公共带约束采样器

位置：`src/core/generators/sampling.ts`。

### 设计：枚举可行集

采样器不做“随机猜 N 次、猜中为止”的重试，而是**枚举出满足约束的全部可行解、再均匀抽取一个**；可行集为空时返回 `null`，由调用方决定如何处理（换一个总数，或明确报错）。数值范围不超过 1000，枚举成本只有几千次谓词求值，正确性一目了然，且每个可行解被抽到的概率均等。

| 函数 | 作用 |
| --- | --- |
| `sampleAddendPair(sum, regrouping, random?, minOperand?)` | 枚举和为 `sum`、进位状态符合 `regrouping` 的加数对 |
| `sampleSubtrahend(minuend, regrouping, random?, minOperand?)` | 枚举被减数为 `minuend`、退位状态符合 `regrouping` 的减数 |
| `sampleProductTriple(minimum, maxFactor, max, random?)` | 枚举三个因子都在 `[minimum, maxFactor]` 内、乘积不超过 `max` 的三元组 |

进位/退位判定谓词 `hasAdditionRegrouping` / `hasSubtractionRegrouping` 也收进本模块（原在 `arithmetic.ts`，`arithmetic.ts` 重新导出，保持既有导入不断）。判定只看各位数字的原始和/差是否达到 10/小于 0——进位链必然始于某一位原始和达到 10，因此该判定与真实进位传播等价。

### 已迁移的生成器

| 生成器 | 旧行为 | 新行为 |
| --- | --- | --- |
| `generateAddition` / `generateSubtraction`（`arithmetic.ts`） | 50 次循环抽总数、300 次循环抽拆分，抽不到就退化成 `(9, sum-9)` 之类的简单题（可能违反进位要求） | 采样器直接抽拆分；对不存在合法拆分的总数（100 以下个位为 9 的和要求进位、10 的幂要求不进位）依次试 `S、S−1、S+1`，仍无解则明确报错 |
| `twoDigit` 进位/退位（`basic.ts`） | 300 次重试后无保护地最后调用一次，可能产出小于 10 的操作数（校验失败） | 从目标总数向外扫描最近的可行总数，采样器抽两位数拆分；无解则报错 |
| `generateMixedMulDiv`（`multiplication.ts`） | 200 次重试后退化成 `(minimum, minimum, minimum)` | 采样器直接抽因子三元组；无解则报错 |
| 竖式四个生成器（`vertical.ts`，2026-11-18 竖式优化步骤 2） | 每题 2000–4000 次拒绝采样，外层去重再套 4000 次 | 约束采样器直接构造：`sampleAddendPairWithRegrouping` / `sampleSubtrahendWithBorrows` / `sampleMultiplicationPair` / `sampleDivision`，带目标放宽链（精确目标 → 去连续要求 → 降进位次数，至多 3 次）；无解则报错并写明约束 |

正常配置下不再出现退化兜底题；不可能的配置（如范围太小）会大声报错，而不是静默产出不符合要求的题目。分布上有两处细微变化：100 以上个位为 9 的可行和（如 109）不再被重抽丢弃；不存在合法拆分的和会平移一位。没有测试依赖旧的总数分布。

### 故意没迁移的

- `grade3.ts` 分数比较的小循环：只是避免相等的小不等式循环，没有兜底，风险低。
- `generate.ts` 组卷器的去重循环：不是生成器重试循环（见第 2 项的高位松弛）。
- 数独/二进制推理等其他模式的循环：不在本次范围内。
- 除法/带余除法生成器：本就直接构造（除数 × 商 + 余数），不需要采样器。

（`vertical.ts` 的拒绝采样循环曾列在此处，已在 2026-11-18 竖式优化步骤 2 迁移到约束采样器；见上表。）

测试：`tests/generator-sampling.test.ts`（穷举小范围验证采样器“返回 null 当且仅当无解”、覆盖全部可行解、生成器约束满足性）。

## 2. 同构去重

去重键是题目的 `signature`。本阶段之前，签名按原样记录操作数顺序，`3+5` 与 `5+3` 会被当成两道不同的题同时出现在一张卷子上。现在：**交换律下只是换了顺序的同一道题，签名相同，算重复。**

### 什么算同构（签名归一化）

| 题型 | 归一化 |
| --- | --- |
| 加法（`buildArithmeticQuestion`，`+`） | 操作数排序：`addition100:3+5` |
| `chainAddition`（纯加法链） | 全部操作数排序 |
| `comparison`（圈出较大的数） | 两个数排序（展示顺序是随机打乱的） |
| 同分母分数加法 | 两个分子排序 |
| 乘法、`twoDigitByTwoMultiplication`、`verticalAddition` | 本就已归一化，保持不变（回归测试锁定） |

### 什么不算同构（保持顺序）

- **减法/除法**：顺序有意义，`8−3` 与 `3−8` 是不同的题。
- **填空题**：空的位置不同，考察内容不同。
- **应用题**：语义不同不算同构。
- **混合运算表达式**：即使某次实例全是加号，`mixedAddSub` 也不归一化（同一题型内表达式结构不同，排序会掩盖结构差异）。这是已知的有意局限。
- **角色不对等的乘法**（`multiDigitMultiplication`、`threeDigitByOneMultiplication`）与 **`repeatedAddition`**（加数/个数互换改变题意）：不归一化。
- **`compareSigns`**：答案依赖左右顺序，不归一化。

### 容量记账必须与归一化一致

`generate.ts` 的配额函数按“不同题目有多少种”来封顶配额，归一化后容量变小，记账必须同步改成**无序计数**，否则配额会要求超出实际容量的不重复题数、组卷报错：

- `regroupingQuota` 的 `addition10` 分支：内层循环从 `b = a` 起（进位容量 5）。
- `minimumTrivialQuota`：内层循环从 `b = a` 起（非平凡容量 25）。

`addition10` 的真实容量是 36 道（和不超过 10 的无序对），而不是旧签名的 66 道。原“一年级默认卷扩展到 100 道不重复题”测试改为 70 道（每种题型 35 道），是本次唯一因此改动的既有测试——50 道 `addition10` 只有把换序对算成两道题才装得下，正是本项要消除的重复。

### 高位偏好松弛

高位偏好（`highRange`）是分布塑形，不是硬配额。归一化后，小题型的高位子池可能小于配额（如 `addition10` 的平凡题在高位只有 5 种），slot 会永远抽不到新题、空转耗尽尝试预算。现在组卷循环里，单个 slot 连续 50 次失败后，该 slot 放弃高位偏好、改从全范围抽取；**进位/平凡/关系/结构配额永不松弛**。大容量题型几乎不可能触发松弛，分布统计测试不受影响。

测试：`tests/isomorphic-dedup.test.ts`（签名归一化、卷面无换序对、减法/比较符号保序、容量边界 36 成功 / 37 报错）。

## 3. 竖式模式统一

竖式（`src/core/generators/vertical.ts`）曾自带第二套难度系统：五张按 `Difficulty` 查的表/函数（每页复杂题数、余数率、数量级下限、乘法因子范围、除法上下限、加减法上限、最小操作数、要求进位数）。现在全部删除，改为**从注册表解析出的 `ProblemProfile` 纯函数推导**：

```ts
resolveVerticalParameters(profile: ProblemProfile): VerticalParameters
```

| 参数 | 推导公式 | 与旧表的对照（模板档位） |
| --- | --- | --- |
| `max`（加减法上限/最大被除数） | `profile.max` | 见下表 |
| `minOperand` | max ≤ 20 → 2；≤ 100 → 10；否则 `max(10, ⌊max/10⌋)` | 1000 档为 100，与旧表一致 |
| `magnitudeFloorFactor` | `.35 + .5 × highRangeRate` | .425/.5/.6/.7/.775（旧 .35/.5/.62/.72/.8，近似） |
| `complexPerPage` | `round(8 × carryRate)` | 0/2/4/6/7（旧 2/3/4/6/7） |
| `remainderRate` | `carryRate` | 0/.25/.5/.75/.9（旧 .875 的档位在 4/8 道除法下取整结果相同） |
| `factorMin` / `factorMax`（乘法因子兼除数范围） | `factorMax = min(9, maxFactor)`；`factorMin = max(2, factorMax − 4)` | 入门/简单与旧表一致；标准 [5,9]（旧 [3,9]）、提高 [5,9]（旧 [4,9]）、挑战 [5,9]（旧 [6,9]） |
| `minQuotient` | `max(10, min(20, round(max/20)))` | 10 为校验器下限，保留 |
| `doubleRegrouping`（复杂题要求两次进位） | `max ≥ 1000 且 carryRate ≥ .75` | 与旧“1000 以上 + 提高/挑战”一致 |
| `complexTier`（单题默认复杂） | `carryRate ≥ .75` | 与旧“提高/挑战”一致 |

`reverseRate` / `multiStepRate` 不接入竖式：竖式题是单步正向计算，没有可逆向或可连锁的结构，两个维度在此无意义。竖式题型也不声明 `directives`。

### 调用链

- `generateVerticalQuestions(config, profile, random)`：组卷器竖式分支用第一个竖式运算对应的题型（四种竖式题型共用 `difficultyProfiles(1000)`，解析结果相同）解析 profile 后传入。
- `generateVerticalQuestion(type, profile, random)`：注册表单题入口（`fill-vertical.ts`）直接传 `input.profile`；不再需要 `config` 参数（难度不再从 `config.difficulty` 取）。
- `vertical.ts` 不导入 `getProblemProfile`（会经注册表 → 清单 → `fill-vertical` 形成导入环），profile 由调用方解析后传入。

### 注册表档位下限

四种竖式题型的定义改为 `difficultyProfiles(1000, { minimumMax: 20 })`：竖式格式约束（操作数 ≥ 2、非整十、两数不同、有最小和）需要至少 20 的范围才有可用的不重复题池；一年级入门档缩放后的 max 只有 6，只能产出一道不同的加法题。把下限声明在注册表（唯一的难度系统）里，而不是竖式代码里。只影响一年级入门/简单档（6/11 → 20，与旧行为一致）；其他年级/档位不变。

### 有意的数值变化（与旧行为对照）

| 场景 | 旧上限 | 新上限（`profile.max`） |
| --- | --- | --- |
| 自由模式入门/简单（加减法） | 100 | 300 / 550（变难，与注册表一致） |
| 一年级课程模式入门/简单 | 20 | 20（下限托底，不变） |
| 二年级课程模式入门/简单 | 100 | 30 / 55（变易，与注册表缩放一致） |
| 三年级以上课程模式入门/简单 | 1000 | 300 / 550（变易，与注册表缩放一致） |
| 标准以上各档 | 1000 / 20 / 100 | 不变 |

每页复杂题数：入门 2 → 0、简单 3 → 2（跟随注册表 `carryRate`），其余档位不变。原配额测试的 `expectedComplex` 据此更新，是本次第二处既有测试改动。除数下限与除法上下限的浮动见上表，均在校验器允许范围内。

### 保留不变的

- 四个生成器的约束与报错行为：仍无退化兜底，无解时明确报错（2026-11-18 起改用约束采样器构造，见 §1；报错文案补充了约束信息）。
- 输出格式：题面、答案、操作数、运算符、签名、布局、`metadata` 结构全部不变（测试锁定）。
- 减法最小差值仍按 `max` 分段（≤20 → 2、≤100 → 10、否则 100），校验器的难度分段要求在各组合下均不严于生成器。
- `validateVertical` 未改动。

测试：`tests/vertical-unification.test.ts`（逐档位参数值、profile 驱动上下限的证明、配额精确性、输出格式、自由模式入门上限、年级下限托底、除法上下限）。

## 4. 约束与边界

- 不向题目对象加字段：难度分仍是纯函数（见 `DIFFICULTY_MODEL.md` §3），竖式参数也不存进题目。
- 去重仍按 `signature` 字符串比较，确定性不变（同一种子产出同一张卷子）。
- 本阶段不扩展题型（Phase C 再做内容灵活性：分题型难度档案、混合难度组卷）。
