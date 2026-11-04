import {
  App,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  View,
  WorkspaceLeaf,
  TFile,
  Modal,
  Notice,
  Menu,
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

export interface KedgeSettings {
  letterFolder: string;
  nextStepFolder: string;
  lessonFolder: string;
}

export const DEFAULT_SETTINGS: KedgeSettings = {
  letterFolder: "Kedge/Letters",
  nextStepFolder: "Kedge/Next-Steps",
  lessonFolder: "Kedge/Lessons",
};

/**
 * The calendar date where the user is, `YYYY-MM-DD`.
 *
 * `toISOString()` is UTC: from 5pm in California it already reads tomorrow, so
 * every date the plugin stamped (`created_at`, `week`, `snooze_until`,
 * `seal_date`) and both of its comparisons (`isSnoozed`, `hasArrived`) were a
 * day ahead all evening.
 */
export function localDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowStr(): string {
  return localDate();
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

/**
 * The frontmatter block: `---\n…\n---` plus the newline after it. CRLF notes
 * match too — a note whose lines end `\r\n` used to parse as having no
 * frontmatter at all, so it silently vanished from the dashboard.
 */
const FRONTMATTER = /^(---[ \t]*\r?\n)([\s\S]*?)(\r?\n---[ \t]*)(\r?\n|$)/;

export function parseFrontmatter(text: string): Record<string, any> {
  const match = FRONTMATTER.exec(text);
  if (!match) return {};
  const obj: Record<string, any> = {};
  for (const line of match[2].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue; // list items and nested YAML carry no key on their line
    const key = line.slice(0, idx).trim();
    if (!key) continue;
    obj[key] = unquote(line.slice(idx + 1).trim());
  }
  return obj;
}

/**
 * A value as a YAML scalar: plain when that reads back unchanged, double-quoted
 * when it would not. `Call the dentist: Monday` is not a valid plain scalar (a
 * colon before a space opens a mapping), so it has to be quoted or Obsidian's
 * Properties panel rejects the note.
 */
export function yamlScalar(value: string | number): string {
  if (typeof value === "number") return String(value);
  const v = String(value);
  if (v === "") return '""';
  const unsafe =
    /^\s|\s$/.test(v) ||
    /:\s|:$/.test(v) ||
    /(^|\s)#/.test(v) ||
    /^[-?:,[\]{}&*!|>'"%@`]/.test(v) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(v) ||
    /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v);
  return unsafe ? JSON.stringify(v) : v;
}

/** Inverts `yamlScalar` for the two quoted forms this plugin writes. */
function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return String(JSON.parse(raw));
    } catch {
      /* hand-written YAML, not JSON-escaped */
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'");
  }
  return raw;
}

export function serializeFrontmatter(obj: Record<string, any>): string {
  const lines = Object.entries(obj).map(([key, value]) => `${key}: ${yamlScalar(value)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

/**
 * Sets or removes single keys and leaves every other line of the block exactly
 * as it was. Rewriting the whole block from a parse is how one drag or one Done
 * click used to flatten `tags:` lists, drop unknown properties, and eat a
 * trailing quote out of a title.
 *
 * `null` removes the key. Removal takes that key's own line only; a nested list
 * underneath it would survive, which is why only scalar keys are removed here.
 */
export function setFrontmatterKeys(
  text: string,
  patch: Record<string, string | number | null>
): string {
  const match = FRONTMATTER.exec(text);
  if (!match) {
    const lines = Object.entries(patch)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${key}: ${yamlScalar(value as string | number)}`);
    return `---\n${lines.join("\n")}\n---\n${text}`;
  }
  const [, open, block, close] = match;
  const eol = open.includes("\r\n") ? "\r\n" : "\n";
  const out: string[] = [];
  const seen = new Set<string>();
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
  // The newline after the closing `---` belongs to the match, so put one back:
  // without it the body ran straight into the delimiter.
  return `${open}${out.join(eol)}${close}${eol}${text.slice(match[0].length)}`;
}

/** Frontmatter for a brand new next-step note; `id` is decided by the caller. */
export function nextStepNote(
  title: string,
  priority: number,
  id: string,
  date = nowStr()
): string {
  return serializeFrontmatter({ id, title, status: "pending", priority, created_at: date });
}

/** Frontmatter for a brand new lesson note; `id` is decided by the caller. */
export function lessonNote(
  claim: string,
  category: string,
  id: string,
  date = nowStr()
): string {
  return serializeFrontmatter({ id, claim, category, week: date, created_at: date });
}

