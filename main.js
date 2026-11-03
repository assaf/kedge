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
  ChartroomView: () => ChartroomView,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  PRIORITY_LABELS: () => PRIORITY_LABELS,
  VIEW_TYPE_CHARTROOM: () => VIEW_TYPE_CHARTROOM,
  addMonths: () => addMonths,
  appendReply: () => appendReply,
  applyOrder: () => applyOrder,
  byOrder: () => byOrder,
  default: () => ChartroomPlugin,
  formatDate: () => formatDate,
  hasArrived: () => hasArrived,
  idFromTitle: () => idFromTitle,
  isSnoozed: () => isSnoozed,
  lessonNote: () => lessonNote,
  nextStepNote: () => nextStepNote,
  nowStr: () => nowStr,
  parseFrontmatter: () => parseFrontmatter,
  priorityFromLabel: () => priorityFromLabel,
  priorityLabel: () => priorityLabel,
  serializeFrontmatter: () => serializeFrontmatter,
  wireReorder: () => wireReorder
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  letterFolder: "Chartroom/Letters",
  nextStepFolder: "Chartroom/Next-Steps",
  lessonFolder: "Chartroom/Lessons"
};
function nowStr() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
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
function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match)
    return {};
  const block = match[1];
  const obj = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1)
      continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    obj[key] = val;
  }
  return obj;
}
function serializeFrontmatter(obj) {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${v}`);
  return `---
${lines.join("\n")}
---
`;
}
function nextStepNote(title, priority, existing, date = nowStr()) {
  const id = existing?.id ?? (idFromTitle(title) || `step-${date}`);
  const fm = {
    id,
    title,
    status: existing?.status ?? "pending",
    priority,
    created_at: existing?.createdAt ?? date
  };
  if (existing?.snoozeUntil)
    fm.snooze_until = existing.snoozeUntil;
  if (existing?.order != null)
    fm.order = existing.order;
  return { id, content: serializeFrontmatter(fm) };
}
function lessonNote(claim, category, existing, date = nowStr()) {
  const id = existing?.id ?? (idFromTitle(claim) || `lesson-${date}`);
  const content = serializeFrontmatter({
    id,
    claim,
    category,
    week: existing?.week ?? date,
    created_at: existing?.createdAt ?? date
  });
  return { id, content };
}
function appendReply(raw, text, date = nowStr()) {
  const sep = raw.endsWith("\n") ? "\n" : "\n\n";
  return raw + sep + `## Reply ${date}

${text}
`;
}
function bodyOf(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}
async function ensureFolder(app, path) {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    await app.vault.adapter.mkdir(path);
  }
}
async function readAllMarkdown(app) {
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
async function loadLetters(app, folder) {
  const files = await readAllMarkdown(app);
  const letters = [];
  for (const f of files) {
    if (!f.path.startsWith(folder))
      continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status)
      continue;
    letters.push({
      id: fm.id ?? idFromTitle(f.basename),
      title: fm.title ?? f.basename,
      body: bodyOf(text).trim(),
      status: fm.status,
      sealDate: fm.seal_date ?? nowStr(),
      createdAt: fm.created_at ?? nowStr(),
      path: f.path
    });
  }
  return letters;
}
async function loadNextSteps(app, folder) {
  const files = await readAllMarkdown(app);
  const steps = [];
  for (const f of files) {
    if (!f.path.startsWith(folder))
      continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status)
      continue;
    steps.push({
      id: fm.id ?? idFromTitle(f.basename),
      title: fm.title ?? f.basename,
      status: fm.status,
      priority: Number(fm.priority ?? 3),
      snoozeUntil: fm.snooze_until ?? null,
      createdAt: fm.created_at ?? nowStr(),
      order: fm.order != null ? Number(fm.order) : null,
      path: f.path
    });
  }
  return steps;
}
async function loadLessons(app, folder) {
  const files = await readAllMarkdown(app);
  const lessons = [];
  for (const f of files) {
    if (!f.path.startsWith(folder))
      continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.claim)
      continue;
    lessons.push({
      id: fm.id ?? idFromTitle(f.basename),
      claim: fm.claim,
      category: fm.category ?? "",
      week: fm.week ?? nowStr(),
      createdAt: fm.created_at ?? nowStr(),
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
  if (letter.status === "delivered" || letter.status === "opened")
    return true;
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
  if (!match)
    return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}
function byOrder(a, b) {
  if (a.order != null && b.order != null)
    return a.order - b.order;
  if (a.order != null)
    return -1;
  if (b.order != null)
    return 1;
  return 0;
}
async function applyOrder(app, folder, orderedIds) {
  const files = await readAllMarkdown(app);
  const byId = /* @__PURE__ */ new Map();
  for (const f of files) {
    if (!f.path.startsWith(folder))
      continue;
    const fm = parseFrontmatter(await app.vault.cachedRead(f));
    byId.set(fm.id ?? idFromTitle(f.basename), f);
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const file = byId.get(orderedIds[i]);
    if (!file)
      continue;
    const text = await app.vault.cachedRead(file);
    const fm = parseFrontmatter(text);
    fm.order = i + 1;
    await app.vault.modify(file, serializeFrontmatter(fm) + bodyOf(text));
  }
}
function wireReorder(items, onReorder) {
  let dragId = null;
  const ids = items.map((i) => i.id);
  for (const item of items) {
    const el = item.el;
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (evt) => {
      dragId = item.id;
      el.addClass("chartroom-dragging");
      evt?.dataTransfer?.setData?.("text/plain", item.id);
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.removeClass("chartroom-dragging");
    });
    el.addEventListener("dragover", (evt) => {
      if (!dragId || dragId === item.id)
        return;
      evt?.preventDefault?.();
      el.addClass("chartroom-drop-target");
    });
    el.addEventListener("dragleave", () => el.removeClass("chartroom-drop-target"));
    el.addEventListener("drop", (evt) => {
      evt?.preventDefault?.();
      el.removeClass("chartroom-drop-target");
      const moved = dragId ?? evt?.dataTransfer?.getData?.("text/plain") ?? null;
      if (!moved || moved === item.id || !ids.includes(moved))
        return;
      const next = ids.filter((id) => id !== moved);
      next.splice(next.indexOf(item.id), 0, moved);
      void onReorder(next);
    });
  }
}
function fieldWrap(parent, label) {
  const wrap = parent.createDiv({ cls: "chartroom-field" });
  wrap.createEl("label", { cls: "chartroom-field-label", text: label });
  return wrap;
}
function fieldHint(wrap, text) {
  wrap.createDiv({ cls: "chartroom-field-hint", text });
}
function textField(parent, label, opts = {}) {
  const wrap = fieldWrap(parent, label);
  const input = wrap.createEl("input", { cls: "chartroom-input" });
  input.type = opts.type ?? "text";
  input.placeholder = opts.placeholder ?? "";
  if (opts.value)
    input.value = opts.value;
  if (opts.hint)
    fieldHint(wrap, opts.hint);
  return input;
}
function textareaField(parent, label, opts = {}) {
  const wrap = fieldWrap(parent, label);
  const ta = wrap.createEl("textarea", {
    cls: opts.tall ? "chartroom-textarea chartroom-textarea-tall" : "chartroom-textarea"
  });
  ta.placeholder = opts.placeholder ?? "";
  if (opts.hint)
    fieldHint(wrap, opts.hint);
  return ta;
}
function segmentedField(parent, label, options, value, hint) {
  const wrap = fieldWrap(parent, label);
  const group = wrap.createDiv({ cls: "chartroom-segmented" });
  let current = value;
  const buttons = options.map((option) => {
    const button = group.createEl("button", { cls: "chartroom-segment", text: option });
    button.type = "button";
    if (option === value)
      button.addClass("is-active");
    button.onclick = () => {
      current = option;
      for (const other of buttons) {
        if (other === button)
          other.addClass("is-active");
        else
          other.removeClass("is-active");
      }
    };
    return button;
  });
  if (hint)
    fieldHint(wrap, hint);
  return { getValue: () => current };
}
function modalActions(parent, primaryLabel, onPrimary, onCancel) {
  const row = parent.createDiv({ cls: "chartroom-modal-actions" });
  const cancel = row.createEl("button", { cls: "chartroom-btn", text: "Cancel" });
  const primary = row.createEl("button", {
    cls: "chartroom-btn chartroom-btn-primary",
    text: primaryLabel
  });
  cancel.onclick = onCancel;
  primary.onclick = onPrimary;
}
function applyModalClass(modal) {
  modal.modalEl.addClass("chartroom-modal");
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
      if (evt.key === "Enter")
        void this.save();
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
    const { id, content } = nextStepNote(
      title,
      priority,
      existing ? {
        id: existing.id,
        status: existing.status,
        snoozeUntil: existing.snoozeUntil,
        createdAt: existing.createdAt,
        order: existing.order
      } : void 0
    );
    const path = existing?.path ?? uniqueNotePath(app, settings.nextStepFolder, id);
    let body = "";
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) {
      body = bodyOf(await app.vault.cachedRead(file));
    }
    await saveNote(app, path, content + body);
    new import_obsidian.Notice(existing ? "Next step updated." : "Next step created.");
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
      if (evt.key === "Enter")
        void this.save();
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
    const { id, content } = lessonNote(
      claim,
      category,
      existing ? { id: existing.id, week: existing.week, createdAt: existing.createdAt } : void 0
    );
    const path = existing?.path ?? uniqueNotePath(app, settings.lessonFolder, id);
    let body = "";
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof import_obsidian.TFile) {
      body = bodyOf(await app.vault.cachedRead(file));
    }
    await saveNote(app, path, content + body);
    new import_obsidian.Notice(existing ? "Lesson updated." : "Lesson saved.");
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
    const preview = contentEl.createDiv({ cls: "chartroom-letter-preview" });
    preview.createDiv({
      cls: "chartroom-meta",
      text: `${this.letter.title} \xB7 sealed ${this.letter.sealDate} \xB7 written ${this.letter.createdAt}`
    });
    preview.createDiv({ cls: "chartroom-letter-body", text: this.letter.body });
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
    const chips = quick.createDiv({ cls: "chartroom-segmented" });
    for (const [label, months] of QUICK_SCHEDULE) {
      const chip = chips.createEl("button", { cls: "chartroom-segment", text: label });
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
    if (this.existing)
      this.bodyEl.value = this.existing.body;
    this.previewEl = contentEl.createDiv({ cls: "chartroom-field-hint" });
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
    const existing = this.existing;
    const id = existing?.id ?? (idFromTitle(title) || `letter-${Date.now()}`);
    const { app, settings } = this.plugin;
    const path = existing?.path ?? uniqueNotePath(app, settings.letterFolder, id);
    const fm = serializeFrontmatter({
      id,
      title,
      status: existing?.status ?? "sealed",
      seal_date: sealDate,
      created_at: existing?.createdAt ?? nowStr()
    });
    await saveNote(app, path, fm + this.bodyEl.value);
    new import_obsidian.Notice(existing ? `Letter saved. Returns ${sealDate}.` : `Letter sealed. Returns ${sealDate}.`);
    this.close();
    await this.onDone();
  }
  onClose() {
    this.contentEl.empty();
  }
};
var VIEW_TYPE_CHARTROOM = "chartroom-dashboard";
var ChartroomView = class extends import_obsidian.View {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() {
    return VIEW_TYPE_CHARTROOM;
  }
  getDisplayText() {
    return "Chartroom";
  }
  async onOpen() {
    this.container = this.containerEl;
    this.container.style.overflow = "auto";
    this.container.style.height = "100%";
    this.container.empty();
    this.container.addClass("chartroom-view");
    await this.render();
  }
  async render() {
    try {
      await this.renderBody();
    } catch (err) {
      new import_obsidian.Notice("Chartroom render failed: " + err.message);
      console.error("Chartroom render failed:", err);
    }
  }
  refresh() {
    return this.render();
  }
  /** Title row that leaves space for section-level actions. */
  sectionHead(parent, title) {
    const head = parent.createDiv({ cls: "chartroom-section-head" });
    head.createEl("h2", { text: title });
    return head.createDiv({ cls: "chartroom-actions" });
  }
  async renderBody() {
    const { app, settings } = this.plugin;
    this.container.empty();
    const header = this.container.createDiv({ cls: "chartroom-section" });
    header.createEl("h2", { text: "Chartroom" });
    header.createEl("div", {
      cls: "chartroom-meta",
      text: `Today: ${nowStr()}  \xB7  New letter: Ctrl/Cmd+Shift+L  \xB7  New step: Ctrl/Cmd+Shift+N`
    });
    const steps = await loadNextSteps(app, settings.nextStepFolder);
    const pending = steps.filter((s) => s.status !== "done" && !isSnoozed(s));
    pending.sort(
      (a, b) => byOrder(a, b) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)
    );
    const bestSection = this.container.createDiv({ cls: "chartroom-section" });
    this.sectionHead(bestSection, "Next best step");
    if (pending.length > 0) {
      const best = pending[0];
      const card = bestSection.createDiv({ cls: "chartroom-card" });
      card.createDiv({ cls: "chartroom-card-title", text: best.title });
      card.createDiv({ cls: "chartroom-card-body", text: "Do this now. Everything else can wait." });
      const actions = card.createDiv({ cls: "chartroom-actions" });
      const doneBtn = actions.createEl("button", { cls: "mod-clickable", text: "Done" });
      const snoozeBtn = actions.createEl("button", { cls: "mod-clickable", text: "Snooze" });
      doneBtn.onclick = async () => {
        await this.markStepDone(best.id);
        await this.render();
      };
      snoozeBtn.onclick = async () => {
        await this.snoozeStep(best.id);
        await this.render();
      };
    } else {
      const empty = bestSection.createDiv({ cls: "chartroom-empty" });
      empty.createDiv({ text: "No pending next steps." });
      const actions = empty.createDiv({ cls: "chartroom-actions" });
      const newBtn = actions.createEl("button", { cls: "mod-clickable", text: "New next step" });
      newBtn.onclick = () => this.openNewStepModal();
    }
    const letters = await loadLetters(app, settings.letterFolder);
    const arrived = letters.filter((l) => hasArrived(l)).sort((a, b) => b.sealDate.localeCompare(a.sealDate));
    const scheduled = letters.filter((l) => !hasArrived(l)).sort((a, b) => a.sealDate.localeCompare(b.sealDate));
    const pastSection = this.container.createDiv({ cls: "chartroom-section" });
    this.sectionHead(pastSection, "From past you");
    if (arrived.length > 0) {
      for (const letter of arrived) {
        const card = pastSection.createDiv({ cls: "chartroom-card" });
        const titleDiv = card.createDiv({ cls: "chartroom-card-title" });
        titleDiv.createSpan({ text: letter.title });
        titleDiv.createSpan({ cls: "seal-badge", text: `sealed ${formatDate(letter.sealDate)}` });
        card.createDiv({ cls: "chartroom-letter-body", text: letter.body });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        meta.createEl("span", { text: `Written ${letter.createdAt}` });
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const replyBtn = actions.createEl("button", { cls: "mod-clickable", text: "Reply to past me" });
        replyBtn.onclick = () => this.openReplyModal(letter);
      }
    } else {
      pastSection.createDiv({ cls: "chartroom-empty", text: "No letters have arrived yet." });
    }
    const scheduledSection = this.container.createDiv({ cls: "chartroom-section" });
    const scheduledHead = this.sectionHead(scheduledSection, "Scheduled letters");
    const newLetterBtn = scheduledHead.createEl("button", {
      cls: "mod-clickable",
      text: "+ New letter"
    });
    newLetterBtn.onclick = () => this.openNewLetterModal();
    if (scheduled.length > 0) {
      for (const letter of scheduled) {
        const card = scheduledSection.createDiv({ cls: "chartroom-card chartroom-scheduled" });
        const titleDiv = card.createDiv({ cls: "chartroom-card-title" });
        titleDiv.createSpan({ text: letter.title });
        titleDiv.createSpan({ cls: "seal-badge", text: `opens ${formatDate(letter.sealDate)}` });
        const preview = letter.body.length > 180 ? `${letter.body.slice(0, 180)}\u2026` : letter.body;
        card.createDiv({ cls: "chartroom-letter-body", text: preview });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        meta.createEl("span", { text: `Written ${letter.createdAt}` });
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable chartroom-danger",
          text: "Delete"
        });
        editBtn.onclick = () => this.openEditLetterModal(letter);
        deleteBtn.onclick = async () => {
          await this.deleteLetter(letter);
          await this.render();
        };
      }
    } else {
      scheduledSection.createDiv({
        cls: "chartroom-empty",
        text: "Nothing scheduled. Write a letter and pick when it comes back."
      });
    }
    const listSection = this.container.createDiv({ cls: "chartroom-section" });
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
        const card = listSection.createDiv({ cls: "chartroom-card chartroom-draggable" });
        dragCards.push({ id: step.id, el: card });
        const head = card.createDiv({ cls: "chartroom-card-title chartroom-card-head" });
        head.createSpan({ cls: "chartroom-grip", text: "\u283F" });
        head.createSpan({ text: step.title });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        meta.createEl("span", { text: `${priorityLabel(step.priority)} priority` });
        if (step.status === "working") {
          meta.createEl("span", { text: " \xB7 working on it" });
        }
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const snoozeBtn = actions.createEl("button", { cls: "mod-clickable", text: "Snooze" });
        const doneBtn = actions.createEl("button", { cls: "mod-clickable", text: "Done" });
        if (step.status === "working") {
          doBtn.disabled = true;
        } else {
          doBtn.onclick = async () => {
            await this.startStep(step.id);
            await this.render();
          };
        }
        editBtn.onclick = () => this.openEditStepModal(step);
        snoozeBtn.onclick = async () => {
          await this.snoozeStep(step.id);
          await this.render();
        };
        doneBtn.onclick = async () => {
          await this.markStepDone(step.id);
          await this.render();
        };
      }
      wireReorder(dragCards, (ids) => this.reorderSteps(ids));
    } else if (snoozedSteps.length === 0) {
      listSection.createDiv({ cls: "chartroom-empty", text: "Nothing to do." });
    }
    if (snoozedSteps.length > 0) {
      listSection.createDiv({ cls: "chartroom-subhead", text: "Snoozed" });
      for (const step of snoozedSteps) {
        const card = listSection.createDiv({ cls: "chartroom-card chartroom-snoozed" });
        card.createDiv({ cls: "chartroom-card-title", text: step.title });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        meta.createEl("span", {
          text: step.snoozeUntil ? `snoozed until ${step.snoozeUntil}` : "snoozed"
        });
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        doBtn.onclick = async () => {
          await this.startStep(step.id);
          await this.render();
        };
        for (const label of ["Edit", "Snooze", "Done"]) {
          const btn = actions.createEl("button", { cls: "mod-clickable", text: label });
          btn.disabled = true;
        }
      }
    }
    const lessons = await loadLessons(app, settings.lessonFolder);
    const lessonSection = this.container.createDiv({ cls: "chartroom-section" });
    const lessonActions = this.sectionHead(lessonSection, "Lessons");
    const newLessonBtn = lessonActions.createEl("button", { cls: "mod-clickable", text: "+ New lesson" });
    newLessonBtn.onclick = () => this.openNewLessonModal();
    if (lessons.length > 0) {
      const ordered = this.sortLessons(lessons);
      const dragCards = [];
      for (const lesson of ordered) {
        const card = lessonSection.createDiv({ cls: "chartroom-card chartroom-draggable" });
        dragCards.push({ id: lesson.id, el: card });
        const head = card.createDiv({ cls: "chartroom-card-title chartroom-card-head" });
        head.createSpan({ cls: "chartroom-grip", text: "\u283F" });
        head.createSpan({ text: lesson.claim });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        if (lesson.category)
          meta.createEl("span", { text: lesson.category });
        if (lesson.week)
          meta.createEl("span", { text: ` \xB7 ${lesson.week}` });
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable chartroom-danger",
          text: "Delete"
        });
        editBtn.onclick = () => this.openEditLessonModal(lesson);
        deleteBtn.onclick = async () => {
          await this.deleteLesson(lesson);
          await this.render();
        };
      }
      wireReorder(dragCards, (ids) => this.reorderLessons(ids));
    } else {
      lessonSection.createDiv({ cls: "chartroom-empty", text: "No lessons yet." });
    }
  }
  // ---- modal launchers -------------------------------------------------
  openNewStepModal() {
    new NextStepModal(this.app, this.plugin, () => this.refresh()).open();
  }
  openNewLessonModal() {
    new LessonModal(this.app, this.plugin, () => this.refresh()).open();
  }
  openEditLessonModal(lesson) {
    new LessonModal(this.app, this.plugin, () => this.refresh(), lesson).open();
  }
  openReplyModal(letter) {
    new ReplyModal(this.app, this.plugin, letter, () => this.refresh()).open();
  }
  openEditStepModal(step) {
    new NextStepModal(this.app, this.plugin, () => this.refresh(), step).open();
  }
  openNewLetterModal() {
    new LetterModal(this.app, this.plugin, () => this.refresh()).open();
  }
  openEditLetterModal(letter) {
    new LetterModal(this.app, this.plugin, () => this.refresh(), letter).open();
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
    await this.render();
  }
  async reorderLessons(ids) {
    await applyOrder(this.plugin.app, this.plugin.settings.lessonFolder, ids);
    await this.render();
  }
  // ---- note mutations --------------------------------------------------
  async deleteLesson(lesson) {
    if (!window.confirm(`Delete lesson \u201C${lesson.claim}\u201D?`))
      return;
    const file = this.plugin.app.vault.getAbstractFileByPath(lesson.path);
    if (file instanceof import_obsidian.TFile) {
      await this.plugin.app.vault.delete(file);
      new import_obsidian.Notice("Lesson deleted.");
    }
  }
  async deleteLetter(letter) {
    if (!window.confirm(`Delete the letter \u201C${letter.title}\u201D?`))
      return;
    const file = this.plugin.app.vault.getAbstractFileByPath(letter.path);
    if (file instanceof import_obsidian.TFile) {
      await this.plugin.app.vault.delete(file);
      new import_obsidian.Notice("Letter deleted.");
    }
  }
  async markStepDone(id) {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder))
        continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) === id) {
        fm.status = "done";
        await app.vault.modify(f, serializeFrontmatter(fm) + bodyOf(text));
        return;
      }
    }
  }
  async snoozeStep(id) {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder))
        continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) === id) {
        fm.status = "snoozed";
        fm.snooze_until = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
        await app.vault.modify(f, serializeFrontmatter(fm) + bodyOf(text));
        return;
      }
    }
  }
  /** Marks a step as the one being worked on, clearing any snooze. */
  async startStep(id) {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder))
        continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) === id) {
        fm.status = "working";
        delete fm.snooze_until;
        await app.vault.modify(f, serializeFrontmatter(fm) + bodyOf(text));
        return;
      }
    }
  }
  async onClose() {
  }
};
var ChartroomSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Chartroom settings" });
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
var ChartroomPlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_CHARTROOM, (leaf) => new ChartroomView(leaf, this));
    this.addRibbonIcon("mail", "Open Chartroom", async () => {
      await this.activateDashboard();
    });
    this.addCommand({
      id: "open-chartroom",
      name: "Open dashboard",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "M" }],
      callback: async () => {
        await this.activateDashboard();
      }
    });
    this.addCommand({
      id: "reload-chartroom",
      name: "Reload dashboard",
      callback: async () => {
        await this.reloadDashboard();
      }
    });
    this.addCommand({
      id: "open-chartroom-tab",
      name: "Open dashboard in tab",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "T" }],
      callback: async () => {
        try {
          const leaf = this.getTargetLeaf();
          if (!leaf) {
            new import_obsidian.Notice("Chartroom tab: no leaf available");
            return;
          }
          await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
          this.app.workspace.revealLeaf(leaf);
        } catch (err) {
          new import_obsidian.Notice("Chartroom tab failed: " + err.message);
        }
      }
    });
    this.addCommand({
      id: "write-letter",
      name: "Write letter to future me",
      callback: async () => {
        new LetterModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addCommand({
      id: "create-next-step",
      name: "Create next step",
      callback: async () => {
        new NextStepModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addCommand({
      id: "create-lesson",
      name: "Create lesson",
      callback: async () => {
        new LessonModal(this.app, this, () => this.refreshDashboards()).open();
      }
    });
    this.addSettingTab(new ChartroomSettingTab(this.app, this));
    await this.ensureFolders();
  }
  async ensureFolders() {
    for (const f of [this.settings.letterFolder, this.settings.nextStepFolder, this.settings.lessonFolder]) {
      await ensureFolder(this.app, f);
    }
  }
  /** Re-render every open dashboard so a modal's write shows up immediately. */
  async refreshDashboards() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHARTROOM)) {
      const view = leaf.view;
      if (view && typeof view.render === "function")
        await view.render();
    }
  }
  async activateDashboard() {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) {
        new import_obsidian.Notice("Chartroom: no open leaf to attach to");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}
${err.stack}` : String(err);
      new import_obsidian.Notice("Chartroom failed to open: " + msg);
      console.error("Chartroom activate failed:", err);
    }
  }
  async reloadDashboard() {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) {
        new import_obsidian.Notice("Chartroom reload: no open leaf");
        return;
      }
      await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      new import_obsidian.Notice("Chartroom reload failed: " + err.message);
      console.error("Chartroom reload failed:", err);
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
   * Pick a leaf to host the dashboard view. Reuses an existing chartroom
   * leaf if one is open, otherwise asks the workspace for a fresh leaf.
   * Workspace.getLeaves() does not exist in this Obsidian build, so the
   * public API is used instead.
   */
  getTargetLeaf() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHARTROOM);
    if (existing.length)
      return existing[0];
    return this.app.workspace.getLeaf();
  }
};
