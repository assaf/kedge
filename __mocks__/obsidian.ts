/**
 * Obsidian API stand-in for jest. Node has no DOM, so `El` reproduces the
 * bits of Obsidian's HTMLElement augmentation the plugin uses (createDiv,
 * createEl, createSpan, empty, addClass) plus a few real properties so
 * tests can drive the UI the way a click would.
 *
 * Keep this surface honest: whenever the plugin starts using a real Obsidian
 * API, add it here with the same shape, or the tests will pass while the
 * plugin fails in Obsidian.
 */

export const registeredCommands: any[] = [];
export const notices: string[] = [];
export const openedModals: any[] = [];

export class El {
  tag: string;
  cls: string[] = [];
  text = '';
  children: El[] = [];
  parent: El | null = null;
  listeners: Record<string, Array<(evt?: any) => any>> = {};
  style: Record<string, any> = {};
  placeholder = '';
  value = '';
  onclick: any = null;
  disabled = false;
  constructor(tag = 'div', opts: any = {}) {
    this.tag = tag;
    if (opts.cls) this.cls = String(opts.cls).split(' ');
    if (opts.text != null) this.text = String(opts.text);
    if (opts.value != null) this.value = String(opts.value);
  }

  private make(tag: string, opts: any): El {
    const el = new El(tag, opts);
    el.parent = this;
    this.children.push(el);
    return el;
  }
  createDiv(opts: any = {}) { return this.make('div', opts); }
  createEl(tag: string, opts: any = {}) { return this.make(tag, opts); }
  createSpan(opts: any = {}) { return this.make('span', opts); }
  addClass(c: string) { if (!this.cls.includes(c)) this.cls.push(c); }
  removeClass(c: string) { this.cls = this.cls.filter((x) => x !== c); }
  hasClass(c: string) { return this.cls.includes(c); }
  empty() { this.children = []; }
  appendChild(c: El) { c.parent = this; this.children.push(c); return c; }
  focus() { /* no-op */ }
  setText(text: string) { this.text = String(text); this.children = []; }
  setAttribute() { /* no-op */ }
  addEventListener(type: string, cb: (evt?: any) => any) {
    (this.listeners[type] ||= []).push(cb);
  }
  dispatch(type: string, evt: any = {}) {
    for (const cb of this.listeners[type] ?? []) cb(evt);
  }

  all(pred: (e: El) => boolean, out: El[] = []): El[] {
    for (const c of this.children) {
      if (pred(c)) out.push(c);
      c.all(pred, out);
    }
    return out;
  }
  buttons(): El[] { return this.all((e) => e.tag === 'button'); }
  buttonTexts(): string[] { return this.buttons().map((b) => b.text); }
  ofTag(tag: string): El[] { return this.all((e) => e.tag === tag); }
}

export class TFile {
  path = '';
  basename = '';
  content = '';
}

export class App {
  settings: any;
  async loadData() { return {}; }
  async saveData(_data: any) {}
  registerView(_viewType: string, _view: any) {}
  addRibbonIcon(_icon: string, _name: string, _cb: any) {}
  addCommand(cmd: any) { registeredCommands.push(cmd); }
  addSettingTab(settingTab: any) { /* no-op */ }
}

export class Plugin {
  settings: any;
  async loadData() { return {}; }
  async saveData(_data: any) {}
  registerView(_viewType: string, _view: any) {}
  addRibbonIcon(_icon: string, _name: string, _cb: any) {}
  addCommand(cmd: any) { registeredCommands.push(cmd); }
  addSettingTab(settingTab: any) { /* no-op */ }
}

export class PluginSettingTab {
  constructor(public app?: any, public plugin?: any) {}
  containerEl = new El();
}

export class TextComponent {
  inputEl = new El('input');
  onChangeCb: ((value: string) => any) | null = null;

