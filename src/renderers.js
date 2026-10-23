import { toQuestionV2 } from "./question-model.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const kinds = new Set([
  "tenframe",
  "array",
  "numberline",
  "balance",
  "rectangle",
  "sequence",
  "table",
  "clock",
  "fraction",
]);
const clampInt = (v, min, max) =>
  Math.max(
    min,
    Math.min(max, Number.isFinite(Number(v)) ? Math.floor(Number(v)) : min),
  );
function diagram(kind, d = {}) {
  if (!kinds.has(kind) || !d || typeof d !== "object")
    return '<div class="student-diagram diagram-unknown">未知图示</div>';
  let body = "";
  if (kind === "tenframe") {
    const n = clampInt(d.totalSlots ?? 10, 1, 20),
      filled = clampInt(d.filled, 0, n),
      added = clampInt(d.added, 0, n - filled);
    body = `<div class="tenframe" role="img" aria-label="十格图：已有${filled}个${added ? `，再加入${added}个` : ""}">${Array.from({ length: n }, (_, i) => `<i class="${i < filled ? "filled" : i < filled + added ? "added" : ""}"></i>`).join("")}</div>`;
  } else if (kind === "array") {
    const r = clampInt(d.rows, 1, 12),
      c = clampInt(d.columns, 1, 12);
    body = `<div class="array-diagram" style="--columns:${c}" role="img" aria-label="${r}行${c}列点阵">${Array.from({ length: r * c }, () => "<i></i>").join("")}</div>`;
  } else if (kind === "numberline") {
    const min = Number(d.min),
      max = Number(d.max),
      start = Number(d.start);
    body = `<div class="numberline" role="img" aria-label="数线 ${esc(min)} 到 ${esc(max)}"><span>${esc(min)}</span><i></i>${Number.isFinite(start) ? `<b>${esc(start)}</b>` : ""}<span>${esc(max)}</span>${
      Array.isArray(d.jumps)
        ? `<small>${d.jumps
            .slice(0, 8)
            .map((x) => esc(x?.label ?? x?.by))
            .join("　")}</small>`
        : ""
    }</div>`;
  } else if (kind === "balance") {
    const side = (a) =>
      (Array.isArray(a) ? a : [])
        .slice(0, 6)
        .map(
          (x) =>
            `${esc(x?.symbol || "■")} ${esc(x?.count || 1)}${x?.label ? ` ${esc(x.label)}` : ""}`,
        )
        .join(" ＋ ") || "　";
    body = `<div class="balance-diagram" role="img" aria-label="天平示意"><span>${side(d.left)}</span><b>＝</b><span>${side(d.right)}</span></div>`;
  } else if (kind === "rectangle") {
    const known =
      Number.isInteger(d.widthUnits) &&
      d.widthUnits > 0 &&
      d.widthUnits <= 20 &&
      Number.isInteger(d.heightUnits) &&
      d.heightUnits > 0 &&
      d.heightUnits <= 20;
    const columns = known ? d.widthUnits : 7,
      rows = known ? d.heightUnits : 4,
      grid = d.showGrid && known;
    const lines = grid
      ? [
          ...Array.from(
            { length: columns - 1 },
            (_, i) => `M${i + 1} 0V${rows}`,
          ),
          ...Array.from(
            { length: rows - 1 },
            (_, i) => `M0 ${i + 1}H${columns}`,
          ),
        ].join(" ")
      : "";
    body = `<div class="rectangle-diagram" role="img" aria-label="${grid ? `${rows}行${columns}列单位格，每格1平方厘米` : "长方形示意图，不按比例"}"><span>${esc(d.widthLabel || "")}</span><svg ${grid ? `data-columns="${columns}" data-rows="${rows}"` : ""} viewBox="-0.1 -0.1 ${columns + 0.2} ${rows + 0.2}" style="aspect-ratio:${columns}/${rows}" aria-hidden="true"><rect width="${columns}" height="${rows}" fill="#fff" stroke="#28746b" stroke-width="0.07"/>${lines ? `<path d="${lines}" fill="none" stroke="#6b9180" stroke-width="0.035"/>` : ""}</svg><b>${esc(d.heightLabel || "")}</b></div>`;
  } else if (kind === "sequence") {
    body = `<div class="sequence-diagram" aria-label="排列">${(Array.isArray(
      d.items,
    )
      ? d.items
      : []
    )
      .slice(0, 12)
      .map((x) => `<span>${esc(x)}</span>`)
      .join("")}</div>`;
  } else if (kind === "table") {
    const heads = (Array.isArray(d.headers) ? d.headers : []).slice(0, 8),
      rows = (Array.isArray(d.rows) ? d.rows : []).slice(0, 12);
    body = `<table class="student-table"><thead><tr>${heads.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${heads.map((_, i) => `<td>${esc(Array.isArray(row) ? row[i] : "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  } else if (kind === "clock") {
    const h = clampInt(d.hour, 1, 12),
      m = clampInt(d.minute, 0, 59),
      ha = (h % 12) * 30 + m / 2,
      ma = m * 6;
    body = `<div class="clock-diagram" role="img" aria-label="钟面示意：${h}时${m}分"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" fill="#fffdf4" stroke="#28746b" stroke-width="2"/>${Array.from({ length: 12 }, (_, i) => `<path d="M50 8V14" stroke="#536c60" stroke-width="2" transform="rotate(${i * 30} 50 50)"/>`).join("")}<path d="M50 50V27" stroke="#234e49" stroke-width="4" stroke-linecap="round" transform="rotate(${ha} 50 50)"/><path d="M50 50V17" stroke="#e58164" stroke-width="2" stroke-linecap="round" transform="rotate(${ma} 50 50)"/><circle cx="50" cy="50" r="3" fill="#234e49"/></svg><small>${h}:${String(m).padStart(2, "0")}</small></div>`;
  } else {
    const parts = clampInt(d.parts, 1, 16),
      shaded = clampInt(d.shaded, 0, parts);
    body = `<div class="fraction-diagram" role="img" aria-label="${shaded}份着色，共${parts}份">${Array.from({ length: parts }, (_, i) => `<i class="${i < shaded ? "shaded" : ""}"></i>`).join("")}</div>`;
  }
  return `<div class="student-diagram diagram-${kind}">${body}</div>`;
}
export function renderStudentBlocks(question = {}) {
  const blocks = question?.student?.blocks;
  if (!Array.isArray(blocks))
    return `<div class="student-blocks"><p>${esc(question?.prompt || "")}</p></div>`;
  return `<div class="student-blocks">${blocks
    .map((b) => {
      if (!b || typeof b !== "object") return "";
      if (b.type === "text") return `<p>${esc(b.text)}</p>`;
      if (b.type === "equation")
        return `<p class="student-equation">${esc(b.text)}</p>`;
      if (b.type === "diagram") return diagram(b.kind, b.data);
      return "";
    })
    .join("")}</div>`;
}
export function adaptLegacyQuestion(question = {}) {
  const q = toQuestionV2(question);
  if (!q.student)
    q.student = {
      blocks: [{ type: "text", text: String(q.prompt || "") }],
      tasks: [
        {
          id: "answer",
          label: "我的答案",
          kind: Array.isArray(q.choices) ? "choice" : "number",
          ...(Array.isArray(q.choices) ? { options: q.choices } : {}),
        },
      ],
    };
  if (!q.answerSpec)
    q.answerSpec = Array.isArray(q.choices)
      ? { kind: "choice", value: String(q.answer || "") }
      : { kind: "scalar", value: String(q.answer || "") };
  if (!Array.isArray(q.student.tasks) || !q.student.tasks.length)
    q.student = {
      ...q.student,
      tasks: [
        {
          id: "answer",
          label:
            q.answerSpec.manual || q.answerSpec.kind === "rubric"
              ? "请作答"
              : "我的答案",
          kind:
            q.answerSpec.manual || q.answerSpec.kind === "rubric"
              ? "manual"
              : q.answerSpec.kind === "choice"
                ? "choice"
                : "number",
          ...(q.answerSpec.kind === "choice"
            ? { options: q.choices || [] }
            : {}),
        },
      ],
    };
  return q;
}
export function renderAnswerControls(
  question,
  index,
  values = {},
  statuses = {},
) {
  const q = adaptLegacyQuestion(question),
    tasks = q.student.tasks || [],
    labels = {
      correct: "本小问正确",
      incorrect: "本小问再试试",
      partial: "部分完成",
      manual: "等待人工核阅",
      unanswered: "尚未作答",
    };
  return tasks
    .map((task) => {
      const id = String(task.id || "answer"),
        name = `answer-${index}-${esc(id)}`,
        value = values[id] ?? "",
        part =
          typeof statuses[id] === "string"
            ? statuses[id]
            : statuses[id]?.status || "";
      let control = "";
      if (task.kind === "manual" || (q.answerSpec?.manual && tasks.length <= 1))
        control = `<fieldset class="answer-task manual-task" data-task-id="${esc(id)}"><legend>${esc(task.label || "请作答")}</legend><textarea name="${name}" aria-label="${esc(task.label || "请作答")}" rows="3">${esc(value)}</textarea><small>此项等待人工核阅</small></fieldset>`;
      else if (task.kind === "choice")
        control = `<fieldset class="answer-task" data-task-id="${esc(id)}"><legend>${esc(task.label || "请选择")}</legend>${(task.options || q.choices || []).map((o, j) => `<label><input type="radio" name="${name}" value="${esc(o.key)}" ${value === o.key ? "checked" : ""}><b>${esc(o.key || String.fromCharCode(65 + j))}</b> ${esc(o.text)}</label>`).join("")}</fieldset>`;
      else {
        const unit =
          task.unit || (tasks.length === 1 ? q.answerSpec?.unit : "");
        const placeholder =
          q.answerSpec?.kind === "tuple" ? "用逗号分隔各部分" : "";
        control = `<label class="answer-task" data-task-id="${esc(id)}">${esc(task.label || "我的答案")}<input id="${id === "answer" ? `answer-${index}` : `answer-${index}-${esc(id)}`}" class="answer-input" type="text" inputmode="${task.kind === "number" ? "decimal" : "text"}" placeholder="${placeholder}" name="${name}" aria-label="${esc(task.label || "我的答案")}" value="${esc(value)}" autocomplete="off">${unit ? `<span class="answer-unit">${esc(unit)}</span>` : ""}</label>`;
      }
      return `<div class="answer-part" data-part-id="${esc(id)}"${part ? ` data-part-status="${esc(part)}"` : ""}>${control}${part ? `<span class="part-status" role="status">${esc(labels[part] || part)}</span>` : ""}</div>`;
    })
    .join("");
}
export function renderPrintQuestion(question, index, options = {}) {
  const q = adaptLegacyQuestion(question),
    num = Number(options.ordinal ?? index + 1);
  const oral=options.style==='compact'&&q.layout?.workspaceKind==='short'&&q.student.tasks.length===1&&!['choice','manual'].includes(q.student.tasks[0].kind)&&q.student.blocks.every(b=>['text','equation'].includes(b.type))&&/^(?:\d+|□)\s*[＋－×÷]/.test(q.prompt||'');
  if(oral)return `<article class="print-question oral-question" data-grade="${esc(q.grade)}" data-question-id="${esc(q.id||`question-${index}`)}" data-ordinal="${num}"><p class="print-meta">第 ${num} 题</p><div class="print-prompt">${renderStudentBlocks(q)}</div></article>`;
  const space = Math.max(
      0,
      Number(q.layout?.minWritingMm) || Number(options.minWritingMm) || 18,
    ),
    unit = q.answerSpec.kind === "quantity" ? q.answerSpec.unit : "";
  return `<article class="print-question" data-grade="${esc(q.grade)}" data-question-id="${esc(q.id || `question-${index}`)}" data-ordinal="${num}" style="--writing-mm:${space}mm"><p class="print-meta">第 ${num} 题 · ${esc(q.topicName || "数学练习")}</p><div class="print-prompt">${renderStudentBlocks(q)}</div><div class="print-response">${(q.student.tasks || []).map((t) => `<div class="print-task" data-task-id="${esc(t.id)}">${esc(t.label || "作答")}${(t.unit || unit) && !String(t.label||'').includes(t.unit||unit) ? `（${esc(t.unit || unit)}）` : ""}：${t.kind === "choice" ? `<div class="print-choices">${(t.options || q.choices || []).map((o) => `<p>${['yes','no'].includes(o.key)?'□':`${esc(o.key)}.`} ${esc(o.text)}</p>`).join("")}</div>` : ""}${t.kind === "manual" ? '<div class="manual-space"></div>' : t.kind === 'choice' ? '' : '<span class="answer-rule"></span>'}</div>`).join("")}${(q.student.tasks||[]).some(t=>t.kind==='manual')?'':'<div class="writing-room" aria-label="书写空间"></div>'}</div>${options.includeAnswers ? `<p class="print-reference">参考：${esc(q.answer ?? "")} ${esc(q.explanation ?? "")}</p>` : ""}</article>`;
}
export function renderTeacherAnswer(question, index, options = {}) {
  const q = adaptLegacyQuestion(question),
    num = index + 1,
    manual =
      q.answerSpec?.manual ||
      (q.student.tasks || []).some((t) => t.kind === "manual");
  const display = (spec, task = {}) => {
    if (spec?.manual || spec?.kind === "rubric") return "等待人工核阅";
    if (spec?.kind === "choice") {
      const option = (task.options || q.choices || []).find(
        (o) => String(o.key) === String(spec.value),
      );
      return option?.text ?? String(spec.value ?? "");
    }
    if (spec?.kind === "quantity")
      return `${spec.value} ${spec.unit || task.unit || ""}`.trim();
    if (spec?.kind === "tuple")
      return (spec.items || spec.values || [])
        .map((x) => (typeof x === "object" ? display(x) : String(x)))
        .join("，");
    return String(spec?.value ?? q.answer ?? "");
  };
  const parts =
    q.answerSpec.kind === "multipart"
      ? q.answerSpec.parts.map((p) => {
          const task = q.student.tasks.find((t) => t.id === p.id) || {
            label: p.id,
          };
          return `${task.label || p.id}：${display(p.spec, task)}`;
        })
      : [display(q.answerSpec, q.student.tasks[0])];
  return `<article class="print-question teacher-answer-item" data-question-id="${esc(q.id || `question-${index}`)}" data-ordinal="${num}"><p class="print-meta">第 ${num} 题 · ${esc(q.topicName || "数学练习")}</p><div class="teacher-part-answers">${parts.map((p) => `<p>${esc(p)}</p>`).join("")}</div>${options.detailed !== false ? `<p class="teacher-explanation">${esc(q.explanation || q.solution?.steps?.join("；") || "")}</p>` : ""}${manual ? '<p class="manual-notice">理由或绘图需人工核阅；自动部分不代表整题完全正确。</p>' : ""}</article>`;
}