/** Append a dated reply section to a letter note. */
export function appendReply(raw: string, text: string, date = nowStr()): string {
  const sep = raw.endsWith("\n") ? "\n" : "\n\n";
  return raw + sep + `## Reply ${date}\n\n${text}\n`;
}

// --------------------------------------------------------------------- helpers

/** Text after the frontmatter block, so edits never clobber a note body. */
function bodyOf(text: string): string {
  const match = FRONTMATTER.exec(text);
  return match ? text.slice(match[0].length) : text;
}

/** The frontmatter block (trailing newline included) and the body after it. */
function splitNote(text: string): { head: string; body: string } {
  const match = FRONTMATTER.exec(text);
  if (!match) return { head: "", body: text };
  return { head: `${match[1]}${match[2]}${match[3]}\n`, body: text.slice(match[0].length) };
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

/**
 * An id no note in `folder` is using yet: `base`, `base-2`, `base-3`…
 *
 * The file name was made unique while the id inside it was not, so a second
 * "Email Sam" got the same id as the first (and any title with no latin
 * characters got `step-<date>` every time). Every action finds its note by id
 * and stops at the first match, so the twin could never be completed.
 */
async function uniqueId(app: App, folder: string, base: string): Promise<string> {
  const taken = new Set<string>();
  for (const f of await readAllMarkdown(app)) {
    if (!f.path.startsWith(folder)) continue;
    const fm = parseFrontmatter(await app.vault.cachedRead(f));
    taken.add(fm.id ?? idFromTitle(f.basename));
  }
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
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
    await app.vault.modify(file, setFrontmatterKeys(text, { order: i + 1 }));
  }
}

export interface DraggableCard {
  id: string;
  el: HTMLElement;
}

/**
 * Reordering by dragging one card onto another. Pointer events instead of HTML5
 * drag-and-drop, because iOS never fires `dragstart` on a plain div, so on the
 * phone the old handlers did nothing at all.
 *
 * Touch pointers are implicitly captured by the element that got `pointerdown`,
 * so every later `pointermove` still targets the card the drag started on. The
 * card under the finger therefore comes from `document.elementFromPoint` rather
 * than from `evt.target`. Mouse and pen take the same path, so there is a single
 * code path to keep working.
 *
 * On touch the drag starts only at the grip: the grip carries `touch-action:
 * none`, so the pane does not scroll away under the finger. A mouse can start
 * anywhere on the card except on the card's own controls.
 */
