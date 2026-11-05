"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  KedgeView: () => KedgeView,
  PRIORITY_LABELS: () => PRIORITY_LABELS,
  VIEW_TYPE_KEDGE: () => VIEW_TYPE_KEDGE,
  addMonths: () => addMonths,
  appendReply: () => appendReply,
  applyOrder: () => applyOrder,
  byOrder: () => byOrder,
  default: () => KedgePlugin,
  filterLessons: () => filterLessons,
  formatDate: () => formatDate,
  fuzzyScore: () => fuzzyScore,
  hasArrived: () => hasArrived,
  idFromTitle: () => idFromTitle,
  isSnoozed: () => isSnoozed,
  lessonNote: () => lessonNote,
  localDate: () => localDate,
  nextStepNote: () => nextStepNote,
  nowStr: () => nowStr,
  parseFrontmatter: () => parseFrontmatter,
  priorityFromLabel: () => priorityFromLabel,
  priorityLabel: () => priorityLabel,
  serializeFrontmatter: () => serializeFrontmatter,
  setFrontmatterKeys: () => setFrontmatterKeys,
  wireReorder: () => wireReorder,
  yamlScalar: () => yamlScalar
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  letterFolder: "Kedge/Letters",
  nextStepFolder: "Kedge/Next-Steps",
  lessonFolder: "Kedge/Lessons"
};
function localDate(date = /* @__PURE__ */ new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function nowStr() {
  return localDate();
}
function idFromTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
var PRIORITY_LABELS = ["highest", "high", "medium", "low", "lowest"];
function priorityLabel(priority) {
  const index = Math.min(Math.max(Math.round(priority) || 3, 1), 5) - 1;
  return PRIORITY_LABELS[index];
}
function priorityFromLabel(label) {
  const index = PRIORITY_LABELS.indexOf(label);
  return index === -1 ? 3 : index + 1;
}
var FRONTMATTER = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(\r?\n|$)/;
function parseFrontmatter(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return {};
  const obj = {};
  for (const line of match[2].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    obj[key] = unquote(line.slice(idx + 1).trim());
  }
  return obj;
}
function yamlScalar(value) {
  if (typeof value === "number") return String(value);
  const v = String(value);
  if (v === "") return '""';
  const unsafe = /^\s|\s$/.test(v) || /:\s|:$/.test(v) || /(^|\s)#/.test(v) || /^[-?:,[\]{}&*!|>'"%@`]/.test(v) || /^(true|false|null|yes|no|on|off|~)$/i.test(v) || /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v);
  return unsafe ? JSON.stringify(v) : v;
}
function unquote(raw) {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
        return String(parsed);
      }
    } catch {
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}
function serializeFrontmatter(obj) {
  const lines = Object.entries(obj).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  return `---
${lines.join("\n")}
---
`;
}
function setFrontmatterKeys(text, patch) {
  const match = FRONTMATTER.exec(text);
  if (!match) {
    const lines = Object.entries(patch).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
    return `---
${lines.join("\n")}
---
${text}`;
  }
  const [, open, block, close] = match;
  const eol = open.includes("\r\n") ? "\r\n" : "\n";
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const line of block.length ? block.split(/\r?\n/) : []) {
    const idx = line.indexOf(":");
    const key = idx <= 0 ? "" : line.slice(0, idx).trim();
    if (!key || !(key in patch)) {
      out.push(line);
      continue;
    }
    seen.add(key);
    const value = patch[key];
    if (value !== null) out.push(`${key}: ${yamlScalar(value)}`);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || seen.has(key)) continue;
    out.push(`${key}: ${yamlScalar(value)}`);
  }
  return `${open}${out.join(eol)}${close}${eol}${text.slice(match[0].length)}`;
}
function nextStepNote(title, priority, id, date = nowStr()) {
  return serializeFrontmatter({ id, title, status: "pending", priority, created_at: date });
}
function lessonNote(claim, category, id, date = nowStr()) {
  return serializeFrontmatter({ id, claim, category, week: date, created_at: date });
}
function appendReply(raw, text, date = nowStr()) {
  const sep = raw.endsWith("\n") ? "\n" : "\n\n";
  return raw + sep + `## Reply ${date}

${text}
`;
}
function bodyOf(text) {
  const match = FRONTMATTER.exec(text);
  return match ? text.slice(match[0].length) : text;
}
function splitNote(text) {
  const match = FRONTMATTER.exec(text);
  if (!match) return { head: "", body: text };
  return { head: `${match[1]}${match[2]}${match[3]}
`, body: text.slice(match[0].length) };
}
async function ensureFolder(app, path) {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    await app.vault.adapter.mkdir(path);
  }
}
function readAllMarkdown(app) {
  return app.vault.getMarkdownFiles();
}
function uniqueNotePath(app, folder, base) {
  const root = base || "untitled";
  let candidate = `${folder}/${root}.md`;
  let n = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${folder}/${root}-${n}.md`;
    n++;
  }
  return candidate;
}
async function uniqueId(app, folder, base) {
  const taken = /* @__PURE__ */ new Set();
  for (const f of readAllMarkdown(app)) {
    if (!f.path.startsWith(folder)) continue;
    const fm = parseFrontmatter(await app.vault.cachedRead(f));
    taken.add(String(fm.id ?? idFromTitle(f.basename)));
  }
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
async function loadLetters(app, folder) {
  const files = readAllMarkdown(app);
  const letters = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status) continue;
    letters.push({
      id: String(fm.id ?? idFromTitle(f.basename)),
      title: String(fm.title ?? f.basename),
      body: bodyOf(text).trim(),
      status: fm.status === "delivered" || fm.status === "opened" || fm.status === "sealed" ? fm.status : "sealed",
      sealDate: String(fm.seal_date ?? nowStr()),
      createdAt: String(fm.created_at ?? nowStr()),
      path: f.path
    });
  }
  return letters;
}
async function loadNextSteps(app, folder) {
  const files = readAllMarkdown(app);
  const steps = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status) continue;
    steps.push({
      id: String(fm.id ?? idFromTitle(f.basename)),
      title: String(fm.title ?? f.basename),
      status: fm.status === "pending" || fm.status === "working" || fm.status === "snoozed" || fm.status === "done" ? fm.status : "pending",
      priority: Number(fm.priority ?? 3),
      snoozeUntil: fm.snooze_until == null ? null : String(fm.snooze_until),
      createdAt: String(fm.created_at ?? nowStr()),
      order: fm.order != null ? Number(fm.order) : null,
      path: f.path
    });
  }
  return steps;
}
async function loadLessons(app, folder) {
  const files = readAllMarkdown(app);
  const lessons = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.claim) continue;
    lessons.push({
      id: String(fm.id ?? idFromTitle(f.basename)),
      claim: String(fm.claim),
      category: String(fm.category ?? ""),
      week: String(fm.week ?? nowStr()),
      createdAt: String(fm.created_at ?? nowStr()),
      order: fm.order != null ? Number(fm.order) : null,
      path: f.path
    });
  }
  return lessons;
}
async function saveNote(app, path, content) {
  await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof import_obsidian.TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(path, content);
  }
}
function isSnoozed(step, today = nowStr()) {
  return step.status === "snoozed" && (!step.snoozeUntil || step.snoozeUntil > today);
}
function hasArrived(letter, today = nowStr()) {
  if (letter.status === "delivered" || letter.status === "opened") return true;
  return letter.status === "sealed" && letter.sealDate <= today;
}
function addMonths(months, from = nowStr()) {
  const [year, month, day] = from.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return target.toISOString().slice(0, 10);
}
var MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}
function fuzzyScore(text, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const haystack = text.toLowerCase();
  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    const wordStart = direct === 0 || /[\s\-_/]/.test(haystack[direct - 1]);
    return 1e3 - direct + (wordStart ? 100 : 0);
  }
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of needle) {
    const found = haystack.indexOf(char, from);
    if (found === -1) return -1;
    score += 10;
    if (found === previous + 1) score += 5;
    if (found === 0 || /[\s\-_/]/.test(haystack[found - 1])) score += 5;
    score -= Math.min(found - from, 5);
    previous = found;
    from = found + 1;
  }
  return score;
}
function filterLessons(lessons, query) {
  if (!query.trim()) return lessons;
  return lessons.map((lesson) => {
    const claim = fuzzyScore(lesson.claim, query);
    const category = fuzzyScore(lesson.category ?? "", query);
    const score = Math.max(claim, category >= 0 ? category - 200 : -1);
    return { lesson, score };
  }).filter((entry) => entry.score >= 0).sort((a, b) => b.score - a.score).map((entry) => entry.lesson);
}
function byOrder(a, b) {
  if (a.order != null && b.order != null) return a.order - b.order;
  if (a.order != null) return -1;
  if (b.order != null) return 1;
  return 0;
}
async function applyOrder(app, folder, orderedIds) {
  const files = readAllMarkdown(app);
  const byId = /* @__PURE__ */ new Map();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = parseFrontmatter(await app.vault.cachedRead(f));
    byId.set(String(fm.id ?? idFromTitle(f.basename)), f);
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const file = byId.get(orderedIds[i]);
    if (!file) continue;
    const text = await app.vault.cachedRead(file);
    await app.vault.modify(file, setFrontmatterKeys(text, { order: i + 1 }));
  }
}
function wireReorder(items, onReorder) {
  const ids = items.map((i) => i.id);
  let dragId = null;
  let hoverId = null;
  const hasClass = (node, cls) => {
    if (typeof node !== "object" || node === null) return false;
    const n = node;
    if (typeof n.classList?.contains === "function") return n.classList.contains(cls);
    return typeof n.hasClass === "function" && n.hasClass(cls);
  };
  const closestClass = (node, cls) => {
    let cur = node;
    while (cur) {
      if (hasClass(cur, cls)) return cur;
      const n = cur;
      cur = n.parentNode ?? n.parent ?? null;
    }
    return null;
  };
  const cardFor = (node) => {
    let cur = node;
    while (cur) {
      const found = items.find((i) => i.el === cur);
      if (found) return found;
      const n = cur;
      cur = n.parentNode ?? n.parent ?? null;
    }
    return null;
  };
  const cardUnder = (evt) => {
    const doc = typeof document === "undefined" ? null : document;
    const x = evt?.clientX;
    const y = evt?.clientY;
    const at = doc && typeof doc.elementFromPoint === "function" && typeof x === "number" && typeof y === "number" ? doc.elementFromPoint(x, y) : null;
    return cardFor(at ?? evt?.target ?? null);
  };
  const markTarget = (card) => {
    hoverId = card && card.id !== dragId ? card.id : null;
    for (const item of items) {
      if (item.id === hoverId) item.el.addClass("kedge-drop-target");
      else item.el.removeClass("kedge-drop-target");
    }
  };
  const settle = (commit) => {
    const moved = dragId;
    const target = hoverId;
    dragId = null;
    markTarget(null);
    for (const item of items) item.el.removeClass("kedge-dragging");
    if (!commit || !moved || !target || moved === target || !ids.includes(moved)) return;
    const next = ids.filter((id) => id !== moved);
    next.splice(next.indexOf(target), 0, moved);
    void onReorder(next);
  };
  for (const item of items) {
    const el = item.el;
    el.addEventListener("pointerdown", (evt) => {
      if (dragId) return;
      if (typeof evt.button === "number" && evt.button !== 0) return;
      const fromGrip = closestClass(evt.target, "kedge-grip") !== null;
      if (evt.pointerType === "touch" && !fromGrip) return;
      if (!fromGrip) {
        if (closestClass(evt.target, "kedge-actions")) return;
        const target = evt.target;
        if (target && typeof target.closest === "function" && target.closest("input, textarea, select, a, button")) return;
      }
      dragId = item.id;
      el.addClass("kedge-dragging");
      try {
        const element = el;
        element.setPointerCapture?.(evt.pointerId);
      } catch {
      }
      evt.preventDefault();
    });
    el.addEventListener("pointermove", (evt) => {
      if (!dragId) return;
      evt.preventDefault();
      markTarget(cardUnder(evt));
    });
    el.addEventListener("pointerup", () => {
      if (dragId) settle(true);
    });
    el.addEventListener("pointercancel", () => {
      if (dragId) settle(false);
    });
  }
}
function fieldWrap(parent, label) {
  const wrap = parent.createDiv({ cls: "kedge-field" });
  wrap.createEl("label", { cls: "kedge-field-label", text: label });
  return wrap;
}
function fieldHint(wrap, text) {
  wrap.createDiv({ cls: "kedge-field-hint", text });
}
function textField(parent, label, opts = {}) {
  const wrap = fieldWrap(parent, label);
  const input = wrap.createEl("input", { cls: "kedge-input" });
  input.type = opts.type ?? "text";
  input.placeholder = opts.placeholder ?? "";
  if (opts.value) input.value = opts.value;
  if (opts.hint) fieldHint(wrap, opts.hint);
  return input;
}
function textareaField(parent, label, opts = {}) {
  const wrap = fieldWrap(parent, label);
  const ta = wrap.createEl("textarea", {
    cls: opts.tall ? "kedge-textarea kedge-textarea-tall" : "kedge-textarea"
  });
  ta.placeholder = opts.placeholder ?? "";
  if (opts.hint) fieldHint(wrap, opts.hint);
  return ta;
}
function segmentedField(parent, label, options, value, hint) {
  const wrap = fieldWrap(parent, label);
  const group = wrap.createDiv({ cls: "kedge-segmented" });
  let current = value;
  const buttons = options.map((option) => {
    const button = group.createEl("button", { cls: "kedge-segment", text: option });
    button.type = "button";
    if (option === value) button.addClass("is-active");
    button.onclick = () => {
      current = option;
      for (const other of buttons) {
        if (other === button) other.addClass("is-active");
        else other.removeClass("is-active");
      }
    };
    return button;
  });
  if (hint) fieldHint(wrap, hint);
  return { getValue: () => current };
}
function modalActions(parent, primaryLabel, onPrimary, onCancel) {
  const row = parent.createDiv({ cls: "kedge-modal-actions" });
  const cancel = row.createEl("button", { cls: "kedge-btn", text: "Cancel" });
  const primary = row.createEl("button", {
    cls: "kedge-btn kedge-btn-primary",
    text: primaryLabel
  });
  cancel.onclick = onCancel;
  primary.onclick = onPrimary;
}
function applyModalClass(modal) {
  modal.modalEl.addClass("kedge-modal");
}
var NextStepModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onDone, existing) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }
  onOpen() {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.existing ? "Edit next step" : "New next step" });
    this.titleEl = textField(contentEl, "Step", {
      placeholder: "What is the next concrete step?",
      hint: "One concrete thing you can do next.",
      value: this.existing?.title
    });
    this.priorityChoice = segmentedField(
      contentEl,
      "Priority",
      PRIORITY_LABELS,
      priorityLabel(this.existing?.priority ?? 3)
    );
    this.titleEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") void this.save();
    });
    modalActions(
      contentEl,
      this.existing ? "Save" : "Create",
      () => void this.save(),
      () => this.close()
    );
    this.titleEl.focus();
  }
  async save() {
    const title = this.titleEl.value.trim();
    if (!title) {
      new import_obsidian.Notice("Give the step a title.");
      return;
    }
    const { app, settings } = this.plugin;
    const priority = priorityFromLabel(this.priorityChoice.getValue());
    const existing = this.existing;
    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof import_obsidian.TFile)) {
        new import_obsidian.Notice("Step file not found.");
        return;
      }
      const raw = await app.vault.cachedRead(file);
      await app.vault.modify(file, setFrontmatterKeys(raw, { title, priority }));
      new import_obsidian.Notice("Next step updated.");
    } else {
      const id = await uniqueId(
        app,
        settings.nextStepFolder,
        idFromTitle(title) || `step-${nowStr()}`
      );
      const path = uniqueNotePath(app, settings.nextStepFolder, id);
      await saveNote(app, path, nextStepNote(title, priority, id));
      new import_obsidian.Notice("Next step created.");
    }
    this.close();
    await this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var LessonModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onDone, existing) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }
  onOpen() {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.existing ? "Edit lesson" : "New lesson" });
    this.claimEl = textField(contentEl, "Lesson", {
      placeholder: "The lesson in one line",
      hint: "One line you want to remember.",
      value: this.existing?.claim
    });
    this.categoryEl = textField(contentEl, "Category", {
      placeholder: "e.g. product, hiring, health",
      hint: "Optional.",
      value: this.existing?.category
    });
    this.claimEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") void this.save();
    });
    modalActions(
      contentEl,
      this.existing ? "Save" : "Create",
      () => void this.save(),
      () => this.close()
    );
    this.claimEl.focus();
  }
  async save() {
    const claim = this.claimEl.value.trim();
    if (!claim) {
      new import_obsidian.Notice("A lesson needs a line.");
      return;
    }
    const category = this.categoryEl.value.trim();
    const { app, settings } = this.plugin;
    const existing = this.existing;
    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof import_obsidian.TFile)) {
        new import_obsidian.Notice("Lesson file not found.");
        return;
      }
      const raw = await app.vault.cachedRead(file);
      await app.vault.modify(file, setFrontmatterKeys(raw, { claim, category }));
      new import_obsidian.Notice("Lesson updated.");
    } else {
      const id = await uniqueId(
        app,
        settings.lessonFolder,
        idFromTitle(claim) || `lesson-${nowStr()}`
      );
      const path = uniqueNotePath(app, settings.lessonFolder, id);
      await saveNote(app, path, lessonNote(claim, category, id));
      new import_obsidian.Notice("Lesson saved.");
    }
    this.close();
    await this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ReplyModal = class extends import_obsidian.Modal {
  constructor(app, plugin, letter, onDone) {
    super(app);
    this.plugin = plugin;
    this.letter = letter;
    this.onDone = onDone;
  }
  onOpen() {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Reply to past you" });
    const preview = contentEl.createDiv({ cls: "kedge-letter-preview" });
    preview.createDiv({
      cls: "kedge-meta",
      text: `${this.letter.title} \xB7 sealed ${this.letter.sealDate} \xB7 written ${this.letter.createdAt}`
    });
    preview.createDiv({ cls: "kedge-letter-body", text: this.letter.body });
    this.bodyEl = textareaField(contentEl, "Your reply", {
      placeholder: "What does the person reading this letter now want to say back?",
      tall: true
    });
    modalActions(contentEl, "Save reply", () => void this.save(), () => this.close());
    this.bodyEl.focus();
  }
  async save() {
    const text = this.bodyEl.value.trim();
    if (!text) {
      new import_obsidian.Notice("Write something first.");
      return;
    }
    const { app } = this.plugin;
    const file = app.vault.getAbstractFileByPath(this.letter.path);
    if (!(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice("Letter file not found.");
      return;
    }
    const raw = await app.vault.cachedRead(file);
    await app.vault.modify(file, appendReply(raw, text));
    new import_obsidian.Notice("Reply saved to the letter.");
    this.close();
    await this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var QUICK_SCHEDULE = [
  ["1 month", 1],
  ["6 months", 6],
  ["1 year", 12]
];
var LetterModal = class extends import_obsidian.Modal {
  constructor(app, plugin, onDone, existing) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }
  onOpen() {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: this.existing ? "Edit letter to future me" : "Letter to future me"
    });
    this.titleEl = textField(contentEl, "Title", {
      placeholder: "Dear future me\u2026",
      value: this.existing?.title
    });
    const quick = fieldWrap(contentEl, "Bring it back in");
    const chips = quick.createDiv({ cls: "kedge-segmented" });
    for (const [label, months] of QUICK_SCHEDULE) {
      const chip = chips.createEl("button", { cls: "kedge-segment", text: label });
      chip.type = "button";
      chip.onclick = () => {
        this.dateEl.value = addMonths(months);
        this.updatePreview();
      };
    }
    this.dateEl = textField(contentEl, "Or pick a date", {
      type: "date",
      value: this.existing?.sealDate ?? addMonths(6)
    });
    this.dateEl.addEventListener("input", () => this.updatePreview());
    this.bodyEl = textareaField(contentEl, "Letter", {
      placeholder: "Write notes for your future self, not for an audience.",
      tall: true
    });
    if (this.existing) this.bodyEl.value = this.existing.body;
    this.previewEl = contentEl.createDiv({ cls: "kedge-field-hint" });
    this.updatePreview();
    modalActions(
      contentEl,
      this.existing ? "Save" : "Seal it",
      () => void this.save(),
      () => this.close()
    );
    this.titleEl.focus();
  }
  updatePreview() {
    const date = this.dateEl.value.trim();
    this.previewEl.setText(
      date ? `Will come back on ${formatDate(date)}` : "Pick a date to bring it back."
    );
  }
  async save() {
    const title = this.titleEl.value.trim() || "Untitled letter";
    const sealDate = this.dateEl.value.trim() || nowStr();
    const body = this.bodyEl.value;
    const existing = this.existing;
    const { app, settings } = this.plugin;
    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof import_obsidian.TFile)) {
        new import_obsidian.Notice("Letter file not found.");
        return;
      }
      const raw = await app.vault.cachedRead(file);
      const { head } = splitNote(setFrontmatterKeys(raw, { title, seal_date: sealDate }));
      await saveNote(app, existing.path, head + body);
      new import_obsidian.Notice(`Letter saved. Returns ${sealDate}.`);
    } else {
      const id = await uniqueId(
        app,
        settings.letterFolder,
        idFromTitle(title) || `letter-${Date.now()}`
      );
      const path = uniqueNotePath(app, settings.letterFolder, id);
      const fm = serializeFrontmatter({
        id,
        title,
        status: "sealed",
        seal_date: sealDate,
        created_at: nowStr()
      });
      await saveNote(app, path, fm + body);
      new import_obsidian.Notice(`Letter sealed. Returns ${sealDate}.`);
    }
    this.close();
    await this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var VIEW_TYPE_KEDGE = "kedge-dashboard";
var KedgeView = class extends import_obsidian.View {
  constructor(leaf, plugin) {
    super(leaf);
    this.lessonQuery = "";
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_KEDGE;
  }
  getDisplayText() {
    return "Kedge";
  }
  async onOpen() {
    this.container = this.containerEl;
    this.container.empty();
    this.container.addClass("kedge-view");
    await this.plugin.refreshDashboards();
  }
  async render() {
    try {
      await this.renderBody();
    } catch (err) {
      new import_obsidian.Notice("Kedge render failed: " + err.message);
    }
  }
  /** Title row that leaves space for section-level actions. */
  sectionHead(parent, title) {
    const head = parent.createDiv({ cls: "kedge-section-head" });
    head.createEl("h2", { text: title });
    return head.createDiv({ cls: "kedge-actions" });
  }
  /**
   * One `⋯` on the right of a row, holding that row's actions.
   *
   * It is Obsidian's own Menu rather than a popover of ours: the menu flips
   * itself near a screen edge, and on the phone it becomes a sheet instead of
   * a clipped box. The label is written once here so a row and its actions
   * cannot drift apart.
   */
  actionMenu(parent, label, items) {
    const button = parent.createEl("button", { cls: "kedge-menu-button", text: "\u22EF" });
    button.setAttribute("aria-label", label);
    button.onclick = (evt) => {
      const menu = new import_obsidian.Menu();
      for (const item of items) {
        menu.addItem(
          (entry) => entry.setTitle(item.title).setIcon(item.icon).onClick(() => item.run())
        );
      }
      menu.showAtMouseEvent(evt);
    };
    return button;
  }
  /**
   * Everything a step can do. What is on the menu is a function of state, so
   * the two can never disagree: a snoozed step offers the way back, everything
   * else offers the way forward.
   *
   * A snoozed step still cannot be edited or finished until it has been brought
   * back, which is why "Unsnooze" stands alone rather than joining Edit and Done.
   */
  stepMenu(parent, step) {
    const after = (fn) => async () => {
      await fn();
      await this.plugin.refreshDashboards();
    };
    const items = isSnoozed(step) ? [
      {
        title: "Unsnooze",
        icon: "clock",
        run: after(() => this.unsnoozeStep(step.id))
      }
    ] : [
      { title: "Edit", icon: "pencil", run: () => {
        this.openEditStepModal(step);
        return Promise.resolve();
      } },
      { title: "Snooze", icon: "clock", run: after(() => this.snoozeStep(step.id)) },
      { title: "Done", icon: "check", run: after(() => this.markStepDone(step.id)) }
    ];
    this.actionMenu(parent, "Step actions", items);
  }
  async renderBody() {
    const { app, settings } = this.plugin;
    this.container.empty();
    const header = this.container.createDiv({ cls: "kedge-section" });
    header.createEl("h2", { text: "\u2693 Kedge" });
    const steps = await loadNextSteps(app, settings.nextStepFolder);
    const pending = steps.filter((s) => s.status !== "done" && !isSnoozed(s));
    pending.sort(
      (a, b) => byOrder(a, b) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)
    );
    const bestSection = this.container.createDiv({ cls: "kedge-section" });
    this.sectionHead(bestSection, "Next best step");
    if (pending.length > 0) {
      const best = pending[0];
      const card = bestSection.createDiv({ cls: "kedge-card" });
      const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
      head.createSpan({ text: best.title });
      this.stepMenu(head, best);
      card.createDiv({ cls: "kedge-card-body", text: "Do this now. Everything else can wait." });
    } else {
      const empty = bestSection.createDiv({ cls: "kedge-empty" });
      empty.createDiv({ text: "No pending next steps." });
      const actions = empty.createDiv({ cls: "kedge-actions" });
      const newBtn = actions.createEl("button", { cls: "mod-clickable", text: "New next step" });
      newBtn.onclick = () => this.openNewStepModal();
    }
    const letters = await loadLetters(app, settings.letterFolder);
    const arrived = letters.filter((l) => hasArrived(l)).sort((a, b) => b.sealDate.localeCompare(a.sealDate));
    const scheduled = letters.filter((l) => !hasArrived(l)).sort((a, b) => a.sealDate.localeCompare(b.sealDate));
    const pastSection = this.container.createDiv({ cls: "kedge-section" });
    this.sectionHead(pastSection, "From past you");
    if (arrived.length > 0) {
      for (const letter of arrived) {
        const card = pastSection.createDiv({ cls: "kedge-card" });
        const titleDiv = card.createDiv({ cls: "kedge-card-title" });
        titleDiv.createSpan({ text: letter.title });
        titleDiv.createSpan({ cls: "seal-badge", text: `sealed ${formatDate(letter.sealDate)}` });
        card.createDiv({ cls: "kedge-letter-body", text: letter.body });
        const meta = card.createDiv({ cls: "kedge-meta" });
        meta.createSpan({ text: `Written ${letter.createdAt}` });
        const actions = card.createDiv({ cls: "kedge-actions" });
        const replyBtn = actions.createEl("button", { cls: "mod-clickable", text: "Reply to past me" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable kedge-danger",
          text: "Delete"
        });
        replyBtn.onclick = () => this.openReplyModal(letter);
        deleteBtn.onclick = async () => {
          await this.deleteLetter(letter);
          await this.plugin.refreshDashboards();
        };
      }
    } else {
      pastSection.createDiv({ cls: "kedge-empty", text: "No letters have arrived yet." });
    }
    const scheduledSection = this.container.createDiv({ cls: "kedge-section" });
    const scheduledHead = this.sectionHead(scheduledSection, "Scheduled letters");
    const newLetterBtn = scheduledHead.createEl("button", {
      cls: "mod-clickable",
      text: "+ New letter"
    });
    newLetterBtn.onclick = () => this.openNewLetterModal();
    if (scheduled.length > 0) {
      for (const letter of scheduled) {
        const row = scheduledSection.createDiv({ cls: "kedge-letter-row" });
        row.title = `opens ${formatDate(letter.sealDate)} \xB7 written ${letter.createdAt}`;
        row.createDiv({ cls: "kedge-letter-row-title", text: letter.title });
        this.actionMenu(row, "Letter actions", [
          { title: "Edit", icon: "pencil", run: () => {
            this.openEditLetterModal(letter);
            return Promise.resolve();
          } },
          {
            title: "Delete",
            icon: "trash",
            run: async () => {
              await this.deleteLetter(letter);
              await this.plugin.refreshDashboards();
            }
          }
        ]);
      }
    } else {
      scheduledSection.createDiv({
        cls: "kedge-empty",
        text: "Nothing scheduled. Write a letter and pick when it comes back."
      });
    }
    const listSection = this.container.createDiv({ cls: "kedge-section" });
    const listActions = this.sectionHead(listSection, "Next steps");
    const newStepBtn = listActions.createEl("button", { cls: "mod-clickable", text: "+ New step" });
    newStepBtn.onclick = () => this.openNewStepModal();
    const openSteps = steps.filter((s) => s.status !== "done");
    const activeSteps = openSteps.filter((s) => !isSnoozed(s));
    const snoozedSteps = openSteps.filter((s) => isSnoozed(s));
    if (activeSteps.length > 0) {
      const ordered = this.sortSteps(activeSteps);
      const dragCards = [];
      for (const step of ordered) {
        const card = listSection.createDiv({ cls: "kedge-card kedge-draggable" });
        dragCards.push({ id: step.id, el: card });
        const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
        head.createSpan({ cls: "kedge-grip", text: "\u283F" });
        head.createSpan({ text: step.title });
        this.stepMenu(head, step);
        const meta = card.createDiv({ cls: "kedge-meta" });
        meta.createSpan({ text: `${priorityLabel(step.priority)} priority` });
        if (step.status === "working") {
          meta.createSpan({ text: " \xB7 working on it" });
        }
      }
      wireReorder(dragCards, (ids) => this.reorderSteps(ids));
    } else if (snoozedSteps.length === 0) {
      listSection.createDiv({ cls: "kedge-empty", text: "Nothing to do." });
    }
    if (snoozedSteps.length > 0) {
      listSection.createDiv({ cls: "kedge-subhead", text: "Snoozed" });
      for (const step of snoozedSteps) {
        const card = listSection.createDiv({ cls: "kedge-card kedge-snoozed" });
        const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
        head.createSpan({ text: step.title });
        this.stepMenu(head, step);
        const meta = card.createDiv({ cls: "kedge-meta" });
        meta.createSpan({
          text: step.snoozeUntil ? `snoozed until ${step.snoozeUntil}` : "snoozed"
        });
      }
    }
    const lessons = await loadLessons(app, settings.lessonFolder);
    const lessonSection = this.container.createDiv({ cls: "kedge-section" });
    const lessonActions = this.sectionHead(lessonSection, "Lessons");
    const newLessonBtn = lessonActions.createEl("button", { cls: "mod-clickable", text: "+ New lesson" });
    newLessonBtn.onclick = () => this.openNewLessonModal();
    const search = lessonSection.createEl("input", { cls: "kedge-search" });
    search.type = "search";
    search.placeholder = "Search your lessons";
    search.value = this.lessonQuery;
    const lessonList = lessonSection.createDiv({ cls: "kedge-lesson-list" });
    this.renderLessons(lessonList, lessons);
    search.addEventListener("input", () => {
      this.lessonQuery = search.value;
      this.renderLessons(lessonList, lessons);
    });
  }
  /** Filters in place, so typing costs no focus and no full dashboard render. */
  renderLessons(container, lessons) {
    container.empty();
    if (lessons.length === 0) {
      container.createDiv({ cls: "kedge-empty", text: "No lessons yet." });
      return;
    }
    const matches = filterLessons(this.sortLessons(lessons), this.lessonQuery);
    if (matches.length === 0) {
      container.createDiv({ cls: "kedge-empty", text: "No lesson matches that." });
      return;
    }
    const dragCards = [];
    for (const lesson of matches) {
      const card = container.createDiv({ cls: "kedge-card kedge-draggable" });
      dragCards.push({ id: lesson.id, el: card });
      const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
      head.createSpan({ cls: "kedge-grip", text: "\u283F" });
      head.createSpan({ cls: "kedge-claim", text: lesson.claim });
      this.actionMenu(head, "Lesson actions", [
        { title: "Edit", icon: "pencil", run: () => {
          this.openEditLessonModal(lesson);
          return Promise.resolve();
        } },
        {
          title: "Delete",
          icon: "trash",
          run: async () => {
            await this.deleteLesson(lesson);
            await this.plugin.refreshDashboards();
          }
        }
      ]);
      const meta = card.createDiv({ cls: "kedge-meta" });
      if (lesson.category) meta.createSpan({ text: lesson.category });
      if (lesson.week) meta.createSpan({ text: ` \xB7 ${lesson.week}` });
    }
    if (!this.lessonQuery.trim()) {
      wireReorder(dragCards, (ids) => this.reorderLessons(ids));
    }
  }
  // ---- modal launchers -------------------------------------------------
  openNewStepModal() {
    new NextStepModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }
  openNewLessonModal() {
    new LessonModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }
  openEditLessonModal(lesson) {
    new LessonModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), lesson).open();
  }
  openReplyModal(letter) {
    new ReplyModal(this.app, this.plugin, letter, () => this.plugin.refreshDashboards()).open();
  }
  openEditStepModal(step) {
    new NextStepModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), step).open();
  }
  openNewLetterModal() {
    new LetterModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }
  openEditLetterModal(letter) {
    new LetterModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), letter).open();
  }
  // ---- ordering --------------------------------------------------------
  sortSteps(list) {
    return list.slice().sort(
      (a, b) => byOrder(a, b) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)
    );
  }
  sortLessons(list) {
    return list.slice().sort((a, b) => byOrder(a, b) || b.createdAt.localeCompare(a.createdAt));
  }
  async reorderSteps(ids) {
    await applyOrder(this.plugin.app, this.plugin.settings.nextStepFolder, ids);
    await this.plugin.refreshDashboards();
  }
  async reorderLessons(ids) {
    await applyOrder(this.plugin.app, this.plugin.settings.lessonFolder, ids);
    await this.plugin.refreshDashboards();
  }
  // ---- note mutations --------------------------------------------------
  async deleteLesson(lesson) {
    const file = this.plugin.app.vault.getAbstractFileByPath(lesson.path);
    if (file instanceof import_obsidian.TFile) {
      await this.plugin.app.fileManager.trashFile(file);
      new import_obsidian.Notice("Lesson deleted.");
    }
  }
  async deleteLetter(letter) {
    const file = this.plugin.app.vault.getAbstractFileByPath(letter.path);
    if (file instanceof import_obsidian.TFile) {
      await this.plugin.app.fileManager.trashFile(file);
      new import_obsidian.Notice("Letter deleted.");
    }
  }
  /**
   * Patches one next step by id and leaves the rest of its note alone — a Done
   * click used to rewrite the whole frontmatter block from a lossy parse, which
   * cost the note its tags and its quoted values.
   */
  async patchStep(id, patch) {
    const { app, settings } = this.plugin;
    for (const f of readAllMarkdown(app)) {
      if (!f.path.startsWith(settings.nextStepFolder)) continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) !== id) continue;
      await app.vault.modify(f, setFrontmatterKeys(text, patch));
      return;
    }
  }
  async markStepDone(id) {
    await this.patchStep(id, { status: "done" });
  }
  async snoozeStep(id) {
    const tomorrow = /* @__PURE__ */ new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await this.patchStep(id, { status: "snoozed", snooze_until: localDate(tomorrow) });
  }
  /**
   * The way back out of a snooze: back to pending and back into the list, with
   * no snooze date left behind. Unsnooze is the only way back now that `Do` is
   * gone, so this is a state change and nothing more.
   */
  async unsnoozeStep(id) {
    await this.patchStep(id, { status: "pending", snooze_until: null });
  }
  async onClose() {
  }
};
var KedgeSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  getSettingDefinitions() {
    return [
      {
        name: "Letter folder",
        desc: "Where sealed letters are stored",
        control: { type: "text", key: "letterFolder" }
      },
      {
        name: "Next steps folder",
        desc: "Where next-step notes live",
        control: { type: "text", key: "nextStepFolder" }
      },
      {
        name: "Lessons folder",
        desc: "Where one-line lessons live",
        control: { type: "text", key: "lessonFolder" }
      }
    ];
  }
  getControlValue(key) {
    return this.plugin.settings[key];
  }
  async setControlValue(key, value) {
    const k = key;
    this.plugin.settings[k] = value;
    await this.plugin.saveSettings();
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("Letter folder").setDesc("Where sealed letters are stored").addText(
      (text) => text.setValue(this.plugin.settings.letterFolder).onChange(async (v) => {
        this.plugin.settings.letterFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Next steps folder").setDesc("Where next-step notes live").addText(
      (text) => text.setValue(this.plugin.settings.nextStepFolder).onChange(async (v) => {
        this.plugin.settings.nextStepFolder = v;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Lessons folder").setDesc("Where one-line lessons live").addText(
      (text) => text.setValue(this.plugin.settings.lessonFolder).onChange(async (v) => {
        this.plugin.settings.lessonFolder = v;
        await this.plugin.saveSettings();
      })
    );
  }
};
var KedgePlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_KEDGE, (leaf) => new KedgeView(leaf, this));
    this.addRibbonIcon("mail", "Open Kedge", async () => {
      await this.activateDashboard();
    });
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: async () => {
        await this.activateDashboard();
      }
    });
    this.addCommand({
      id: "open-dashboard-sidebar",
      name: "Open dashboard in the sidebar",
      callback: async () => {
        await this.activateDashboardInSidebar();
      }
    });
    this.addCommand({
      id: "write-letter",
      name: "Write letter to future me",
      callback: () => {
        new LetterModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addCommand({
      id: "create-next-step",
      name: "Create next step",
      callback: () => {
        new NextStepModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addCommand({
      id: "create-lesson",
      name: "Create lesson",
      callback: () => {
        new LessonModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addSettingTab(new KedgeSettingTab(this.app, this));
    await this.ensureFolders();
  }
  async ensureFolders() {
    for (const f of [this.settings.letterFolder, this.settings.nextStepFolder, this.settings.lessonFolder]) {
      await ensureFolder(this.app, f);
    }
  }
  /** Re-render every open dashboard so a modal's write shows up immediately. */
  async refreshDashboards() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE)) {
      const view = leaf.view;
      if (view && typeof view.render === "function") await view.render();
    }
  }
  async activateDashboard() {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) {
        new import_obsidian.Notice("Kedge: no open leaf to attach to");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_KEDGE, state: {} });
      await this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}
${err.stack}` : String(err);
      new import_obsidian.Notice("Kedge failed to open: " + msg);
    }
  }
  /**
   * Puts the dashboard in the right sidebar, where it stays visible beside
   * whatever note you are working in (Obsidian has no tab pinning, and a
   * sidebar leaf is what survives as "always visible").
   *
   * Mobile has no right split — `getRightLeaf` returns null there — so the same
   * command opens the dashboard in its own tab instead of failing with "no right
   * sidebar to attach to".
   */
  async activateDashboardInSidebar() {
    try {
      const leaf = import_obsidian.Platform.isMobile ? this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE)[0] ?? this.app.workspace.getLeaf("tab") : this.app.workspace.getRightLeaf(false);
      if (!leaf) {
        new import_obsidian.Notice("Kedge: no leaf to attach to");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_KEDGE, state: {} });
      await this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      new import_obsidian.Notice("Kedge failed to open: " + err.message);
    }
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  onunload() {
  }
  /**
   * Pick a leaf to host the dashboard view. Reuses an existing kedge
   * leaf if one is open, otherwise asks the workspace for a fresh leaf.
   * Workspace.getLeaves() does not exist in this Obsidian build, so the
   * public API is used instead.
   */
  getTargetLeaf() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE);
    if (existing.length) return existing[0];
    return this.app.workspace.getLeaf();
  }
};