  constructor(parent?: El) {
    parent?.appendChild(this.inputEl);
  }
  setPlaceholder(p: string) { this.inputEl.placeholder = p; return this; }
  setValue(v: string) { this.inputEl.value = v; return this; }
  getValue() { return this.inputEl.value; }
  onChange(cb: (value: string) => any) { this.onChangeCb = cb; return this; }
}

export class DropdownComponent {
  selectEl = new El('select');
  options: Array<[string, string]> = [];

  constructor(parent?: El) {
    parent?.appendChild(this.selectEl);
  }
  addOption(value: string, display: string) {
    this.options.push([value, display]);
    if (!this.selectEl.value) this.selectEl.value = value;
    return this;
  }
  addOptions(opts: Record<string, string>) {
    for (const [value, display] of Object.entries(opts)) this.addOption(value, display);
    return this;
  }
  setValue(value: string) { this.selectEl.value = value; return this; }
  getValue() { return this.selectEl.value; }
  onChange(cb: (value: string) => any) { this.onChangeCb = cb; return this; }
  onChangeCb: ((value: string) => any) | null = null;
}

export class ButtonComponent {
  buttonEl = new El('button');
  onClickCb: (() => any) | null = null;

  constructor(parent?: El) {
    parent?.appendChild(this.buttonEl);
  }
  setButtonText(text: string) { this.buttonEl.text = text; return this; }
  setCta() { this.buttonEl.cls.push('mod-cta'); return this; }
  setDisabled(disabled: boolean) { this.buttonEl.disabled = disabled; return this; }
  onClick(cb: () => any) {
    this.onClickCb = cb;
    this.buttonEl.onclick = cb;
    return this;
  }
}

export class Setting {
  constructor(public containerEl?: El) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  setHeading() { return this; }
  addText(cb: (text: TextComponent) => any) {
    cb(new TextComponent(this.containerEl));
    return this;
  }
  addDropdown(cb: (dd: DropdownComponent) => any) {
    cb(new DropdownComponent(this.containerEl));
    return this;
  }
  addButton(cb: (btn: ButtonComponent) => any) {
    cb(new ButtonComponent(this.containerEl));
    return this;
  }
}

export class View {
  containerEl = new El();
  viewType?: string;
  constructor(public leaf?: any) {}
}

export class WorkspaceLeaf {
  public viewType: string | undefined;
  public view: any = null;
  public setViewState = jest.fn(async (_state: any) => {});
  public openFile = jest.fn(async (_file: any) => {});
}

export class Workspace {
  rightLeaf: WorkspaceLeaf | null = null;
  constructor(public leaves: WorkspaceLeaf[] = []) {}
  getLeaves() { return this.leaves; }
  getLeavesOfType(viewType: string) { return this.leaves.filter(l => l.viewType === viewType); }
  getLeaf() { return this.leaves[0] ?? null; }
  getRightLeaf(_split: boolean) { return this.rightLeaf ?? this.leaves[0] ?? null; }
  revealLeaf = jest.fn();
}

export class Vault {
  adapter = {
    exists: () => Promise.resolve(false),
    mkdir: () => Promise.resolve(),
    modify: () => Promise.resolve(),
    create: () => Promise.resolve(),
  };
  getMarkdownFiles() { return []; }
  getAbstractFileByPath(_path: string) { return null; }
  cachedRead(_file: any) { return Promise.resolve(''); }
  modify(_file: any, _content: string) { return Promise.resolve(); }
  create(_path: string, _content: string) { return Promise.resolve(); }
  delete(_file: any) { return Promise.resolve(); }
}

export class Modal {
  containerEl = new El('div');
  modalEl = new El('div');
  contentEl = new El('div');
  closed = false;

  constructor(public app?: any) {
    openedModals.push(this);
  }
  open() { (this as any).onOpen?.(); }
  close() {
    this.closed = true;
    (this as any).onClose?.();
  }
}

export class Notice {
  constructor(message?: string) {
    if (message) notices.push(message);
  }
}

export class MarkdownView {}
export class Component {}
export class ItemView extends View {}

export const VIEW_TYPE_KEDGE = "kedge-dashboard";