export function wireReorder(
  items: DraggableCard[],
  onReorder: (orderedIds: string[]) => void | Promise<void>
): void {
  const ids = items.map((i) => i.id);
  let dragId: string | null = null;
  let hoverId: string | null = null;

  /** Class test that works on a real element and on the test double. */
  const hasClass = (node: any, cls: string): boolean =>
    typeof node?.classList?.contains === "function"
      ? node.classList.contains(cls)
      : typeof node?.hasClass === "function" && node.hasClass(cls);

  const closestClass = (node: any, cls: string): any => {
    let cur = node;
    while (cur) {
      if (hasClass(cur, cls)) return cur;
      cur = cur.parentNode ?? cur.parent ?? null;
    }
    return null;
  };

  const cardFor = (node: any): DraggableCard | null => {
    let cur = node;
    while (cur) {
      const found = items.find((i) => i.el === cur);
      if (found) return found;
      cur = cur.parentNode ?? cur.parent ?? null;
    }
    return null;
  };

  /** What the finger is over right now, capture or no capture. */
  const cardUnder = (evt: any): DraggableCard | null => {
    const doc: any = typeof document === "undefined" ? null : document;
    const { clientX: x, clientY: y } = evt ?? {};
    const at =
      doc && typeof doc.elementFromPoint === "function" && typeof x === "number" && typeof y === "number"
        ? doc.elementFromPoint(x, y)
        : null;
    return cardFor(at ?? evt?.target ?? null);
  };

  const markTarget = (card: DraggableCard | null) => {
    hoverId = card && card.id !== dragId ? card.id : null;
    for (const item of items) {
      if (item.id === hoverId) item.el.addClass("kedge-drop-target");
      else item.el.removeClass("kedge-drop-target");
    }
  };

  /** Drops the drag state and repaints; `commit` decides whether the drop counts. */
  const settle = (commit: boolean) => {
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
    el.addEventListener("pointerdown", (evt: any) => {
      if (dragId) return;
      if (typeof evt?.button === "number" && evt.button !== 0) return;
      const fromGrip = closestClass(evt?.target, "kedge-grip") !== null;
      if (evt?.pointerType === "touch" && !fromGrip) return;
      if (!fromGrip) {
        if (closestClass(evt?.target, "kedge-actions")) return;
        if (evt?.target?.closest?.("input, textarea, select, a, button")) return;
      }
      dragId = item.id;
      el.addClass("kedge-dragging");
      try {
        (el as any).setPointerCapture?.(evt.pointerId);
      } catch {
        /* best effort: elementFromPoint still resolves the target without it */
      }
      evt?.preventDefault?.();
    });
    el.addEventListener("pointermove", (evt: any) => {
      if (!dragId) return;
      evt?.preventDefault?.();
      markTarget(cardUnder(evt));
    });
    // pointerup commits; pointercancel (the browser took the gesture back, or the
    // finger left the screen mid-drag) must never write an order.
    el.addEventListener("pointerup", () => {
      if (dragId) settle(true);
    });
    el.addEventListener("pointercancel", () => {
      if (dragId) settle(false);
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
  const wrap = parent.createDiv({ cls: "kedge-field" });
  wrap.createEl("label", { cls: "kedge-field-label", text: label });
  return wrap;
}

function fieldHint(wrap: HTMLElement, text: string): void {
  wrap.createDiv({ cls: "kedge-field-hint", text });
}

function textField(
  parent: HTMLElement,
  label: string,
  opts: { placeholder?: string; value?: string; hint?: string; type?: string } = {}
): HTMLInputElement {
  const wrap = fieldWrap(parent, label);
  const input = wrap.createEl("input", { cls: "kedge-input" });
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
    cls: opts.tall ? "kedge-textarea kedge-textarea-tall" : "kedge-textarea",
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

function modalActions(
  parent: HTMLElement,
  primaryLabel: string,
  onPrimary: () => void,
  onCancel: () => void
): void {
  const row = parent.createDiv({ cls: "kedge-modal-actions" });
  const cancel = row.createEl("button", { cls: "kedge-btn", text: "Cancel" });
  const primary = row.createEl("button", {
    cls: "kedge-btn kedge-btn-primary",
    text: primaryLabel,
  });
  cancel.onclick = onCancel;
  primary.onclick = onPrimary;
}

/** Gives the modal the plugin's width and form styling. */
function applyModalClass(modal: Modal): void {
  modal.modalEl.addClass("kedge-modal");
}

// --------------------------------------------------------------------- next step modal

class NextStepModal extends Modal {
  plugin: KedgePlugin;
  onDone: () => void | Promise<void>;
  existing?: NextStep;
  titleEl!: HTMLInputElement;
  priorityChoice!: { getValue: () => string };

  constructor(
    app: App,
    plugin: KedgePlugin,
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

    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof TFile)) {
        new Notice("Step file not found.");
        return;
      }
      // Patch the two fields that changed. Everything else in the note —
      // status, order, tags, anything Obsidian wrote — stays exactly as it was.
      const raw = await app.vault.cachedRead(file);
      await app.vault.modify(file, setFrontmatterKeys(raw, { title, priority }));
      new Notice("Next step updated.");
    } else {
      const id = await uniqueId(
        app,
        settings.nextStepFolder,
        idFromTitle(title) || `step-${nowStr()}`
      );
      const path = uniqueNotePath(app, settings.nextStepFolder, id);
      await saveNote(app, path, nextStepNote(title, priority, id));
      new Notice("Next step created.");
    }
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- lesson modal

class LessonModal extends Modal {
  plugin: KedgePlugin;
  onDone: () => void | Promise<void>;
  existing?: Lesson;
  claimEl!: HTMLInputElement;
  categoryEl!: HTMLInputElement;

  constructor(
    app: App,
    plugin: KedgePlugin,
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

    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof TFile)) {
        new Notice("Lesson file not found.");
        return;
      }
      const raw = await app.vault.cachedRead(file);
      await app.vault.modify(file, setFrontmatterKeys(raw, { claim, category }));
      new Notice("Lesson updated.");
    } else {
      const id = await uniqueId(
        app,
        settings.lessonFolder,
        idFromTitle(claim) || `lesson-${nowStr()}`
      );
      const path = uniqueNotePath(app, settings.lessonFolder, id);
      await saveNote(app, path, lessonNote(claim, category, id));
      new Notice("Lesson saved.");
    }
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- reply modal

class ReplyModal extends Modal {
  plugin: KedgePlugin;
  letter: Letter;
  onDone: () => void | Promise<void>;
  bodyEl!: HTMLTextAreaElement;

  constructor(app: App, plugin: KedgePlugin, letter: Letter, onDone: () => void | Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.letter = letter;
    this.onDone = onDone;
  }

  onOpen(): void {
    applyModalClass(this);
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Reply to past you" });

    const preview = contentEl.createDiv({ cls: "kedge-letter-preview" });
    preview.createDiv({
      cls: "kedge-meta",
      text: `${this.letter.title} · sealed ${this.letter.sealDate} · written ${this.letter.createdAt}`,
    });
    preview.createDiv({ cls: "kedge-letter-body", text: this.letter.body });

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
  plugin: KedgePlugin;
  onDone: () => void | Promise<void>;
  existing?: Letter;
  titleEl!: HTMLInputElement;
  dateEl!: HTMLInputElement;
  bodyEl!: HTMLTextAreaElement;
  previewEl!: HTMLElement;

  constructor(
    app: App,
    plugin: KedgePlugin,
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
      value: this.existing?.sealDate ?? addMonths(6),
    });
    this.dateEl.addEventListener("input", () => this.updatePreview());

    this.bodyEl = textareaField(contentEl, "Letter", {
      placeholder: "Write notes for your future self, not for an audience.",
      tall: true,
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

  private updatePreview(): void {
    const date = this.dateEl.value.trim();
    this.previewEl.setText(
      date ? `Will come back on ${formatDate(date)}` : "Pick a date to bring it back."
    );
  }

  private async save(): Promise<void> {
    const title = this.titleEl.value.trim() || "Untitled letter";
    const sealDate = this.dateEl.value.trim() || nowStr();
    const body = this.bodyEl.value;
    const existing = this.existing;
    const { app, settings } = this.plugin;

    if (existing) {
      const file = app.vault.getAbstractFileByPath(existing.path);
      if (!(file instanceof TFile)) {
        new Notice("Letter file not found.");
        return;
      }
      // Title and date are patched in place; the body is replaced wholesale
      // because that is what the textarea showed.
      const raw = await app.vault.cachedRead(file);
      const { head } = splitNote(setFrontmatterKeys(raw, { title, seal_date: sealDate }));
      await saveNote(app, existing.path, head + body);
      new Notice(`Letter saved. Returns ${sealDate}.`);
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
        created_at: nowStr(),
      });
      await saveNote(app, path, fm + body);
      new Notice(`Letter sealed. Returns ${sealDate}.`);
    }
    this.close();
    await this.onDone();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// --------------------------------------------------------------------- dashboard view

export const VIEW_TYPE_KEDGE = "kedge-dashboard";

export class KedgeView extends View {
  plugin: KedgePlugin;
  container!: HTMLElement;
  lessonQuery = "";

  constructor(leaf: WorkspaceLeaf, plugin: KedgePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_KEDGE;
  }

  getDisplayText(): string {
    return "Kedge";
  }

  async onOpen(): Promise<void> {
    this.container = this.containerEl;
    this.container.style.overflow = "auto";
    this.container.style.height = "100%";
    this.container.empty();
    this.container.addClass("kedge-view");
    await this.plugin.refreshDashboards();
  }

  async render(): Promise<void> {
    try {
      await this.renderBody();
    } catch (err) {
      new Notice("Kedge render failed: " + (err as Error).message);
      console.error("Kedge render failed:", err);
    }
  }

  /** Title row that leaves space for section-level actions. */
  private sectionHead(parent: HTMLElement, title: string): HTMLElement {
    const head = parent.createDiv({ cls: "kedge-section-head" });
    head.createEl("h2", { text: title });
    return head.createDiv({ cls: "kedge-actions" });
  }

  /** "Open dashboard: ⌘⇧D  ·  New letter: ⌘⇧M  …", live bindings only. */
  private shortcutHints(entries: Array<[string, string]>): string {
    return entries
      .map(([label, id]) => {
        const keys = this.hotkeyLabel(id);
        return keys ? `${label}: ${keys}` : "";
      })
      .filter(Boolean)
      .join("  ·  ");
  }

  /**
   * The command's effective binding, printed by Obsidian itself
   * (`app.hotkeyManager.printHotkeyForCommand`). That manager is internal and
   * absent from the public types, so a missing one yields no shortcut at all
   * rather than a guess — the header used to print keys nothing was bound to.
   */
  private hotkeyLabel(commandId: string): string {
    const manager = (this.plugin.app as any)?.hotkeyManager;
    if (typeof manager?.printHotkeyForCommand !== "function") return "";
    const fullId = `${this.plugin.manifest?.id ?? "kedge"}:${commandId}`;
    try {
      return String(manager.printHotkeyForCommand(fullId) ?? "").trim();
    } catch {
      return "";
    }
  }

  private async renderBody(): Promise<void> {
    const { app, settings } = this.plugin;
    this.container.empty();

    // header
    const header = this.container.createDiv({ cls: "kedge-section" });
    header.createEl("h2", { text: "⚓ Kedge" });
    const hints = this.shortcutHints([
      ["Open dashboard", "open-dashboard"],
      ["New letter", "write-letter"],
      ["New step", "create-next-step"],
      ["New lesson", "create-lesson"],
    ]);
    if (hints) header.createDiv({ cls: "kedge-meta", text: hints });

    // ---- Next best step ----
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
      card.createDiv({ cls: "kedge-card-title", text: best.title });
      card.createDiv({ cls: "kedge-card-body", text: "Do this now. Everything else can wait." });
      const actions = card.createDiv({ cls: "kedge-actions" });
      const doneBtn = actions.createEl("button", { cls: "mod-clickable", text: "Done" });
      const snoozeBtn = actions.createEl("button", { cls: "mod-clickable", text: "Snooze" });
      doneBtn.onclick = async () => {
        await this.markStepDone(best.id);
        await this.plugin.refreshDashboards();
      };
      snoozeBtn.onclick = async () => {
        await this.snoozeStep(best.id);
        await this.plugin.refreshDashboards();
      };
    } else {
      const empty = bestSection.createDiv({ cls: "kedge-empty" });
      empty.createDiv({ text: "No pending next steps." });
      const actions = empty.createDiv({ cls: "kedge-actions" });
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
        meta.createEl("span", { text: `Written ${letter.createdAt}` });
        const actions = card.createDiv({ cls: "kedge-actions" });
        const replyBtn = actions.createEl("button", { cls: "mod-clickable", text: "Reply to past me" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable kedge-danger",
          text: "Delete",
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
      text: "+ New letter",
    });
    newLetterBtn.onclick = () => this.openNewLetterModal();
    if (scheduled.length > 0) {
      for (const letter of scheduled) {
        const row = scheduledSection.createDiv({ cls: "kedge-letter-row" });
        // full detail stays on hover; the list keeps to one line per letter
        row.title = `opens ${formatDate(letter.sealDate)} · written ${letter.createdAt}`;
        row.createDiv({ cls: "kedge-letter-row-title", text: letter.title });
        const actions = row.createDiv({ cls: "kedge-actions" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const deleteBtn = actions.createEl("button", {
          cls: "mod-clickable kedge-danger",
          text: "Delete",
        });
        editBtn.onclick = () => this.openEditLetterModal(letter);
        deleteBtn.onclick = async () => {
          await this.deleteLetter(letter);
          await this.plugin.refreshDashboards();
        };
      }
    } else {
      scheduledSection.createDiv({
        cls: "kedge-empty",
        text: "Nothing scheduled. Write a letter and pick when it comes back.",
      });
    }

    // ---- Next steps list ----
    const listSection = this.container.createDiv({ cls: "kedge-section" });
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
        const card = listSection.createDiv({ cls: "kedge-card kedge-draggable" });
        dragCards.push({ id: step.id, el: card });
        const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
        head.createSpan({ cls: "kedge-grip", text: "⠿" });
        head.createSpan({ text: step.title });
        const meta = card.createDiv({ cls: "kedge-meta" });
        meta.createEl("span", { text: `${priorityLabel(step.priority)} priority` });
        if (step.status === "working") {
          meta.createEl("span", { text: " · working on it" });
        }
        const actions = card.createDiv({ cls: "kedge-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        const editBtn = actions.createEl("button", { cls: "mod-clickable", text: "Edit" });
        const snoozeBtn = actions.createEl("button", { cls: "mod-clickable", text: "Snooze" });
        const doneBtn = actions.createEl("button", { cls: "mod-clickable", text: "Done" });
        if (step.status === "working") {
          doBtn.disabled = true; // already the one you are working on
        } else {
          doBtn.onclick = async () => {
            await this.startStep(step.id);
            await this.plugin.refreshDashboards();
          };
        }
        editBtn.onclick = () => this.openEditStepModal(step);
        snoozeBtn.onclick = async () => {
          await this.snoozeStep(step.id);
          await this.plugin.refreshDashboards();
        };
        doneBtn.onclick = async () => {
          await this.markStepDone(step.id);
          await this.plugin.refreshDashboards();
        };
      }
      wireReorder(dragCards, (ids) => this.reorderSteps(ids));
    } else if (snoozedSteps.length === 0) {
      listSection.createDiv({ cls: "kedge-empty", text: "Nothing to do." });
    }

    if (snoozedSteps.length > 0) {
      listSection.createDiv({ cls: "kedge-subhead", text: "Snoozed" });
      for (const step of snoozedSteps) {
        const card = listSection.createDiv({ cls: "kedge-card kedge-snoozed" });
        card.createDiv({ cls: "kedge-card-title", text: step.title });
        const meta = card.createDiv({ cls: "kedge-meta" });
        meta.createEl("span", {
          text: step.snoozeUntil ? `snoozed until ${step.snoozeUntil}` : "snoozed",
        });
        const actions = card.createDiv({ cls: "kedge-actions" });
        const doBtn = actions.createEl("button", { cls: "mod-clickable", text: "Do" });
        doBtn.onclick = async () => {
          await this.startStep(step.id);
          await this.plugin.refreshDashboards();
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
  private renderLessons(container: HTMLElement, lessons: Lesson[]): void {
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

    const dragCards: DraggableCard[] = [];
    for (const lesson of matches) {
      const card = container.createDiv({ cls: "kedge-card kedge-draggable" });
      dragCards.push({ id: lesson.id, el: card });
      const head = card.createDiv({ cls: "kedge-card-title kedge-card-head" });
      head.createSpan({ cls: "kedge-grip", text: "⠿" });
      head.createSpan({ cls: "kedge-claim", text: lesson.claim });
      // One caret on the right instead of two buttons under every claim. The
      // menu is Obsidian's own, so it positions itself and turns into a sheet
      // on the phone without a line of positioning code here.
      const menuBtn = head.createEl("button", {
        cls: "kedge-menu-button",
        text: "⋯",
      });
      menuBtn.setAttribute("aria-label", "Lesson actions");
      menuBtn.onclick = (evt: MouseEvent) => {
        const menu = new Menu();
        menu.addItem((item) =>
          item
            .setTitle("Edit")
            .setIcon("pencil")
            .onClick(() => this.openEditLessonModal(lesson)),
        );
        menu.addItem((item) =>
          item
            .setTitle("Delete")
            .setIcon("trash")
            .onClick(async () => {
              await this.deleteLesson(lesson);
              await this.plugin.refreshDashboards();
            }),
        );
        menu.showAtMouseEvent(evt);
      };
      const meta = card.createDiv({ cls: "kedge-meta" });
      if (lesson.category) meta.createEl("span", { text: lesson.category });
      if (lesson.week) meta.createEl("span", { text: ` · ${lesson.week}` });
    }
    // reordering only makes sense on the full, unfiltered list
    if (!this.lessonQuery.trim()) {
      wireReorder(dragCards, (ids) => this.reorderLessons(ids));
    }
  }

  // ---- modal launchers -------------------------------------------------

  private openNewStepModal(): void {
    new NextStepModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }

  private openNewLessonModal(): void {
    new LessonModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }

  private openEditLessonModal(lesson: Lesson): void {
    new LessonModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), lesson).open();
  }

  private openReplyModal(letter: Letter): void {
    new ReplyModal(this.app, this.plugin, letter, () => this.plugin.refreshDashboards()).open();
  }

  private openEditStepModal(step: NextStep): void {
    new NextStepModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), step).open();
  }

  private openNewLetterModal(): void {
    new LetterModal(this.app, this.plugin, () => this.plugin.refreshDashboards()).open();
  }

  private openEditLetterModal(letter: Letter): void {
    new LetterModal(this.app, this.plugin, () => this.plugin.refreshDashboards(), letter).open();
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
    await this.plugin.refreshDashboards();
  }

  private async reorderLessons(ids: string[]): Promise<void> {
    await applyOrder(this.plugin.app, this.plugin.settings.lessonFolder, ids);
    await this.plugin.refreshDashboards();
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

  /**
   * Patches one next step by id and leaves the rest of its note alone — a Done
   * click used to rewrite the whole frontmatter block from a lossy parse, which
   * cost the note its tags and its quoted values.
   */
  private async patchStep(
    id: string,
    patch: Record<string, string | number | null>
  ): Promise<void> {
    const { app, settings } = this.plugin;
    for (const f of await readAllMarkdown(app)) {
      if (!f.path.startsWith(settings.nextStepFolder)) continue;
      const text = await app.vault.cachedRead(f);
      const fm = parseFrontmatter(text);
      if ((fm.id ?? idFromTitle(f.basename)) !== id) continue;
      await app.vault.modify(f, setFrontmatterKeys(text, patch));
      return;
    }
  }

  private async markStepDone(id: string): Promise<void> {
    await this.patchStep(id, { status: "done" });
  }

  private async snoozeStep(id: string): Promise<void> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await this.patchStep(id, { status: "snoozed", snooze_until: localDate(tomorrow) });
  }

  /** Marks a step as the one being worked on, clearing any snooze. */
  private async startStep(id: string): Promise<void> {
    await this.patchStep(id, { status: "working", snooze_until: null });
  }

  async onClose(): Promise<void> {
    // noop
  }
}

// --------------------------------------------------------------------- settings tab

class KedgeSettingTab extends PluginSettingTab {
  plugin: KedgePlugin;

  constructor(app: App, plugin: KedgePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Kedge settings" });

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

export default class KedgePlugin extends Plugin {
  settings!: KedgeSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    // register dashboard view
    this.registerView(VIEW_TYPE_KEDGE, (leaf) => new KedgeView(leaf, this));

    // ribbon icon
    this.addRibbonIcon("mail", "Open Kedge", async () => {
      await this.activateDashboard();
    });

    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "D" }],
      callback: async () => {
        await this.activateDashboard();
      },
    });
    // No "open in tab" / "reload" twins: opening an existing Kedge leaf
    // re-renders it, so all three were the same call.
    this.addCommand({
      id: "open-dashboard-sidebar",
      name: "Open dashboard in the sidebar",
      callback: async () => {
        await this.activateDashboardInSidebar();
      },
    });
    this.addCommand({
      id: "write-letter",
      name: "Write letter to future me",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "M" }],
      callback: async () => {
        new LetterModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    this.addCommand({
      id: "create-next-step",
      name: "Create next step",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "N" }],
      callback: async () => {
        new NextStepModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    this.addCommand({
      id: "create-lesson",
      name: "Create lesson",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "L" }],
      callback: async () => {
        new LessonModal(this.app, this, () => this.refreshDashboards()).open();
      },
    });

    // settings tab
    this.addSettingTab(new KedgeSettingTab(this.app, this));

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
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE)) {
      const view = leaf.view as unknown as { render?: () => Promise<void> };
      if (view && typeof view.render === "function") await view.render();
    }
  }

  async activateDashboard(): Promise<void> {
    try {
      const leaf = this.getTargetLeaf();
      if (!leaf) { new Notice("Kedge: no open leaf to attach to"); return; }
      await leaf.setViewState({ type: VIEW_TYPE_KEDGE, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      new Notice("Kedge failed to open: " + msg);
      console.error("Kedge activate failed:", err);
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
  async activateDashboardInSidebar(): Promise<void> {
    try {
      const leaf = Platform.isMobile
        ? this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE)[0] ?? this.app.workspace.getLeaf("tab")
        : this.app.workspace.getRightLeaf(false);
      if (!leaf) { new Notice("Kedge: no leaf to attach to"); return; }
      await leaf.setViewState({ type: VIEW_TYPE_KEDGE, state: {} });
      this.app.workspace.revealLeaf(leaf);
    } catch (err) {
      new Notice("Kedge failed to open: " + (err as Error).message);
      console.error("Kedge sidebar failed:", err);
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
   * Pick a leaf to host the dashboard view. Reuses an existing kedge
   * leaf if one is open, otherwise asks the workspace for a fresh leaf.
   * Workspace.getLeaves() does not exist in this Obsidian build, so the
   * public API is used instead.
   */
  private getTargetLeaf(): WorkspaceLeaf | null {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_KEDGE);
    if (existing.length) return existing[0];
    return this.app.workspace.getLeaf();
  }
}
