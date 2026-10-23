# V2 出题引擎与模型

## API 分工

`src/engine.js` 保留 `DIMENSIONS`、`LEVELS`、`loadCatalog()`、`getCapabilities(topic)`、`generateWorksheet(catalog, options)`、`checkAnswer(question,value)`，新增候选池、容量与类型化评分接口。

- `generateCandidates(catalog, options)` 返回当前范围的候选、警告、种子与请求量；不承担最终教学分区。
- `getAvailability(catalog, options)` 核对当前维度与难度可用量。容量指确定性有界候选池，不是所有可能数学题的总数。
- `generateWorksheet` 是兼容旧调用的抽样入口。新界面使用 `src/planner.js` 的 `planWorksheet`：先定义教学槽位，再选题。
- `assessAnswer(question,value)` 返回 `correct / incorrect / partial / manual / unanswered` 与分小问结果。新界面必须用它，不能用旧 `checkAnswer` 的单一布尔值判断理由是否完成。

标准选项为 `{grade:1|2|3,semester:'all'|'上'|'下',topicId:'all'|id,dimensions:[...],level:1|2|3,count:6|12|18,seed:string}`。非法参数或悬空关联抛错；合法但缺题的组合明确警告，不暗换范围、重复或降级。

## 学生与教师数据分离

`src/question-model.js` 的 `createQuestion`、`toQuestionV2` 构造兼容旧题的模型。

- 旧字段 `id/topicId/topicName/grade/dimension/level/prompt/answer/explanation/hint/source/fingerprint` 保留。
- `student.blocks` 只包含学生可见文字、算式及已知条件图示；`student.tasks` 定义各个作答控件与标签。
- `answerSpec` 支持 scalar、quantity、choice、tuple、multipart 与 manual/rubric；教师答案与解释不作为学生 blocks 渲染。
- `familyId/skills/prerequisites/difficultyDescriptor/layout` 承载任务结构、目标技能、显式附加前置、设计难度和书写空间信息。完整课程先修关系仍从目录图读取；不将不存在的字段当作已实现接口。
- 旧 `visual` 可能含解量，禁止直接遍历或打印。只能渲染经过学生投影的白名单图示字段。

评分不执行答案中的算式，不使用 `eval`，以精确有理数比较分数/小数；支持全角、空格、选择键及文本。空白不是0，不接受 NaN/Infinity/零分母。单位依据题目规格处理，不推断任意单位换算。商余数可分小问作答；人工理由或绘图不因数值答对就标为整题全对。

## 来源校订

原始抽取为108点、432题、153条先修边。来源题 basic→1、standard→2，不把来源题改名为其他维度或升级为挑战。

`data/source-corrections.json` 保留校订理由：1道分母题纠正投影为C/8，8道越界或目标不符题从默认题池排除。`data/questions.json` 与原始来源修订保持不变。原始 verify 与原始答案的一致性检查不等于题干语义正确；校订投影另有回归测试。

## 实际能力与难度

- 32个显式算术 profile 保留参数化扩展；约束中间及最终数量、整十数、不进位条件和乘除口诀范围。部分挑战仍是受限的两步算式，不宣称所有点已升级为多类型推理任务。
- 六个重点点由 `src/templates/pilots.js` 优先提供语义候选：`cnm_p020/p018/p047/p060/p224/p089`。详见 `CONTENT-PILOTS.md`。支持范围以 `getCapabilities` 和实际容量为准。
- 时间推算 `cnm_p063` 保留同小时/跨小时逆向和方法判断，不能预先告知判断结果。
- 不承诺所有108点都有全部7维度、3难度。`getCapabilities` 只列跨级能力，并不表示每个级别都有题。小域如9加几可能不足18个不重复任务，必须说明。
- 难度依据支架、未知位置、关系链、表征及解释负担设计，未经过教师逐题审定或学生样本标定；参数变化不单独计作结构多样性。

确定性种子只承诺同一引擎/目录版本和设置下可复现，不承诺跨版本题序不变。导出应保留 schema、engine、planner、catalog 版本与种子。只去除单卷的重复，不承诺跨卷互不相同。

## 验证

`npm test` 覆盖契约、数域、独立题干复算、唯一解、来源投影、类型评分、蓝图范围和旧接口；生产交互与实际打印另行验收，见 `VERIFICATION.md`。测试不替代教师审核，也不能证明上游所有题目均适合某个教材版本。

来源固定修订为 `1e9f3d278b90e5a5c36e832c340e262feff0ca78`，CC BY-NC 4.0，AI初稿；沿用目录仍有署名及非商业限制。
