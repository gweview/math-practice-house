import {
  renderStudentBlocks,
  renderAnswerControls,
  renderTeacherAnswer,
  adaptLegacyQuestion,
} from "./renderers.js";
import { paginatePrint } from "./print-layout.js";
import { planWorksheet, summarizeAvailability } from "./planner.js";

export function validateSettings(s) {
  if (![1, 2, 3].includes(Number(s.grade))) return "请选择一至三年级。";
  if (!["all", "上", "下"].includes(s.semester)) return "请选择有效学期。";
  if (
    !Array.isArray(s.dimensions) ||
    !s.dimensions.length ||
    s.dimensions.some(
      (d) =>
        ![
          "basic",
          "fill",
          "equivalence",
          "pattern",
          "reverse",
          "reasoning",
          "application",
        ].includes(d),
    )
  )
    return "请至少选择一个有效思维维度。";
  if (![1, 2, 3].includes(Number(s.level))) return "请选择有效难度。";
  if (![6, 12, 18].includes(Number(s.count))) return "题量须为 6、12 或 18。";
  if (
    s.mode &&
    !["custom", "daily", "thinking", "remediation"].includes(s.mode)
  )
    return "请选择有效练习模式。";
  if (!String(s.seed || "").trim() || String(s.seed).length > 120)
    return "请输入 1–120 字的练习种子。";
  return "";
}
export function filterTopics(topics, settings) {
  const search = String(settings.search || "")
    .trim()
    .toLowerCase();
  return topics.filter(
    (t) =>
      Number(t.grade) === Number(settings.grade) &&
      (settings.semester === "all" || t.semester === settings.semester) &&
      (!settings.domain ||
        settings.domain === "all" ||
        t.domain === settings.domain) &&
      (!search ||
        `${t.name} ${t.chapter || ""} ${t.description || ""}`
          .toLowerCase()
          .includes(search)),
  );
}
export function scopeCatalog(catalog, topics) {
  const ids = new Set(topics.map((t) => t.id));
  return {
    ...catalog,
    topics,
    questions: catalog.questions.filter((q) => ids.has(q.topicId)),
    dependencies: catalog.dependencies.filter(
      (d) => ids.has(d.topicId) && ids.has(d.prerequisiteId),
    ),
  };
}
export function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
const e = escapeHTML;
const emptyHistory = () => ({ attempted: 0, correct: 0, wrong: [] });
export function parseHistory(raw) {
  try {
    const h = JSON.parse(raw);
    if (
      !h ||
      !Number.isSafeInteger(h.attempted) ||
      h.attempted < 0 ||
      !Number.isSafeInteger(h.correct) ||
      h.correct < 0 ||
      h.correct > h.attempted ||
      !Array.isArray(h.wrong)
    )
      return emptyHistory();
    return {
      ...h,
      wrong: h.wrong
        .filter(
          (q) =>
            q &&
            typeof q.id === "string" &&
            typeof q.prompt === "string" &&
            typeof q.answer === "string",
        )
        .slice(0, 300),
    };
  } catch {
    return emptyHistory();
  }
}
export function recordAttempt(history, question, value, correct) {
  const key = question.fingerprint || question.id;
  const wrong = history.wrong.filter((q) => (q.fingerprint || q.id) !== key);
  if (!correct) wrong.push({ ...question, lastAnswer: String(value) });
  return {
    attempted: history.attempted + 1,
    correct: history.correct + (correct ? 1 : 0),
    wrong: wrong.slice(-300),
  };
}
export function prerequisiteTrace(id, topics, dependencies) {
  const seen = new Set([id]);
  const result = [];
  function walk(current) {
    for (const edge of dependencies.filter((d) => d.topicId === current)) {
      if (seen.has(edge.prerequisiteId)) continue;
      seen.add(edge.prerequisiteId);
      const t = topics.find((t) => t.id === edge.prerequisiteId);
      if (t) {
        result.push({ ...t, reason: edge.reason });
        walk(t.id);
      }
    }
  }
  walk(id);
  return result;
}
const dimensionNames = {
  basic: "基础练习",
  fill: "填空补全",
  equivalence: "等量代换",
  pattern: "规律探索",
  reverse: "逆向思考",
  reasoning: "推理判断",
  application: "生活应用",
};
const levelNames = { 1: "起步", 2: "进阶", 3: "挑战" };
export function modeDescription(mode, level = 1) {
  if (mode === "daily")
    return `每日巩固会在所选知识点和维度内混合起步至${levelNames[level] || "所选级"}，不跨到其他知识点。`;
  if (mode === "thinking")
    return `思维专题会交错所选范围内的任务家族，并混合起步至${levelNames[level] || "所选级"}。`;
  if (mode === "remediation")
    return "错题补救保留本地原题；单次错误不用于诊断，新增题仅来自明确选择的范围。";
  return `自定义练习严格使用${levelNames[level] || "所选级"}，不跨级补题。`;
}
export function renderQuestion(q, i, options = {}) {
  q = adaptLegacyQuestion(q);
  const hint = options.hint || 0;
  const answer =
    options.answer && typeof options.answer === "object"
      ? options.answer
      : { answer: options.answer || "" };
  return `<article class="question-card ${Number(q.grade) === 1 ? "large-glyphs" : ""}" data-question="${i}" data-status="${e(options.status || "unanswered")}">
    <div class="question-meta"><span class="question-number">${String(i + 1).padStart(2, "0")}</span><span>${e(q.topicName || "数学练习")}</span><span>${e(dimensionNames[q.dimension] || q.dimension || "基础计算")} · ${e(levelNames[q.level] || "起步")}</span></div>
    <div class="student-prompt">${renderStudentBlocks(q)}</div><div class="answer-controls">${renderAnswerControls(q, i, answer, options.parts || {})}</div>
    ${q.answerSpec?.manual || q.student.tasks?.some((t) => t.kind === "manual") ? '<p class="manual-notice">含有需要教师核阅的理由或绘图；自动检查不会把整题标为完全正确。</p>' : ""}
    <div class="question-actions"><button type="button" class="small-button" data-action="check" data-index="${i}">检查答案</button><button type="button" class="text-button" data-action="hint" data-index="${i}">${hint ? "再给一点提示" : "给我一点提示"} <span aria-hidden="true">↗</span></button></div>
    <div class="feedback ${options.correct === true ? "correct" : options.correct === false ? "incorrect" : ""} ${["partial", "manual", "unanswered"].includes(options.status) ? `status-${e(options.status)}` : ""}" role="status">${options.message ? e(options.message) : ""}</div>
    ${hint ? `<div class="hint"><b>小提示 ${hint}/2</b><p>${e(hint === 1 ? "先读清题目：已知什么，要找什么？可以画一画、圈出关键条件。" : q.hint || q.explanation || "试着用已经学过的方法，把问题分成小步骤。")}</p></div>` : ""}
    ${options.teacher ? `<div class="teacher-answer"><b>参考答案</b>${renderTeacherAnswer(q, i, { detailed: true })}</div>` : ""}
  </article>`;
}
const house = `<svg viewBox="0 0 270 195" fill="none" aria-hidden="true"><path d="M32 173H247" stroke="#234e49" stroke-width="2"/><path d="M69 92L137 29L207 92V173H69V92Z" fill="#e7ede1"/><path d="M55 92L137 16L221 92" stroke="#e58164" stroke-width="16" stroke-linejoin="round"/><path d="M121 173V120Q137 99 153 120V173" fill="#28746b"/><path d="M86 108H108V132H86Z" fill="#f5cb74"/><path d="M169 108H191V132H169Z" fill="#f5cb74"/><path d="M97 108V132M86 120H108M180 108V132M169 120H191" stroke="#234e49" stroke-width="2"/><circle cx="41" cy="41" r="15" fill="#f5cb74"/><path d="M222 147L236 124L250 147H222Z" fill="#e58164"/><path d="M236 147V173" stroke="#234e49" stroke-width="2"/><path d="M37 144H54V161H37Z" stroke="#28746b" stroke-width="2" transform="rotate(-12 37 144)"/><path d="M174 34L184 27M186 47L197 45M159 18V7" stroke="#28746b" stroke-width="2"/><text x="91" y="84" fill="#234e49" font-size="19" font-family="serif">＋</text><text x="162" y="84" fill="#234e49" font-size="19" font-family="serif">×</text></svg>`;

