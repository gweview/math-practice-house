# 数学练习屋 · 1—3 年级

按知识点、任务维度与难度组织练习。支持在线分小问作答、本地错题重练、A4 分页预览和独立教师答案。静态运行，不需要数据库、API Key、儿童账号或在线模型。

## V2 内容与教学边界

- **108 个数学知识点、153 条先修关系、432 道原始来源题**；保留来源修订与许可，不改写原始答案文件。
- **六个重点知识点重做语义题型**：9加几、20以内不进位加法、用乘法验算除法、简单变化规律、等量代换、长方形面积。分解补十、不同未知位置、乘法核验、关系链、内部缺项、面积反推等任务不只更换数字。
- 其他已支持的算术模板保留，补充全链数域/不进位/整十数约束；**不是 108 点 × 7 维度 × 3 难度全部可用**。生成前显示当前候选量，缺题时明确提示，不换知识点或暗降难度凑题。
- 自定义严格使用所选难度；每日巩固与思维专题可在所选上限内显式混合难度，按教学分区选题。知识范围和维度不被偷偷扩大。
- `QuestionV2` 区分学生材料、作答任务、答案规格和教师解答。支持多小问、单位、选择、商余数与人工核阅。**数值答对不代表理由或绘图也已通过**。
- 来源问题通过 `data/source-corrections.json` 投影修正或排除，保留原始记录；例如分母题 `cnm_p226_q2` 应接受 C/8，而非原键 B/5。

难度是规则设计分级，尚未经过学生样本测量或教师逐题审定。六个重点点之外仍主要是来源题和参数化算式，不宣称整库均达到同等精品程度。

## 本地运行与构建

需要 Node.js 22.12+。

```bash
npm ci
npm run dev -- --port 4173
# 生成完整静态目录 dist/
npm run build
npm run preview -- --port 4173
```

部署时保留完整 `dist/`，包括 JSON、字库、来源与许可文件。开发/预览服务器不是域名、HTTPS 或公网部署证明。普通构建完全不需要联网下载字体；离线衍生字库及 SIL OFL 许可位于 `src/assets/fonts/`。

## 测试

```bash
npm test
python3 -m pip install pypdf fonttools brotli
npm run test:audit
npm run audit:data
npm run test:font
npx playwright install chromium
npm run test:e2e
npm run test:print-edges
npm run test:review-ui
npm run test:preview
npm run build
npm run test:production
npm run test:pdf
```

`test:production` 自动启动隔离的构建预览、通过真实浏览器操作控件，输出 45 组配置的 PDF 与结构检查到 `artifacts/v2/`，每例落盘并以 `complete` 标识整批是否完成；`test:pdf` 再核对实际 PDF 页数、A4 尺寸、每页实际题号、题干与教师讲解完整性、学生/答案分离等。`test:print-edges` 另行约束长种子、必要书写空间和短卷密度。不能用开发模式单元测试代替生产 PDF 验收。实际执行结果与限制见 `docs/VERIFICATION.md`。

字库更新是开发操作，需提供上游 Noto CJK OTF：

```bash
python3 scripts/build_font.py /path/to/NotoSansCJKsc-Regular.otf
npm run test:font
```

## 代码结构

- `src/engine.js`：确定性候选池、能力和旧 API 兼容。
- `src/question-model.js`：学生/教师数据模型、来源纠正、类型化评分。
- `src/templates/pilots.js`：六个重点知识点的语义模板。
- `src/planner.js`：先定义教学配额，再按知识点/家族分层选题。
- `src/renderers.js`、`src/print-layout.js`：学生图示、分小问控件与测量分页。
- `src/main.js`、`src/style.css`：界面、本地历史、导出与打印控制。
- `data/`：原始抽取、先修关系、来源、修正账本与许可。
- `docs/`：模块契约、模板、组卷、`PRINTING.md` 打印约定和 `VERIFICATION.md` 实测记录。

浏览器历史保存在本机 localStorage，不跨设备同步。错题重练使用保存的原题，不依据一次错误作能力诊断。导出 JSON 包含题目和教师答案，不应当作无答案学生试卷分发。

## 来源与许可

来源：[xiaoyang111222/cn-math-taxonomy](https://github.com/xiaoyang111222/cn-math-taxonomy)，固定修订 `1e9f3d278b90e5a5c36e832c340e262feff0ca78`。使用 `cnm_` 数学命名空间且年级为 1—3 的记录，避免混入其他科目。参考仓库只读，开发仓库为 [gweview/math-practice-house](https://github.com/gweview/math-practice-house)。

数据按 **CC BY-NC 4.0（署名—非商业性使用）** 提供，完整许可为 `data/LICENSE-CC-BY-NC-4.0.txt`；来源与改动记录在 `data/provenance.json`、`data/source-corrections.json`。商业使用须另行取得许可。

上游为 AI 初稿、未经教师审核；本项目的程序测试与独立代码复查不等于专业教学审定、教材全覆盖或测评有效性证明。
