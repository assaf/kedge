import {
  App,
  Plugin,
  PluginSettingTab,
  Setting,
  View,
  WorkspaceLeaf,
  TFile,
  Modal,
  Notice,
} from "obsidian";

// --------------------------------------------------------------------- types
export interface Letter {
  id: string;
  title: string;
  body: string;
  status: "sealed" | "delivered" | "opened";
  sealDate: string;
  createdAt: string;
  path: string;
}

export interface NextStep {
  id: string;
  title: string;
  status: "pending" | "working" | "snoozed" | "done";
  priority: number;
  snoozeUntil: string | null;
  createdAt: string;
  order: number | null;
  path: string;
}

export interface Lesson {
  id: string;
  claim: string;
  category: string;
  week: string;
  createdAt: string;
  order: number | null;
  path: string;
}

export interface ChartroomSettings {
  letterFolder: string;
  nextStepFolder: string;
  lessonFolder: string;
}

export const DEFAULT_SETTINGS: ChartroomSettings = {
  letterFolder: "Chartroom/Letters",
  nextStepFolder: "Chartroom/Next-Steps",
  lessonFolder: "Chartroom/Lessons",
};

export function nowStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function idFromTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Priorities are stored as 1-5 but presented as words. */
export const PRIORITY_LABELS = ["highest", "high", "medium", "low", "lowest"];

export function priorityLabel(priority: number): string {
  const index = Math.min(Math.max(Math.round(priority) || 3, 1), 5) - 1;
  return PRIORITY_LABELS[index];
}

export function priorityFromLabel(label: string): number {
  const index = PRIORITY_LABELS.indexOf(label);
  return index === -1 ? 3 : index + 1;
}

export function parseFrontmatter(text: string): Record<string, any> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const obj: Record<string, any> = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    obj[key] = val;
  }
  return obj;
}