export async function startApp() {
  const root = document.querySelector("#app");
  const engine = await import("./engine.js");
  const catalog = await engine.loadCatalog();
  const dimensions = engine.DIMENSIONS;
  const storageKey = "math-practice-house.history.v1";
  let history = emptyHistory();
  let storageWarning = "";
  try {
    history = parseHistory(localStorage.getItem(storageKey));
  } catch {
    storageWarning = "浏览器未允许本地存储，错题仅在本次打开期间保留。";
  }
  const focusByGrade = { 1: "cnm_p020", 2: "cnm_p047", 3: "cnm_p224" };
  const focusDimensionByGrade = { 1: "fill", 2: "fill", 3: "equivalence" };
  let settings = {
    grade: 2,
    semester: "all",
    domain: "all",
    topicId: focusByGrade[2],
    search: "",
    dimensions: ["fill"],
    level: 1,
    count: 6,
    seed: "little-house-01",
    mode: "custom",
  };
  let view = "configure",
    worksheet = null,
    worksheetSettings = null,
    answers = {},
    hints = {},
    feedback = {},
    teacher = false,
    printAnswers = false,
    columns = 2,
    printStyle = "mixed",
    previewAudience = "student",
    previewOpen = false,
    mapTopic = "",
    trace = [],
    generating = false,
    notice = "",
    availability = null,
    availabilityEpoch = 0,
    availabilityTimer = 0;
  const topics = () => filterTopics(catalog.topics, settings);
  const topicName = (id) => catalog.topics.find((t) => t.id === id)?.name || id;
  const selectedTopic = () =>
    catalog.topics.find((t) => t.id === settings.topicId);
  const capabilityIds = (t) => {
    const caps = engine.getCapabilities(t);
    return Array.isArray(caps)
      ? caps.map((c) => (typeof c === "string" ? c : c.id))
      : Object.keys(caps || {});
  };
  const option = (value, label, current) =>
    `<option value="${e(value)}" ${String(current) === String(value) ? "selected" : ""}>${e(label)}</option>`;
  const selectedSummary = () =>
    `${settings.grade} 年级 · ${settings.semester === "all" ? "全学年" : settings.semester + "学期"} · ${settings.topicId === "all" ? (settings.domain === "all" ? "全部知识" : settings.domain) : topicName(settings.topicId)}`;
  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      storageWarning = "本地存储不可用或已满。当前记录仅在本次打开期间保留。";
    }
  }
  function formHTML() {
    return `<div class="configure-grid"><form id="settings-form" class="settings-panel" novalidate>
      <section class="form-section"><div class="section-heading"><span class="step-label">01</span><h2>从哪里开始？</h2><span class="section-aside">选一块知识拼图</span></div>
      <div class="filter-row"><label>年级<select name="grade" id="grade">${[1, 2, 3].map((x) => option(x, ["", "一年级", "二年级", "三年级"][x], settings.grade)).join("")}</select></label><label>学期<select name="semester" id="semester">${[
        ["all", "全学年"],
        ["上", "上学期"],
        ["下", "下学期"],
      ]
        .map(([x, y]) => option(x, y, settings.semester))
        .join(
          "",
        )}</select></label><label>知识领域<select name="domain" id="domain">${option("all", "全部领域", settings.domain)}${[...new Set(catalog.topics.filter((t) => Number(t.grade) === settings.grade).map((t) => t.domain))].map((d) => option(d, d, settings.domain)).join("")}</select></label></div>
      <label class="mode-label">练习模式<select name="mode" id="mode">${[
        ["custom", "自定义 · 严格所选难度"],
        ["daily", "每日巩固 · 混合至所选级"],
        ["thinking", "思维专题 · 混合至所选级"],
        ["remediation", "错题补救 · 保留原题"],
      ]
        .map(([v, l]) => option(v, l, settings.mode))
        .join(
          "",
        )}</select></label><p class="mode-description">${modeDescription(settings.mode, settings.level)}</p>
      <label class="search-label" for="topic-search"><span aria-hidden="true">⌕</span><input id="topic-search" name="search" type="search" aria-label="搜索知识点" placeholder="搜索知识点，如：乘法、长度……" value="${e(settings.search)}"></label>
      <div id="topic-list">${topicListHTML()}</div><div id="topic-detail">${topicDetailHTML()}</div><div id="availability-panel" class="availability-panel" aria-live="polite">${availabilityPanelHTML()}</div></section>
      <section class="form-section"><div class="section-heading"><span class="step-label">02</span><h2>换个角度想一想</h2><span class="section-aside">思维维度 · 可多选</span></div><fieldset class="dimensions"><legend class="sr-only">选择思维维度（可多选）</legend>${dimensions.map((d, i) => `<label class="dimension-option"><input type="checkbox" name="dimensions" value="${e(d.id)}" ${settings.dimensions.includes(d.id) ? "checked" : ""}><span class="dimension-mark" aria-hidden="true">${["＋", "□", "＝", "⋯", "↶", "∴", "△"][i] || "◇"}</span><span><b>${e(d.label)}</b><small>${e(d.description)}</small></span><span class="checkmark" aria-hidden="true">✓</span></label>`).join("")}</fieldset><p class="field-note">不是每个知识点都有全部维度与难度；不支持的组合会明确提醒，不用其他题目冒充。</p></section>
      <section class="form-section last"><div class="section-heading"><span class="step-label">03</span><h2>找到刚好的挑战</h2></div><fieldset class="segmented difficulty"><legend>难度</legend>${[1, 2, 3].map((l, i) => `<label><input type="radio" name="level" value="${l}" ${settings.level === l ? "checked" : ""}><span><b>${levelNames[l]}</b><small>${["巩固小基础", "多想一步", "认真动动脑"][i]}</small></span></label>`).join("")}</fieldset><div class="count-seed"><fieldset class="segmented count"><legend>每次练习</legend>${[6, 12, 18].map((n) => `<label><input type="radio" name="count" value="${n}" ${settings.count === n ? "checked" : ""}><span>${n} 题</span></label>`).join("")}</fieldset><label class="seed-label">练习种子 <span>同设置、同种子可复现</span><input id="seed" name="seed" maxlength="120" value="${e(settings.seed)}" autocomplete="off"></label></div></section>
    </form><aside class="recipe"><div class="recipe-paper"><div class="paper-top"><span>MY LITTLE WORKSHEET</span><span aria-hidden="true">✳</span></div><p class="eyebrow">今天的数学练习笺</p><h2>一点好奇，<br>一点新发现。</h2><div class="house-art">${house}</div><dl><div><dt>学习范围</dt><dd id="summary-scope">${e(selectedSummary())}</dd></div><div><dt>思考方式</dt><dd id="summary-dimensions">${e(settings.dimensions.map((d) => dimensionNames[d]).join("、") || "尚未选择")}</dd></div><div><dt>练习节奏</dt><dd id="summary-count">${levelNames[settings.level]} / ${settings.count} 题</dd></div></dl><button class="primary-button generate" type="submit" form="settings-form">生成我的练习 <span aria-hidden="true">↗</span></button><p class="recipe-note">可以在线作答，也可以打印后慢慢写。<br>遇到不会的题，先让提示帮帮忙。</p></div><div class="gentle-note"><span aria-hidden="true">✦</span><p>不赶进度，把每一步想明白。<br><b>错题也会成为下一次的起点。</b></p></div></aside></div>`;
  }
  function topicListHTML() {
    const list = topics();
    return `<div class="topic-list-heading"><span>可选知识点 <b>${list.length}</b></span><button type="button" class="text-button" data-view="map">展开知识地图 ↗</button></div><div class="topic-options" role="group" aria-label="知识点选择"><button type="button" class="topic-chip ${settings.topicId === "all" ? "selected" : ""}" data-topic="all" aria-pressed="${settings.topicId === "all"}">全部匹配知识</button>${list.map((t) => `<button type="button" class="topic-chip ${settings.topicId === t.id ? "selected" : ""}" data-topic="${e(t.id)}" aria-pressed="${settings.topicId === t.id}">${e(t.name)}</button>`).join("")}</div>${!list.length ? '<p class="empty-inline">没有匹配的知识点。试试清空搜索，或更换学期与领域。</p>' : ""}`;
  }
  function topicDetailHTML() {
    const t = selectedTopic();
    if (!t) return "";
    const caps = capabilityIds(t);
    const unsupported = settings.dimensions.filter((d) => !caps.includes(d));
    return `<div class="topic-detail"><b>${e(t.name)}</b><p>${e(t.description)}</p><small>可用维度：${e(caps.map((d) => dimensionNames[d] || d).join("、") || "暂无")}</small>${unsupported.length ? `<p class="warning-inline">所选「${e(unsupported.map((d) => dimensionNames[d]).join("、"))}」不支持此知识点，将报告不足。</p>` : ""}<button class="text-button" type="button" data-explore="${e(t.id)}">看看它的前置知识 →</button></div>`;
  }
  function availabilityPanelHTML() {
    if (!availability) return "<p>正在核对当前范围的真实题库容量……</p>";
    const deficit = Math.max(
      0,
      Number(settings.count) - Number(availability.availableCount || 0),
    );
    return `<b>生成前容量核对</b><p>当前组合实际可用 ${availability.availableCount || 0} 题 · ${availability.templateCount || 0} 个模板家族。请求 ${settings.count} 题${deficit ? `，预计缺 ${deficit} 题` : ""}。</p>${(availability.dimensions || []).map((d) => `<small>${e(dimensionNames[d.id] || d.id)} · ${levelNames[d.level] || ""}：${d.availableCount} 题 / ${d.templateCount || 0} 家族</small>`).join("")}${(availability.warnings || []).length ? `<ul>${availability.warnings.map((w) => `<li>${e(typeof w === "string" ? w : w.message || JSON.stringify(w))}</li>`).join("")}</ul>` : ""}<p class="field-note">容量不足时如实保留缺口；不会自动换难度、知识点或重复题目。</p>`;
  }
  function invalidateAvailability() {
    clearTimeout(availabilityTimer);
    availabilityEpoch++;
    availability = null;
  }
  async function refreshAvailability() {
    invalidateAvailability();
    const epoch = availabilityEpoch;
    const pending = root.querySelector("#availability-panel");
    if (pending) pending.innerHTML = availabilityPanelHTML();
    const selected = topics();
    if (!selected.length) {
      availability = {
        availableCount: 0,
        templateCount: 0,
        dimensions: [],
        warnings: ["当前筛选没有知识点。"],
      };
      const box = root.querySelector("#availability-panel");
      if (box) box.innerHTML = availabilityPanelHTML();
      return;
    }
    try {
      const result = await summarizeAvailability(
        scopeCatalog(catalog, selected),
        settings,
        engine,
      );
      if (epoch !== availabilityEpoch) return;
      availability = result;
    } catch (err) {
      if (epoch !== availabilityEpoch) return;
      availability = {
        availableCount: 0,
        templateCount: 0,
        dimensions: [],
        warnings: [`容量暂不可用：${err.message}`],
      };
    }
    const box = root.querySelector("#availability-panel");
    if (box) box.innerHTML = availabilityPanelHTML();
  }
  function worksheetHTML() {
    if (!worksheet?.questions.length)
      return `<div class="empty-state"><div class="house-art">${house}</div><h2>${worksheet ? "这个组合暂时没有可用题目" : "一张属于你的练习，还没开始"}</h2><p>${worksheet ? "请回到选题，换个知识点、维度或难度，再试一次。" : "从一个知识点、一种思考方式开始。准备好了，就出发。"}</p><button class="primary-button" data-view="configure">去选择练习 →</button></div>`;
    return `<section class="worksheet-view"><div class="worksheet-toolbar"><div><p class="eyebrow">YOUR MATH, YOUR PACE</p><h2>${worksheetSettings?.retry ? "错题再练" : "我的数学练习"} <span>${worksheet.questions.length} 题</span></h2><p class="muted">${e(worksheetSettings?.scope || "")} · 种子 ${e(worksheet.seed)}</p></div><div class="toolbar-actions"><button class="outline-button" data-action="variant">换一组题 ↻</button><button class="outline-button" data-view="configure">调整选题</button></div></div>
    <div class="practice-options"><label><input id="teacher" type="checkbox" ${teacher ? "checked" : ""}> 显示参考答案（教师）</label><label><input id="print-answers" type="checkbox" ${printAnswers ? "checked" : ""}> 打印独立答案页</label><label class="inline-label">栏数<select id="columns">${option(2, "双栏", columns)}${option(1, "单栏", columns)}</select></label><label class="inline-label">打印样式<select id="print-style">${[
      ["compact", "紧凑口算"],
      ["mixed", "混合练习"],
      ["thinking", "思维专题"],
    ]
      .map(([v, l]) => option(v, l, printStyle))
      .join(
        "",
      )}</select></label><label class="inline-label">预览对象<select id="preview-audience">${option("student", "学生卷", previewAudience)}${option("teacher", "教师答案", previewAudience)}</select></label><button class="outline-button" data-action="preview" aria-expanded="${previewOpen}">${previewOpen ? "收起" : "打开"}分页预览</button><button class="text-button" data-action="export">导出 JSON ↓</button><button class="primary-button compact" data-action="print">打印 A4 ↗</button></div>
    <div class="worksheet-note">${e(worksheetSettings?.plan?.description || modeDescription(settings.mode, settings.level))}${teacher ? " 教师参考答案已显示；学生卷与教师卷分开分页。" : ""}</div>
    ${worksheet.sections?.length ? `<nav class="worksheet-sections" aria-label="练习分区">${worksheet.sections.map((s) => `<span><b>${e(s.title)}</b><small>${e(s.description || "")} · ${s.questionIds.length}题</small></span>`).join("")}</nav>` : ""}
    ${worksheet.quality?.goals?.length ? `<p class="plan-goals">本卷关注：${e(worksheet.quality.goals.join("、"))}。模板家族 ${Object.keys(worksheet.quality.familyCounts || {}).length} 类；最长同答案连续 ${worksheet.quality.answerMaxStreak || 0} 题。</p>` : ""}
    ${availability ? `<p class="availability-summary" role="status">当前组合可用 ${availability.availableCount} 题，${availability.templateCount} 个模板家族。${availability.warnings?.length ? e(availability.warnings.join("；")) : ""}</p>` : ""}
    <div class="question-grid">${worksheet.questions.map((q, i) => renderQuestion(q, i, { answer: answers[i], hint: hints[i], ...feedback[i], teacher })).join("")}</div><div class="batch-actions"><button class="primary-button" data-action="check-all">检查已填写的答案</button><span>留空的题目不会计入作答统计。</span></div></section>`;
  }
  function mapHTML() {
    const selected = catalog.topics.find((t) => t.id === mapTopic);
    return `<section class="map-view"><div class="view-heading"><div><p class="eyebrow">EVERY IDEA HAS A ROOT</p><h2>知识连起来，思路就打开了。</h2><p class="muted">点击知识点，沿着真实的前置关系，找到可以先学的一步。</p></div><button class="outline-button" data-view="configure">返回出题</button></div><div class="map-filters"><label>查看年级<select id="map-grade">${[1, 2, 3].map((n) => option(n, `${n} 年级`, settings.grade)).join("")}</select></label><label>搜索知识<input id="map-search" type="search" value="${e(settings.search)}" placeholder="知识点名称"></label></div><div class="map-layout"><div class="map-topic-list" id="map-topic-list">${mapListHTML()}</div><aside class="map-inspector" id="map-inspector">${selected ? mapDetailHTML(selected) : '<p class="eyebrow">从一个问题出发</p><h3>选一个知识点，<br>看看它从哪里来。</h3><div class="house-art">' + house + "</div><p>这里只显示资料中记录的前置关系，不代表完整课程或能力评估。</p>"}</aside></div></section>`;
  }
  function mapListHTML() {
    return (
      catalog.topics
        .filter(
          (t) =>
            Number(t.grade) === settings.grade &&
            (!settings.search ||
              `${t.name} ${t.description}`.includes(settings.search)),
        )
        .map(
          (t, i) =>
            `<button class="map-node ${mapTopic === t.id ? "selected" : ""}" data-explore="${e(t.id)}"><span>${String(i + 1).padStart(2, "0")}</span><b>${e(t.name)}</b><small>${e(t.semester)}学期 · ${e(t.domain)}</small><span aria-hidden="true">↗</span></button>`,
        )
        .join("") ||
      '<p class="empty-inline">没有匹配的知识点，请修改搜索。</p>'
    );
  }
  function mapDetailHTML(t) {
    const prerequisites = catalog.dependencies.filter(
      (d) => d.topicId === t.id,
    );
    const next = catalog.dependencies.filter((d) => d.prerequisiteId === t.id);
    const all = prerequisiteTrace(t.id, catalog.topics, catalog.dependencies);
    return `<p class="eyebrow">知识探索 · ${t.grade} 年级</p><h3>${e(t.name)}</h3><p>${e(t.description)}</p><nav class="trace" aria-label="探索足迹">${trace.map((id) => `<button class="text-button" data-explore="${e(id)}">${e(topicName(id))}</button>`).join('<span aria-hidden="true"> › </span>')}</nav><h4>先学这些 · ${prerequisites.length}</h4>${prerequisites.length ? prerequisites.map((d) => `<button class="dependency" data-explore="${e(d.prerequisiteId)}">← ${e(topicName(d.prerequisiteId))}<small>${e(d.reason || "前置知识")}</small></button>`).join("") : `<p class="muted">${e(t.root_reason || "资料中未记录更早的前置知识。")}</p>`}<details><summary>向前追溯 · ${all.length} 个关联前置知识</summary>${all.map((p) => `<button class="text-button trace-link" data-explore="${e(p.id)}">${e(p.name)}</button>`).join("") || "<p>暂无更早记录。</p>"}</details><h4>接下来可以探索 · ${next.length}</h4>${next.map((d) => `<button class="dependency" data-explore="${e(d.topicId)}">${e(topicName(d.topicId))} →</button>`).join("") || '<p class="muted">暂无后续关系记录。</p>'}<button class="primary-button" data-practice-topic="${e(t.id)}">用这个知识点出题 →</button>`;
  }
  function historyHTML() {
    return `<section class="history-view"><div class="view-heading"><div><p class="eyebrow">A SECOND TRY IS A NEW START</p><h2>再想一次，也是一种进步。</h2><p class="muted">记录仅保存在当前浏览器；答对后会自动移出错题本。</p></div><button class="text-button danger" data-action="clear">清空记录</button></div><div class="real-stats"><div><strong>${history.attempted}</strong><span>实际提交次数</span></div><div><strong>${history.correct}</strong><span>答对次数</span></div><div><strong>${history.wrong.length}</strong><span>待重练题目</span></div></div>${history.wrong.length ? `<button class="primary-button" data-action="retry">重练全部错题（${history.wrong.length} 题） →</button><div class="wrong-list">${history.wrong.map((q, i) => `<article><span class="eyebrow">${e(q.topicName || "数学练习")}</span><h3>${i + 1}. ${e(q.prompt)}</h3><p>上次的回答：${e(q.lastAnswer)}</p></article>`).join("")}</div>` : `<div class="empty-state"><div class="house-art">${house}</div><h3>这里暂时没有错题。</h3><p>认真尝试过的每一道题，才会留下真实记录。</p><button class="outline-button" data-view="configure">开始一次练习</button></div>`}</section>`;
  }
  function warningsHTML() {
    const warnings = worksheet?.warnings || [];
    const partial =
      worksheet && worksheet.questions.length < worksheet.requestedCount;
    if (!warnings.length && !partial) return "";
    return `<section class="warning-box" role="status"><b>${partial ? `实际生成 ${worksheet.questions.length} / ${worksheet.requestedCount} 题` : "本次出题提醒"}</b><ul>${warnings.map((w) => `<li>${e(typeof w === "string" ? w : w.message || JSON.stringify(w))}</li>`).join("")}</ul><p>题库与生成器覆盖有限；未支持的组合不会替换为其他维度或更低难度。</p></section>`;
  }
  function render() {
    root.innerHTML = `<a class="skip-link" href="#main-content">跳到主要内容</a><aside class="sidebar"><a class="brand" href="#" data-view="configure"><span class="brand-logo" aria-hidden="true"><i></i><i></i></span><span>数学练习屋<small>MATH PRACTICE HOUSE</small></span></a><div class="sidebar-caption">给好奇心，留一间小屋。</div><nav aria-label="主要导航"><button class="nav-item ${view === "configure" ? "active" : ""}" data-view="configure"><span class="nav-symbol">▦</span> 定制练习 <span class="nav-index">01</span></button><button class="nav-item ${view === "practice" ? "active" : ""}" data-view="practice"><span class="nav-symbol">▤</span> 我的练习 <span class="nav-index">02</span></button><button class="nav-item ${view === "map" ? "active" : ""}" data-view="map"><span class="nav-symbol">⌘</span> 知识地图 <span class="nav-index">↗</span></button><button class="nav-item ${view === "history" ? "active" : ""}" data-view="history"><span class="nav-symbol">↶</span> 错题再练 <span class="nav-index">${history.wrong.length}</span></button></nav><div class="sidebar-bottom"><div class="little-shapes" aria-hidden="true"><span>＋</span><span>△</span><span>○</span></div><p>慢慢想，试试看。<br>数学不止一个答案的终点，<br>还有许多思考的起点。</p><span class="edition">小学 1—3 年级 · 非商业学习</span></div></aside><div class="main-shell"><header class="topbar"><span>小小思考，大大发现。</span><span class="local-badge"><i></i> 无需登录 · 本地错题本</span></header><main id="main-content" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">THE LITTLE JOY OF THINKING</p><h1>${view === "configure" ? "今天，想探索什么？" : view === "practice" ? "把好奇心，写成答案。" : view === "map" ? "每个知识点，都有来处。" : "没想明白的，换个角度。"}</h1><p>${view === "configure" ? "选一块知识，换一种思路。让每一次练习，都刚刚好。" : "在数学的小屋里，每一步思考都算数。"}</p></div><span class="heading-stamp" aria-hidden="true">想一想<br><b>再试试</b><span>＋ × ÷ ＝</span></span></div><div id="notice" class="notice ${notice ? "visible" : ""}" role="status">${e(notice)}</div>${storageWarning ? `<p class="warning-box" role="status">${e(storageWarning)}</p>` : ""}${view === "practice" ? warningsHTML() : ""}${view === "configure" ? formHTML() : view === "practice" ? worksheetHTML() : view === "map" ? mapHTML() : historyHTML()}<footer class="site-footer"><div><b>数学练习屋</b><span>知识 × 思维 × 刚好的挑战</span></div><p>来源知识库 ${catalog.topics.length} 个知识点 · ${catalog.dependencies.length} 条前置关系 · ${catalog.questions.length} 道原始题。生成题量以本次结果为准。</p><p>来源：<a href="https://github.com/xiaoyang111222/cn-math-taxonomy" target="_blank" rel="noopener noreferrer">xiaoyang111222/cn-math-taxonomy</a> · <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noopener noreferrer">CC BY-NC 4.0（署名 · 非商业）</a><br>基于提交 1e9f3d278b90e5a5c36e832c340e262feff0ca78。内容为 AI 草稿，未经教师逐题审核；建议家长或教师核对，不代表完整课程与高阶覆盖。</p></footer></main></div>`;
    document.title =
      {
        configure: "定制练习",
        practice: "我的练习",
        map: "知识地图",
        history: "错题再练",
      }[view] + " · 数学练习屋";
    renderPrint();
  }
  let printRenderEpoch = 0;
  async function renderPrint() {
    const epoch = ++printRenderEpoch;
    const target = document.querySelector("#print-root");
    if (!target) return;
    target.dataset.previewAudience = previewAudience;
    target.classList.toggle("preview-open", previewOpen);
    if (!worksheet?.questions.length) {
      target.replaceChildren();
      return {
        pageCount: 0,
        studentPageCount: 0,
        answerPageCount: 0,
        warnings: [],
      };
    }
    try {
      const meta = `${worksheetSettings?.scope || ""} · ${worksheet.questions.length}题 · ${worksheet.seed} · 来源 cn-math-taxonomy / CC BY-NC 4.0 · AI草稿，教师请核对`;
      // Pagination may await fonts; never let an older render mutate the live root.
      const staging = document.createElement("div");
      const result = await paginatePrint({
        questions: worksheet.questions,
        sections: worksheet.sections || [],
        columns,
        style: printStyle,
        includeAnswers: printAnswers,
        root: staging,
        metadata: meta,
        title: worksheetSettings?.retry
          ? "错题再练"
          : "数学练习屋 · 我的练习笺",
      });
      if (epoch !== printRenderEpoch || target !== document.querySelector("#print-root")) return null;
      target.replaceChildren(...staging.childNodes);
      target.dataset.pageCount = String(result.pageCount);
      target.dataset.studentPages = String(result.studentPageCount);
      target.dataset.answerPages = String(result.answerPageCount);
      target.setAttribute("aria-hidden", "false");
      if (previewOpen) {
        const close = document.createElement("button");
        close.type = "button";
        close.className = "preview-close";
        close.textContent = "收起分页预览";
        close.setAttribute("aria-label", "关闭打印预览");
        close.addEventListener("click", () => {
          previewOpen = false;
          renderPrint();
        });
        target.prepend(close);
      }
      return { ...result, epoch };
    } catch (error) {
      if (epoch !== printRenderEpoch || target !== document.querySelector("#print-root")) return null;
      target.innerHTML = `<div class="print-layout-warning" role="alert"><b>无法安全分页</b><p>${e(error.message)}</p></div>`;
      notice = `打印排版未完成：${error.message}`;
      return {
        pageCount: 0,
        studentPageCount: 0,
        answerPageCount: 0,
        warnings: [error.message],
      };
    }
  }
  function syncSummary() {
    const scope = document.querySelector("#summary-scope");
    if (scope) scope.textContent = selectedSummary();
    const dim = document.querySelector("#summary-dimensions");
    if (dim)
      dim.textContent =
        settings.dimensions.map((d) => dimensionNames[d]).join("、") ||
        "尚未选择";
    const count = document.querySelector("#summary-count");
    if (count)
      count.textContent = `${levelNames[settings.level]} / ${settings.count} 题`;
    const detail = document.querySelector("#topic-detail");
    if (detail) detail.innerHTML = topicDetailHTML();
  }
  function captureAnswers() {
    worksheet?.questions.forEach((raw, i) => {
      const q = adaptLegacyQuestion(raw),
        value = {};
      for (const task of q.student.tasks || []) {
        const name = `answer-${i}-${task.id || "answer"}`;
        const el =
          root.querySelector(`input[name="${name}"]:checked`) ||
          root.querySelector(
            `input[name="${name}"]:not([type="radio"]),textarea[name="${name}"]`,
          );
        if (el) value[task.id || "answer"] = el.value;
      }
      answers[i] = value;
    });
  }
  function resetPractice() {
    answers = {};
    hints = {};
    feedback = {};
    teacher = false;
  }
  function newSeed() {
    return (
      "house-" +
      Array.from(crypto.getRandomValues(new Uint32Array(2)), (v) =>
        v.toString(36),
      ).join("-")
    );
  }
  async function generate(variant = false) {
    if (generating) return;
    if (variant && worksheetSettings?.retry) {
      notice = "错题重练保留原题；答对后即可移出错题本。";
      render();
      return;
    }
    if (variant && worksheetSettings)
      settings = {
        ...worksheetSettings.settings,
        dimensions: [...worksheetSettings.settings.dimensions],
        seed: newSeed(),
      };
    const error = validateSettings(settings);
    if (error) {
      notice = error;
      render();
      return;
    }
    const available = topics();
    if (!available.length) {
      notice = "当前筛选没有可选知识点。请清空搜索或调整学期、领域。";
      render();
      return;
    }
    if (
      settings.topicId !== "all" &&
      !available.some((t) => t.id === settings.topicId)
    ) {
      notice = "所选知识点不在当前筛选范围，请重新选择。";
      render();
      return;
    }
    generating = true;
    notice = "正在整理你的数学练习……";
    const button = root.querySelector(".generate");
    if (button) {
      button.disabled = true;
      button.textContent = "正在出题……";
    }
    try {
      const scoped = scopeCatalog(catalog, available);
      const planOptions = {
        ...settings,
        dimensions: [...settings.dimensions],
        wrongQuestions:
          settings.mode === "remediation"
            ? history.wrong.map(({ lastAnswer, ...q }) => q)
            : [],
      };
      availability = await summarizeAvailability(scoped, planOptions, engine);
      const result = await planWorksheet(scoped, planOptions, engine);
      worksheet = {
        ...result,
        questions: result.questions || [],
        warnings: result.warnings || [],
        requestedCount: result.requestedCount ?? settings.count,
        seed: result.seed ?? settings.seed,
      };
      worksheetSettings = {
        settings: { ...settings, dimensions: [...settings.dimensions] },
        scope: selectedSummary(),
        plan: result.plan,
        quality: result.quality,
        versions: result.versions,
      };
      resetPractice();
      view = "practice";
      notice = worksheet.questions.length
        ? `已生成 ${worksheet.questions.length} 道练习。准备好了，就从第一题开始吧。`
        : "此组合暂无可用题目，请调整设置。";
    } catch (err) {
      notice = "出题失败：" + (err?.message || "请稍后重试。");
    } finally {
      generating = false;
      render();
      document.querySelector("#main-content")?.focus({ preventScroll: true });
    }
  }
  function check(index) {
    const raw = worksheet?.questions[index];
    if (!raw) return;
    const q = adaptLegacyQuestion(raw);
    captureAnswers();
    const value = answers[index] || {},
      filled = Object.values(value).some((v) => String(v).trim());
    if (!filled) {
      feedback[index] = {
        status: "unanswered",
        message: "先写下你的答案，再来检查吧。",
      };
      return;
    }
    const normalized = Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, String(v).trim()]),
    );
    if (feedback[index]?.checkedValue === JSON.stringify(normalized)) {
      feedback[index] = {
        ...feedback[index],
        message: "这个答案已经检查过啦；需要核阅的部分仍待教师确认。",
      };
      return;
    }
    const assessmentInput =
      q.answerSpec?.kind === "multipart" ||
      q.answerSpec?.kind === "tuple" ||
      q.student.tasks.length > 1
        ? normalized
        : (normalized.answer ?? Object.values(normalized)[0]);
    const assessment =
      typeof engine.assessAnswer === "function"
        ? engine.assessAnswer(q, assessmentInput)
        : {
            status: engine.checkAnswer(q, assessmentInput)
              ? "correct"
              : "incorrect",
            parts: {},
          };
    const status = assessment.status,
      fullyCorrect = status === "correct";
    if (status !== "unanswered" && status !== "manual") {
      history = recordAttempt(
        history,
        q,
        Object.values(normalized).join(" / "),
        fullyCorrect,
      );
      save();
    }
    feedback[index] = {
      status,
      parts: assessment.parts || {},
      correct: fullyCorrect,
      checkedValue: JSON.stringify(normalized),
      message:
        status === "correct"
          ? "全部正确！把你的思路也说一说吧。"
          : status === "partial"
            ? "部分答案正确；请补全其余小问。"
            : status === "manual"
              ? "数值部分已检查；理由或绘图等待人工核阅，整题尚未判为正确。"
              : "还差一点点。试试提示，想好后再检查一次。",
    };
  }
  function updateCard(i) {
    const card = root.querySelector(`[data-question="${i}"]`);
    if (card)
      card.outerHTML = renderQuestion(worksheet.questions[i], i, {
        answer: answers[i],
        hint: hints[i],
        ...feedback[i],
        teacher,
      });
    const badge = root.querySelector('[data-view="history"] .nav-index');
    if (badge) badge.textContent = history.wrong.length;
  }
  root.addEventListener("submit", (event) => {
    if (event.target.id === "settings-form") {
      event.preventDefault();
      generate();
    }
  });
  root.addEventListener("input", (event) => {
    const el = event.target;
    if (el.id === "topic-search") {
      settings.search = el.value;
      settings.topicId = "all";
      root.querySelector("#topic-list").innerHTML = topicListHTML();
      syncSummary();
      clearTimeout(availabilityTimer);
      availabilityTimer = setTimeout(refreshAvailability, 250);
    }
    if (el.id === "seed") settings.seed = el.value;
    if (el.id === "map-search") {
      settings.search = el.value;
      invalidateAvailability();
      root.querySelector("#map-topic-list").innerHTML = mapListHTML();
    }
  });
  root.addEventListener("change", (event) => {
    const el = event.target;
    if (["grade", "semester", "domain"].includes(el.name)) {
      settings[el.name] = el.name === "grade" ? Number(el.value) : el.value;
      settings.topicId =
        el.name === "grade" ? focusByGrade[settings.grade] : "all";
      if (el.name === "grade") {
        settings.domain = "all";
        settings.dimensions = [focusDimensionByGrade[settings.grade]];
      }
      notice = "";
      render();
      refreshAvailability();
      return;
    }
    if (el.name === "dimensions") {
      settings.dimensions = [
        ...root.querySelectorAll('[name="dimensions"]:checked'),
      ].map((x) => x.value);
      syncSummary();
      refreshAvailability();
    }
    if (el.name === "level" || el.name === "count") {
      settings[el.name] = Number(el.value);
      syncSummary();
      refreshAvailability();
    }
    if (el.name === "mode") {
      settings.mode = el.value;
      const desc = root.querySelector(".mode-description");
      if (desc)
        desc.textContent = modeDescription(settings.mode, settings.level);
      refreshAvailability();
    }
    if (el.id === "map-grade") {
      invalidateAvailability();
      settings.grade = Number(el.value);
      settings.topicId = "all";
      settings.domain = "all";
      settings.semester = "all";
      mapTopic = "";
      trace = [];
      render();
    }
    if (el.id === "teacher") {
      captureAnswers();
      teacher = el.checked;
      render();
    }
    if (el.id === "print-answers") {
      printAnswers = el.checked;
      renderPrint();
    }
    if (el.id === "columns") {
      columns = Number(el.value);
      renderPrint();
    }
    if (el.id === "print-style") {
      printStyle = el.value;
      renderPrint();
    }
    if (el.id === "preview-audience") {
      previewAudience = el.value;
      renderPrint();
    }
  });
  root.addEventListener("click", async (event) => {
    const el = event.target.closest("button,a[data-view]");
    if (!el) return;
    if (el.dataset.view) {
      event.preventDefault();
      captureAnswers();
      view = el.dataset.view;
      notice = "";
      render();
      if (view === "configure") refreshAvailability();
      return;
    }
    if (el.dataset.topic) {
      settings.topicId = el.dataset.topic;
      root.querySelector("#topic-list").innerHTML = topicListHTML();
      syncSummary();
      refreshAvailability();
      return;
    }
    if (el.dataset.explore) {
      captureAnswers();
      mapTopic = el.dataset.explore;
      const t = catalog.topics.find((t) => t.id === mapTopic);
      if (!t) return;
      invalidateAvailability();
      settings.grade = Number(t.grade);
      if (trace.at(-1) !== mapTopic) trace = [...trace, mapTopic].slice(-8);
      view = "map";
      notice = "";
      render();
      return;
    }
    if (el.dataset.practiceTopic) {
      const t = catalog.topics.find((t) => t.id === el.dataset.practiceTopic);
      invalidateAvailability();
      settings = {
        ...settings,
        grade: Number(t.grade),
        semester: "all",
        domain: "all",
        search: "",
        topicId: t.id,
      };
      view = "configure";
      notice = "";
      render();
      refreshAvailability();
      return;
    }
    const action = el.dataset.action;
    if (!action) return;
    if (action === "check") {
      check(Number(el.dataset.index));
      updateCard(Number(el.dataset.index));
    }
    if (action === "hint") {
      captureAnswers();
      const i = Number(el.dataset.index);
      hints[i] = Math.min(2, (hints[i] || 0) + 1);
      updateCard(i);
    }
    if (action === "check-all") {
      captureAnswers();
      worksheet.questions.forEach((q, i) => {
        if (Object.values(answers[i] || {}).some((v) => String(v).trim()))
          check(i);
      });
      notice = "已检查填写的答案；留空题目未计入统计。";
      render();
    }
    if (action === "variant") generate(true);
    if (action === "print") {
      const result = await renderPrint();
      if (result?.epoch === printRenderEpoch && result.studentPageCount) window.print();
      else if (result) notice = "打印预览未就绪，请先修正分页提醒。";
    }
    if (action === "preview") {
      previewOpen = !previewOpen;
      const result = await renderPrint();
      if (!result) return;
      render();
      await new Promise((r) => requestAnimationFrame(r));
      document
        .querySelector("#print-root")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      if (!result.pageCount) notice = result.warnings.join(" ");
    }
    if (action === "export") {
      const payload = {
        format: "math-practice-house.v2",
        schemaVersion: 2,
        settings: worksheetSettings,
        worksheet,
        provenance: worksheet.versions || {
          schema: 2,
          engine: "unknown",
          planner: "unknown",
          catalog: "unknown",
        },
        attribution: {
          repository: "xiaoyang111222/cn-math-taxonomy",
          commit: "1e9f3d278b90e5a5c36e832c340e262feff0ca78",
          license: "CC-BY-NC-4.0",
          caution: "AI 草稿，未经教师逐题审核；仅限非商业使用。",
        },
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        "math-practice-" +
        String(worksheet.seed).replace(/[^a-zA-Z0-9_-]/g, "_") +
        ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    if (action === "retry") {
      worksheet = {
        questions: history.wrong.map(({ lastAnswer, ...q }) => q),
        warnings: [],
        seed: "wrong-answers",
        requestedCount: history.wrong.length,
      };
      worksheetSettings = { retry: true, scope: "本地错题重练" };
      resetPractice();
      view = "practice";
      notice = "重新想一想。答对的题会自动移出错题本。";
      render();
    }
    if (
      action === "clear" &&
      window.confirm("确定清空本浏览器的全部作答统计和错题吗？此操作无法撤销。")
    ) {
      history = emptyHistory();
      save();
      notice = "作答统计与错题记录已清空。";
      render();
    }
  });
  render();
  refreshAvailability();
}
if (typeof document !== "undefined")
  startApp().catch((error) => {
    const root = document.querySelector("#app");
    if (root)
      root.innerHTML = `<main class="load-error"><h1>小屋还没准备好</h1><p>题库加载失败，请检查网络或刷新后重试。</p><p>${e(error.message)}</p><button type="button" onclick="location.reload()">重新加载</button></main>`;
  });