export function serializeFrontmatter(obj: Record<string, any>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/** Frontmatter for a next-step note; pass `existing` to edit it in place. */
export function nextStepNote(
  title: string,
  priority: number,
  existing?: {
    id: string;
    status: string;
    snoozeUntil: string | null;
    createdAt: string;
    order: number | null;
  },
  date = nowStr()
): { id: string; content: string } {
  const id = existing?.id ?? (idFromTitle(title) || `step-${date}`);
  const fm: Record<string, any> = {
    id,
    title,
    status: existing?.status ?? "pending",
    priority,
    created_at: existing?.createdAt ?? date,
  };
  if (existing?.snoozeUntil) fm.snooze_until = existing.snoozeUntil;
  if (existing?.order != null) fm.order = existing.order;
  return { id, content: serializeFrontmatter(fm) };
}

/** Frontmatter + id for a lesson note, editing `existing` when given. */
export function lessonNote(
  claim: string,
  category: string,
  existing?: { id: string; week: string; createdAt: string },
  date = nowStr()
): { id: string; content: string } {
  const id = existing?.id ?? (idFromTitle(claim) || `lesson-${date}`);
  const content = serializeFrontmatter({
    id,
    claim,
    category,
    week: existing?.week ?? date,
    created_at: existing?.createdAt ?? date,
  });
  return { id, content };
}

/** Append a dated reply section to a letter note. */
export function appendReply(raw: string, text: string, date = nowStr()): string {
  const sep = raw.endsWith("\n") ? "\n" : "\n\n";
  return raw + sep + `## Reply ${date}\n\n${text}\n`;
}

// --------------------------------------------------------------------- helpers

/** Text after the frontmatter block, so edits never clobber a note body. */
function bodyOf(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const exists = await app.vault.adapter.exists(path);
  if (!exists) {
    await app.vault.adapter.mkdir(path);
  }
}

async function readAllMarkdown(app: App): Promise<TFile[]> {
  return app.vault.getMarkdownFiles();
}

/** `<folder>/<base>.md`, suffixed -2, -3… when that name is taken. */
function uniqueNotePath(app: App, folder: string, base: string): string {
  const root = base || "untitled";
  let candidate = `${folder}/${root}.md`;
  let n = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${folder}/${root}-${n}.md`;
    n++;
  }
  return candidate;
}

async function loadLetters(app: App, folder: string): Promise<Letter[]> {
  const files = await readAllMarkdown(app);
  const letters: Letter[] = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status) continue;
    letters.push({
      id: fm.id ?? idFromTitle(f.basename),
      title: fm.title ?? f.basename,
      body: bodyOf(text).trim(),
      status: fm.status,
      sealDate: fm.seal_date ?? nowStr(),
      createdAt: fm.created_at ?? nowStr(),
      path: f.path,
    });
  }
  return letters;
}

async function loadNextSteps(app: App, folder: string): Promise<NextStep[]> {
  const files = await readAllMarkdown(app);
  const steps: NextStep[] = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.status) continue;
    steps.push({
      id: fm.id ?? idFromTitle(f.basename),
      title: fm.title ?? f.basename,
      status: fm.status,
      priority: Number(fm.priority ?? 3),
      snoozeUntil: fm.snooze_until ?? null,
      createdAt: fm.created_at ?? nowStr(),
      order: fm.order != null ? Number(fm.order) : null,
      path: f.path,
    });
  }
  return steps;
}

async function loadLessons(app: App, folder: string): Promise<Lesson[]> {
  const files = await readAllMarkdown(app);
  const lessons: Lesson[] = [];
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const text = await app.vault.cachedRead(f);
    const fm = parseFrontmatter(text);
    if (!fm.claim) continue;
    lessons.push({
      id: fm.id ?? idFromTitle(f.basename),
      claim: fm.claim,
      category: fm.category ?? "",
      week: fm.week ?? nowStr(),
      createdAt: fm.created_at ?? nowStr(),
      order: fm.order != null ? Number(fm.order) : null,
      path: f.path,
    });
  }
  return lessons;
}

async function saveNote(app: App, path: string, content: string): Promise<void> {
  await ensureFolder(app, path.split("/").slice(0, -1).join("/"));
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    await app.vault.create(path, content);
  }
}

/** Snoozed until a future date; an elapsed snooze is simply due again. */
export function isSnoozed(
  step: { status: string; snoozeUntil: string | null },
  today = nowStr()
): boolean {
  return step.status === "snoozed" && (!step.snoozeUntil || step.snoozeUntil > today);
}

/**
 * A letter shows once its date arrives. Nothing is rewritten on read: a
 * `sealed` letter whose date has passed is simply due.
 */
export function hasArrived(
  letter: { status: string; sealDate: string },
  today = nowStr()
): boolean {
  if (letter.status === "delivered" || letter.status === "opened") return true;
  return letter.status === "sealed" && letter.sealDate <= today;
}

/** `YYYY-MM-DD` shifted by whole months, clamped to the shorter month. */
export function addMonths(months: number, from = nowStr()): string {
  const [year, month, day] = from.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return target.toISOString().slice(0, 10);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `2027-05-03` → `3 May 2027`, the way it reads on a card. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * Fuzzy match, no dependency: an exact substring scores highest, otherwise the
 * query has to appear as an in-order subsequence. Returns -1 for no match, so
 * a caller can filter on `score >= 0` while still sorting by it.
 */
export function fuzzyScore(text: string, query: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;
  const haystack = text.toLowerCase();

  const direct = haystack.indexOf(needle);
  if (direct !== -1) {
    // early matches beat late ones; a word start beats mid-word
    const wordStart = direct === 0 || /[\s\-_/]/.test(haystack[direct - 1]);
    return 1000 - direct + (wordStart ? 100 : 0);
  }

  // in-order subsequence: reward runs of adjacent characters
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

/** Lessons matching `query`, best match first; blank query keeps the order. */
export function filterLessons<T extends { claim: string; category: string }>(
  lessons: T[],
  query: string
): T[] {
  if (!query.trim()) return lessons;
  return lessons
    .map((lesson) => {
      const claim = fuzzyScore(lesson.claim, query);
      const category = fuzzyScore(lesson.category ?? "", query);
      const score = Math.max(claim, category >= 0 ? category - 200 : -1);
      return { lesson, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.lesson);
}

/** Manual order wins; notes without one keep the caller's fallback rule. */
export function byOrder(a: { order: number | null }, b: { order: number | null }): number {
  if (a.order != null && b.order != null) return a.order - b.order;
  if (a.order != null) return -1;
  if (b.order != null) return 1;
  return 0;
}

/** Writes 1..n into `order` on each note, leaving the rest of the note intact. */
export async function applyOrder(app: App, folder: string, orderedIds: string[]): Promise<void> {
  const files = await readAllMarkdown(app);
  const byId = new Map<string, TFile>();
  for (const f of files) {
    if (!f.path.startsWith(folder)) continue;
    const fm = parseFrontmatter(await app.vault.cachedRead(f));
    byId.set(fm.id ?? idFromTitle(f.basename), f);
  }
  for (let i = 0; i < orderedIds.length; i++) {
    const file = byId.get(orderedIds[i]);
    if (!file) continue;
    const text = await app.vault.cachedRead(file);
    const fm = parseFrontmatter(text);
    fm.order = i + 1;
    await app.vault.modify(file, serializeFrontmatter(fm) + bodyOf(text));
  }
}

export interface DraggableCard {
  id: string;
  el: HTMLElement;
}

/**
 * Drag-and-drop reordering over an explicit list of cards. It takes the cards
 * rather than querying the DOM, so the same code runs under Obsidian and under
 * the test harness.
 */
export function wireReorder(
  items: DraggableCard[],
  onReorder: (orderedIds: string[]) => void | Promise<void>
): void {
  let dragId: string | null = null;
  const ids = items.map((i) => i.id);

  for (const item of items) {
    const el = item.el;
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (evt: any) => {
      dragId = item.id;
      el.addClass("chartroom-dragging");
      evt?.dataTransfer?.setData?.("text/plain", item.id);
    });
    el.addEventListener("dragend", () => {
      dragId = null;
      el.removeClass("chartroom-dragging");
    });
    el.addEventListener("dragover", (evt: any) => {
      if (!dragId || dragId === item.id) return;
      evt?.preventDefault?.();
      el.addClass("chartroom-drop-target");
    });
    el.addEventListener("dragleave", () => el.removeClass("chartroom-drop-target"));
    el.addEventListener("drop", (evt: any) => {
      evt?.preventDefault?.();
      el.removeClass("chartroom-drop-target");
      const moved = dragId ?? evt?.dataTransfer?.getData?.("text/plain") ?? null;
      if (!moved || moved === item.id || !ids.includes(moved)) return;
      const next = ids.filter((id) => id !== moved);
      next.splice(next.indexOf(item.id), 0, moved);
      void onReorder(next);
    });
  }
}

// --------------------------------------------------------------------- modal form bits

/**
 * Obsidian's `Setting` control sits in a narrow right-hand column, which is
 * wrong for a modal whose whole job is one text field. Modal fields here are
 * stacked: label, full-width control, hint.
 */
function fieldWrap(parent: HTMLElement, label: string): HTMLElement {
  const wrap = parent.createDiv({ cls: "chartroom-field" });
  wrap.createEl("label", { cls: "chartroom-field-label", text: label });
  return wrap;
}

function fieldHint(wrap: HTMLElement, text: string): void {
  wrap.createDiv({ cls: "chartroom-field-hint", text });
}

function textField(
  parent: HTMLElement,
  label: string,
  opts: { placeholder?: string; value?: string; hint?: string; type?: string } = {}
): HTMLInputElement {
  const wrap = fieldWrap(parent, label);
  const input = wrap.createEl("input", { cls: "chartroom-input" });
  input.type = opts.type ?? "text";
  input.placeholder = opts.placeholder ?? "";
  if (opts.value) input.value = opts.value;
  if (opts.hint) fieldHint(wrap, opts.hint);
  return input;
}

function textareaField(
  parent: HTMLElement,
  label: string,
  opts: { placeholder?: string; tall?: boolean; hint?: string } = {}
): HTMLTextAreaElement {
  const wrap = fieldWrap(parent, label);
  const ta = wrap.createEl("textarea", {
    cls: opts.tall ? "chartroom-textarea chartroom-textarea-tall" : "chartroom-textarea",
  });
  ta.placeholder = opts.placeholder ?? "";
  if (opts.hint) fieldHint(wrap, opts.hint);
  return ta;
}

/**
 * A row of choice buttons instead of a native <select>: Obsidian themes the
 * native control themselves, which is how a dropdown ends up white-on-white
 * in the modal. Buttons carry our own colours, so the current value is always
 * legible.
 */
function segmentedField(
  parent: HTMLElement,
  label: string,
  options: string[],
  value: string,
  hint?: string
): { getValue: () => string } {
  const wrap = fieldWrap(parent, label);
  const group = wrap.createDiv({ cls: "chartroom-segmented" });
  let current = value;
  const buttons = options.map((option) => {
    const button = group.createEl("button", { cls: "chartroom-segment", text: option });
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

function modalActions(
  parent: HTMLElement,
  primaryLabel: string,
  onPrimary: () => void,
  onCancel: () => void
): void {
  const row = parent.createDiv({ cls: "chartroom-modal-actions" });
  const cancel = row.createEl("button", { cls: "chartroom-btn", text: "Cancel" });
  const primary = row.createEl("button", {
    cls: "chartroom-btn chartroom-btn-primary",
    text: primaryLabel,
  });
  cancel.onclick = onCancel;
  primary.onclick = onPrimary;
}

/** Gives the modal the plugin's width and form styling. */
function applyModalClass(modal: Modal): void {
  modal.modalEl.addClass("chartroom-modal");
}

// --------------------------------------------------------------------- next step modal

class NextStepModal extends Modal {
  plugin: ChartroomPlugin;
  onDone: () => void | Promise<void>;
  existing?: NextStep;
  titleEl!: HTMLInputElement;
  priorityChoice!: { getValue: () => string };

  constructor(
    app: App,
    plugin: ChartroomPlugin,
    onDone: () => void | Promise<void>,
    existing?: NextStep
  ) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }

  onOpen(): void {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.existing ? "Edit next step" : "New next step" });

    this.titleEl = textField(contentEl, "Step", {
      placeholder: "What is the next concrete step?",
      hint: "One concrete thing you can do next.",
      value: this.existing?.title,
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

  private async save(): Promise<void> {
    const title = this.titleEl.value.trim();
    if (!title) {
      new Notice("Give the step a title.");
      return;
    }
    const { app, settings } = this.plugin;
    const priority = priorityFromLabel(this.priorityChoice.getValue());
    const existing = this.existing;
    const { id, content } = nextStepNote(
      title,
      priority,
      existing
        ? {
            id: existing.id,
            status: existing.status,
            snoozeUntil: existing.snoozeUntil,
            createdAt: existing.createdAt,
            order: existing.order,
          }
        : undefined
    );
    const path = existing?.path ?? uniqueNotePath(app, settings.nextStepFolder, id);

    let body = "";
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      body = bodyOf(await app.vault.cachedRead(file));
    }

    await saveNote(app, path, content + body);
    new Notice(existing ? "Next step updated." : "Next step created.");
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- lesson modal

class LessonModal extends Modal {
  plugin: ChartroomPlugin;
  onDone: () => void | Promise<void>;
  existing?: Lesson;
  claimEl!: HTMLInputElement;
  categoryEl!: HTMLInputElement;

  constructor(
    app: App,
    plugin: ChartroomPlugin,
    onDone: () => void | Promise<void>,
    existing?: Lesson
  ) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }

  onOpen(): void {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: this.existing ? "Edit lesson" : "New lesson" });

    this.claimEl = textField(contentEl, "Lesson", {
      placeholder: "The lesson in one line",
      hint: "One line you want to remember.",
      value: this.existing?.claim,
    });
    this.categoryEl = textField(contentEl, "Category", {
      placeholder: "e.g. product, hiring, health",
      hint: "Optional.",
      value: this.existing?.category,
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

  private async save(): Promise<void> {
    const claim = this.claimEl.value.trim();
    if (!claim) {
      new Notice("A lesson needs a line.");
      return;
    }
    const category = this.categoryEl.value.trim();
    const { app, settings } = this.plugin;
    const existing = this.existing;
    const { id, content } = lessonNote(
      claim,
      category,
      existing ? { id: existing.id, week: existing.week, createdAt: existing.createdAt } : undefined
    );
    const path = existing?.path ?? uniqueNotePath(app, settings.lessonFolder, id);

    let body = "";
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      body = bodyOf(await app.vault.cachedRead(file));
    }

    await saveNote(app, path, content + body);
    new Notice(existing ? "Lesson updated." : "Lesson saved.");
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- reply modal

class ReplyModal extends Modal {
  plugin: ChartroomPlugin;
  letter: Letter;
  onDone: () => void | Promise<void>;
  bodyEl!: HTMLTextAreaElement;

  constructor(app: App, plugin: ChartroomPlugin, letter: Letter, onDone: () => void | Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.letter = letter;
    this.onDone = onDone;
  }

  onOpen(): void {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Reply to past you" });

    const preview = contentEl.createDiv({ cls: "chartroom-letter-preview" });
    preview.createDiv({
      cls: "chartroom-meta",
      text: `${this.letter.title} · sealed ${this.letter.sealDate} · written ${this.letter.createdAt}`,
    });
    preview.createDiv({ cls: "chartroom-letter-body", text: this.letter.body });

    this.bodyEl = textareaField(contentEl, "Your reply", {
      placeholder: "What does the person reading this letter now want to say back?",
      tall: true,
    });

    modalActions(contentEl, "Save reply", () => void this.save(), () => this.close());
    this.bodyEl.focus();
  }

  private async save(): Promise<void> {
    const text = this.bodyEl.value.trim();
    if (!text) {
      new Notice("Write something first.");
      return;
    }
    const { app } = this.plugin;
    const file = app.vault.getAbstractFileByPath(this.letter.path);
    if (!(file instanceof TFile)) {
      new Notice("Letter file not found.");
      return;
    }
    const raw = await app.vault.cachedRead(file);
    await app.vault.modify(file, appendReply(raw, text));
    new Notice("Reply saved to the letter.");
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- letter modal

const QUICK_SCHEDULE: Array<[string, number]> = [
  ["1 month", 1],
  ["6 months", 6],
  ["1 year", 12],
];

class LetterModal extends Modal {
  plugin: ChartroomPlugin;
  onDone: () => void | Promise<void>;
  existing?: Letter;
  titleEl!: HTMLInputElement;
  dateEl!: HTMLInputElement;
  bodyEl!: HTMLTextAreaElement;
  previewEl!: HTMLElement;

  constructor(
    app: App,
    plugin: ChartroomPlugin,
    onDone: () => void | Promise<void>,
    existing?: Letter
  ) {
    super(app);
    this.plugin = plugin;
    this.onDone = onDone;
    this.existing = existing;
  }

  onOpen(): void {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", {
      text: this.existing ? "Edit letter to future me" : "Letter to future me",
    });

    this.titleEl = textField(contentEl, "Title", {
      placeholder: "Dear future me…",
      value: this.existing?.title,
    });

    // quick picks first; the date field below is the exact answer
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
      value: this.existing?.sealDate ?? addMonths(6),
    });
    this.dateEl.addEventListener("input", () => this.updatePreview());

    this.bodyEl = textareaField(contentEl, "Letter", {
      placeholder: "Write notes for your future self, not for an audience.",
      tall: true,
    });
    if (this.existing) this.bodyEl.value = this.existing.body;

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

  private updatePreview(): void {
    const date = this.dateEl.value.trim();
    this.previewEl.setText(
      date ? `Will come back on ${formatDate(date)}` : "Pick a date to bring it back."
    );
  }

  private async save(): Promise<void> {
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
      created_at: existing?.createdAt ?? nowStr(),
    });
    await saveNote(app, path, fm + this.bodyEl.value);
    new Notice(existing ? `Letter saved. Returns ${sealDate}.` : `Letter sealed. Returns ${sealDate}.`);
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- dashboard view

export const VIEW_TYPE_CHARTROOM = "chartroom-dashboard";

export class ChartroomView extends View {
  plugin: ChartroomPlugin;
  container!: HTMLElement;
  lessonQuery = "";

  constructor(leaf: WorkspaceLeaf, plugin: ChartroomPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_CHARTROOM;
  }

  getDisplayText(): string {
    return "Chartroom";
  }

  async onOpen(): Promise<void> {
    this.container = this.containerEl;
    this.container.style.overflow = "auto";
    this.container.style.height = "100%";
    this.container.empty();
    this.container.addClass("chartroom-view");
    await this.render();
  }

  async render(): Promise<void> {
    try {
      await this.renderBody();
    } catch (err) {
      new Notice("Chartroom render failed: " + (err as Error).message);
      console.error("Chartroom render failed:", err);
    }
  }

  private refresh(): Promise<void> {
    return this.render();
  }

  /** Title row that leaves space for section-level actions. */
  private sectionHead(parent: HTMLElement, title: string): HTMLElement {
    const head = parent.createDiv({ cls: "chartroom-section-head" });
    head.createEl("h2", { text: title });
    return head.createDiv({ cls: "chartroom-actions" });
  }

  private async renderBody(): Promise<void> {
    const { app, settings } = this.plugin;
    this.container.empty();

    // header
    const header = this.container.createDiv({ cls: "chartroom-section" });
    header.createEl("h2", { text: "Chartroom" });
    header.createEl("div", {
      cls: "chartroom-meta",
      text: `Today: ${nowStr()}  ·  New letter: Ctrl/Cmd+Shift+L  ·  New step: Ctrl/Cmd+Shift+N`,
    });

    // ---- Next best step ----
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

    // ---- Letters: arrived, then scheduled ----
    const letters = await loadLetters(app, settings.letterFolder);
    const arrived = letters
      .filter((l) => hasArrived(l))
      .sort((a, b) => b.sealDate.localeCompare(a.sealDate));
    const scheduled = letters
      .filter((l) => !hasArrived(l))
      .sort((a, b) => a.sealDate.localeCompare(b.sealDate));

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
      text: "+ New letter",
    });
    newLetterBtn.onclick = () => this.openNewLetterModal();
    if (scheduled.length > 0) {
      for (const letter of scheduled) {
        const row = scheduledSection.createDiv({ cls: "chartroom-letter-row" });
        // full detail stays on hover; the list keeps to one line per letter
        row.title = `opens ${formatDate(letter.sealDate)} · written ${letter.createdAt}`;
        row.createDiv({ cls: "chartroom-letter-row-title", text: letter.title });
        const actions = row.createDiv({ cls: "chartroom-actions" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable chartroom-danger",
          text: "Delete",
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
        text: "Nothing scheduled. Write a letter and pick when it comes back.",
      });
    }

    // ---- Next steps list ----
    const listSection = this.container.createDiv({ cls: "chartroom-section" });
    const listActions = this.sectionHead(listSection, "Next steps");
    const newStepBtn = listActions.createEl("button", { cls: "mod-clickable", text: "+ New step" });
    newStepBtn.onclick = () => this.openNewStepModal();

    const openSteps = steps.filter((s) => s.status !== "done");
    const activeSteps = openSteps.filter((s) => !isSnoozed(s));
    const snoozedSteps = openSteps.filter((s) => isSnoozed(s));

    if (activeSteps.length > 0) {
      const ordered = this.sortSteps(activeSteps);
      const dragCards: DraggableCard[] = [];
      for (const step of ordered) {
        const card = listSection.createDiv({ cls: "chartroom-card chartroom-draggable" });
        dragCards.push({ id: step.id, el: card });
        const head = card.createDiv({ cls: "chartroom-card-title chartroom-card-head" });
        head.createSpan({ cls: "chartroom-grip", text: "⠿" });
        head.createSpan({ text: step.title });
        const meta = card.createDiv({ cls: "chartroom-meta" });
        meta.createEl("span", { text: `${priorityLabel(step.priority)} priority` });
        if (step.status === "working") {
          meta.createEl("span", { text: " · working on it" });
        }
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const snoozeBtn = actions.createEl("button", { cls: "mod-clickable", text: "Snooze" });
        const doneBtn = actions.createEl("button", { cls: "mod-clickable", text: "Done" });
        if (step.status === "working") {
          doBtn.disabled = true; // already the one you are working on
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
          text: step.snoozeUntil ? `snoozed until ${step.snoozeUntil}` : "snoozed",
        });
        const actions = card.createDiv({ cls: "chartroom-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        doBtn.onclick = async () => {
          await this.startStep(step.id);
          await this.render();
        };
        // Visible but disabled: a snoozed step cannot be edited, snoozed
        // again, or finished until it has been picked up.
        for (const label of ["Edit", "Snooze", "Done"]) {
          const btn = actions.createEl("button", { cls: "mod-clickable", text: label });
          btn.disabled = true;
        }
      }
    }

    // ---- Lessons ----
    const lessons = await loadLessons(app, settings.lessonFolder);
    const lessonSection = this.container.createDiv({ cls: "chartroom-section" });
    const lessonActions = this.sectionHead(lessonSection, "Lessons");
    const newLessonBtn = lessonActions.createEl("button", { cls: "mod-clickable", text: "+ New lesson" });
    newLessonBtn.onclick = () => this.openNewLessonModal();

    const search = lessonSection.createEl("input", { cls: "chartroom-search" });
    search.type = "search";
    search.placeholder = "Search your lessons";
    search.value = this.lessonQuery;
    const lessonList = lessonSection.createDiv({ cls: "chartroom-lesson-list" });
    this.renderLessons(lessonList, lessons);
    search.addEventListener("input", () => {
      this.lessonQuery = search.value;
      this.renderLessons(lessonList, lessons);
    });
  }

  /** Filters in place, so typing costs no focus and no full dashboard render. */
  private renderLessons(container: HTMLElement, lessons: Lesson[]): void {
    container.empty();
    if (lessons.length === 0) {
      container.createDiv({ cls: "chartroom-empty", text: "No lessons yet." });
      return;
    }

    const matches = filterLessons(this.sortLessons(lessons), this.lessonQuery);
    if (matches.length === 0) {
      container.createDiv({ cls: "chartroom-empty", text: "No lesson matches that." });
      return;
    }

    const dragCards: DraggableCard[] = [];
    for (const lesson of matches) {
      const card = container.createDiv({ cls: "chartroom-card chartroom-draggable" });
      dragCards.push({ id: lesson.id, el: card });
      const head = card.createDiv({ cls: "chartroom-card-title chartroom-card-head" });
      head.createSpan({ cls: "chartroom-grip", text: "⠿" });
      head.createSpan({ text: lesson.claim });
      const meta = card.createDiv({ cls: "chartroom-meta" });
      if (lesson.category) meta.createEl("span", { text: lesson.category });
      if (lesson.week) meta.createEl("span", { text: ` · ${lesson.week}` });
      const actions = card.createDiv({ cls: "chartroom-actions" });
      const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
      const deleteBtn = actions.createEl("button", {
        cls: "mod-clickable chartroom-danger",
        text: "Delete",
      });
      editBtn.onclick = () => this.openEditLessonModal(lesson);
      deleteBtn.onclick = async () => {
        await this.deleteLesson(lesson);
        await this.render();
      };
    }
    // reordering only makes sense on the full, unfiltered list
    if (!this.lessonQuery.trim()) {
      wireReorder(dragCards, (ids) => this.reorderLessons(ids));
    }
  }

  // ---- modal launchers -------------------------------------------------

  private openNewStepModal(): void {
    new NextStepModal(this.app, this.plugin, () => this.refresh()).open();
  }

  private openNewLessonModal(): void {
    new LessonModal(this.app, this.plugin, () => this.refresh()).open();
  }

  private openEditLessonModal(lesson: Lesson): void {
    new LessonModal(this.app, this.plugin, () => this.refresh(), lesson).open();
  }

  private openReplyModal(letter: Letter): void {
    new ReplyModal(this.app, this.plugin, letter, () => this.refresh()).open();
  }

  private openEditStepModal(step: NextStep): void {
    new NextStepModal(this.app, this.plugin, () => this.refresh(), step).open();
  }

  private openNewLetterModal(): void {
    new LetterModal(this.app, this.plugin, () => this.refresh()).open();
  }

  private openEditLetterModal(letter: Letter): void {
    new LetterModal(this.app, this.plugin, () => this.refresh(), letter).open();
  }

  // ---- ordering --------------------------------------------------------

  private sortSteps(list: NextStep[]): NextStep[] {
    return list
      .slice()
      .sort(
        (a, b) => byOrder(a, b) || a.priority - b.priority || a.createdAt.localeCompare(b.createdAt)
      );
  }

  private sortLessons(list: Lesson[]): Lesson[] {
    return list
      .slice()
      .sort((a, b) => byOrder(a, b) || b.createdAt.localeCompare(a.createdAt));
  }

  private async reorderSteps(ids: string[]): Promise<void> {
    await applyOrder(this.plugin.app, this.plugin.settings.nextStepFolder, ids);
    await this.render();
  }

  private async reorderLessons(ids: string[]): Promise<void> {
    await applyOrder(this.plugin.app, this.plugin.settings.lessonFolder, ids);
    await this.render();
  }

  // ---- note mutations --------------------------------------------------

  private async deleteLesson(lesson: Lesson): Promise<void> {
    if (!window.confirm(`Delete lesson “${lesson.claim}”?`)) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(lesson.path);
    if (file instanceof TFile) {
      await this.plugin.app.vault.delete(file);
      new Notice("Lesson deleted.");
    }
  }

  private async deleteLetter(letter: Letter): Promise<void> {
    if (!window.confirm(`Delete the letter “${letter.title}”?`)) return;
    const file = this.plugin.app.vault.getAbstractFileByPath(letter.path);
    if (file instanceof TFile) {
      await this.plugin.app.vault.delete(file);
      new Notice("Letter deleted.");
    }
  }

  private async markStepDone(id: string): Promise<void> {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder)) continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) === id) {
        fm.status = "done";
        await app.vault.modify(f, serializeFrontmatter(fm) + bodyOf(text));
        return;
      }
    }
  }

  private async snoozeStep(id: string): Promise<void> {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder)) continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) === id) {
        fm.status = "snoozed";
        fm.snooze_until = new Date(Date.now() + 86400000).toISOString().slice(0, 10); // +1 day
        await app.vault.modify(f, serializeFrontmatter(fm) + bodyOf(text));
        return;
      }
    }
  }

  /** Marks a step as the one being worked on, clearing any snooze. */
  private async startStep(id: string): Promise<void> {
    const { app, settings } = this.plugin;
    const files = await readAllMarkdown(app);
    for (const f of files) {
      if (!f.path.startsWith(settings.nextStepFolder)) continue;
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

  async onClose(): Promise<void> {
    // noop
  }
}

// --------------------------------------------------------------------- settings tab

class ChartroomSettingTab extends PluginSettingTab {
  plugin: ChartroomPlugin;

  constructor(app: App, plugin: ChartroomPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Chartroom settings" });

    new Setting(containerEl)
      .setName("Letter folder")
      .setDesc("Where sealed letters are stored")
      .addText((text) =>
        text.setValue(this.plugin.settings.letterFolder).onChange(async (v) => {
          this.plugin.settings.letterFolder = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Next steps folder")
      .setDesc("Where next-step notes live")
      .addText((text) =>
        text.setValue(this.plugin.settings.nextStepFolder).onChange(async (v) => {
          this.plugin.settings.nextStepFolder = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Lessons folder")
      .setDesc("Where one-line lessons live")
      .addText((text) =>
        text.setValue(this.plugin.settings.lessonFolder).onChange(async (v) => {
          this.plugin.settings.lessonFolder = v;
          await this.plugin.saveSettings();
        })
      );
  }
}

// --------------------------------------------------------------------- main plugin

export default class ChartroomPlugin extends Plugin {
  settings!: ChartroomSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // register dashboard view
    this.registerView(VIEW_TYPE_CHARTROOM, (leaf) => new ChartroomView(leaf, this));

    // ribbon icon
    this.addRibbonIcon("mail", "Open Chartroom", async () => {
      await this.activateDashboard();
    });

    this.addCommand({
      id: "open-chartroom",
      name: "Open dashboard",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "M" }],
      callback: async () => {
        await this.activateDashboard();
      },
    });
    // reopens the dashboard (use if the UI is stale or blank)
    this.addCommand({
      id: "reload-chartroom",
      name: "Reload dashboard",
      callback: async () => {
        await this.reloadDashboard();
      },
    });

    this.addCommand({
      id: "open-chartroom-tab",
      name: "Open dashboard in tab",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "T" }],
      callback: async () => {
        try {
          const leaf = this.getTargetLeaf();
          if (!leaf) { new Notice("Chartroom tab: no leaf available"); return; }
          await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
          this.app.workspace.revealLeaf(leaf);
        } catch (err) { new Notice("Chartroom tab failed: " + (err as Error).message); }
      },
    });
    this.addCommand({
      id: "write-letter",
      name: "Write letter to future me",
      callback: async () => {
        new LetterModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    this.addCommand({
      id: "create-next-step",
      name: "Create next step",
      callback: async () => {
        new NextStepModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    this.addCommand({
      id: "create-lesson",
      name: "Create lesson",
      callback: async () => {
        new LessonModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    // settings tab
    this.addSettingTab(new ChartroomSettingTab(this.app, this));

    // ensure folders exist
    await this.ensureFolders();
  }

  async ensureFolders(): Promise<void> {
    for (const f of [this.settings.letterFolder, this.settings.nextStepFolder, this.settings.lessonFolder]) {
      await ensureFolder(this.app, f);
    }
  }

  /** Re-render every open dashboard so a modal's write shows up immediately. */
  async refreshDashboards(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHARTROOM)) {
      const view = leaf.view as unknown as { render?: () => Promise<void> };
      if (view && typeof view.render === "function") await view.render();
    }
  }

  async activateDashboard(): Promise<void> {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) { new Notice("Chartroom: no open leaf to attach to"); return; }
      await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      new Notice("Chartroom failed to open: " + msg);
      console.error("Chartroom activate failed:", err);
    }
  }

  async reloadDashboard(): Promise<void> {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) { new Notice("Chartroom reload: no open leaf"); return; }
      await leaf.setViewState({ type: VIEW_TYPE_CHARTROOM, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      new Notice("Chartroom reload failed: " + (err as Error).message);
      console.error("Chartroom reload failed:", err);
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  onunload(): void {
    // noop
  }

  /**
   * Pick a leaf to host the dashboard view. Reuses an existing chartroom
   * leaf if one is open, otherwise asks the workspace for a fresh leaf.
   * Workspace.getLeaves() does not exist in this Obsidian build, so the
   * public API is used instead.
   */
  private getTargetLeaf(): WorkspaceLeaf | null {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CHARTROOM);
    if (existing.length) return existing[0];
    return this.app.workspace.getLeaf();
  }
}
