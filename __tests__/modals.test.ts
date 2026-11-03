import { ChartroomView, DEFAULT_SETTINGS, nowStr } from '../main';
import { TFile, El, notices, openedModals } from 'obsidian';

/** Lets the fire-and-forget `void this.save()` handlers finish: every vault
 *  operation in the mock is an already-resolved promise, so draining the
 *  microtask queue is enough and costs no wall-clock time. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) await Promise.resolve();
};

function noteFile(path: string, content: string): TFile {
  const file = new TFile();
  file.path = path;
  file.basename = path.split('/').pop()!.replace(/\.md$/, '');
  file.content = content;
  return file;
}

const STEP = '---\nid: call-the-dentist\ntitle: Call the dentist\nstatus: pending\npriority: 1\ncreated_at: 2026-11-01\n---\n';
const STEP2 = '---\nid: renew-passport\ntitle: Renew passport\nstatus: pending\npriority: 2\ncreated_at: 2026-11-02\n---\n';
const STEP_SNOOZED = '---\nid: file-taxes\ntitle: File taxes\nstatus: snoozed\npriority: 2\nsnooze_until: 2099-01-01\ncreated_at: 2026-11-01\n---\n';
const LETTER = '---\nid: dear-future-me\ntitle: Dear future me\nstatus: delivered\nseal_date: 2026-10-01\ncreated_at: 2026-04-01\n---\nSleep more.';
const LESSON = '---\nid: ship-it\nclaim: Ship the boring version first\ncategory: product\nweek: 2026-10-20\ncreated_at: 2026-10-20\n---\n';

function makeCtx() {
  const store = [
    noteFile('Chartroom/Next-Steps/call-the-dentist.md', STEP),
    noteFile('Chartroom/Next-Steps/renew-passport.md', STEP2),
    noteFile('Chartroom/Next-Steps/file-taxes.md', STEP_SNOOZED),
    noteFile('Chartroom/Letters/dear-future-me.md', LETTER),
    noteFile('Chartroom/Lessons/ship-it.md', LESSON),
  ];
  const created: Array<{ path: string; content: string }> = [];
  const modified: Array<{ path: string; content: string }> = [];
  const deleted: string[] = [];

  const vault = {
    adapter: { exists: () => Promise.resolve(true), mkdir: () => Promise.resolve() },
    getMarkdownFiles: () => store,
    getAbstractFileByPath: (path: string) => store.find((f) => f.path === path) ?? null,
    cachedRead: (f: TFile) => Promise.resolve(f.content),
    modify: (f: TFile, content: string) => {
      modified.push({ path: f.path, content });
      f.content = content;
      return Promise.resolve();
    },
    create: (path: string, content: string) => {
      created.push({ path, content });
      store.push(noteFile(path, content));
      return Promise.resolve();
    },
    delete: (f: TFile) => {
      deleted.push(f.path);
      const idx = store.indexOf(f);
      if (idx >= 0) store.splice(idx, 1);
      return Promise.resolve();
    },
  };

  const opened: string[] = [];
  const leaf = {
    openFile: (f: TFile) => {
      opened.push(f.path);
      return Promise.resolve();
    },
  };
  const plugin: any = {
    app: { vault, workspace: { getLeavesOfType: () => [], getLeaf: () => leaf } },
    settings: { ...DEFAULT_SETTINGS },
  };
  const view: any = new ChartroomView({} as any, plugin);
  const root = new El('div');
  view.container = root;
  return { view, root, created, modified, deleted, opened };
}

function lastModal(): any {
  return openedModals[openedModals.length - 1];
}

function click(root: El, text: string): void {
  const btn = root.buttons().find((b) => b.text === text);
  if (!btn) throw new Error(`no button "${text}" in ${JSON.stringify(root.buttonTexts())}`);
  btn.onclick();
}

/** The dashboard section whose heading is `title`. */
function section(root: El, title: string): El {
  const heading = root.all((e) => e.tag === 'h2' && e.text === title)[0];
  let el = heading?.parent ?? null;
  while (el && !el.hasClass('chartroom-section')) el = el.parent;
  if (!el) throw new Error(`no section "${title}"`);
  return el;
}

function cardsIn(sectionEl: El): El[] {
  return sectionEl.children.filter((c) => c.hasClass('chartroom-draggable'));
}

/** Card text, ignoring the ⠿ drag grip. */
function cardTitle(card: El): string {
  const title = card.all((e) => e.hasClass('chartroom-card-title'))[0];
  if (!title) return '';
  const span = title.all((e) => e.tag === 'span' && e.text !== '' && e.text !== '⠿')[0];
  return span ? span.text : title.text;
}

beforeEach(() => {
  notices.length = 0;
  openedModals.length = 0;
  (globalThis as any).window = { confirm: () => true };
});

describe('New next step', () => {
  test('dashboard button opens a form that writes a pending note', async () => {
    const { view, root, created } = makeCtx();
    await view.render();

    click(root, '+ New step');
    const modal = lastModal();
    expect(modal).toBeDefined();

    // the field is a real full-width input, not a cramped Setting control
    const input = modal.contentEl.ofTag('input')[0];
    expect(input.cls).toContain('chartroom-input');
    expect(modal.modalEl.cls).toContain('chartroom-modal');

    modal.contentEl.ofTag('input')[0].value = 'Call the accountant';
    click(modal.contentEl, 'highest');
    click(modal.contentEl, 'Create');
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0].path).toBe('Chartroom/Next-Steps/call-the-accountant.md');
    expect(created[0].content).toContain('status: pending');
    expect(created[0].content).toContain('priority: 1');
    expect(modal.closed).toBe(true);
  });

  test('a title that already exists gets its own note instead of overwriting', async () => {
    const { view, root, created, modified } = makeCtx();
    await view.render();

    click(root, '+ New step');
    const modal = lastModal();
    modal.contentEl.ofTag('input')[0].value = 'Call the dentist';
    click(modal.contentEl, 'Create');
    await flush();

    expect(modified).toHaveLength(0);
    expect(created[0].path).toBe('Chartroom/Next-Steps/call-the-dentist-2.md');
  });

  test('refuses to create a step without a title', async () => {
    const { view, root, created } = makeCtx();
    await view.render();

    click(root, '+ New step');
    const modal = lastModal();
    click(modal.contentEl, 'Create');
    await flush();

    expect(created).toHaveLength(0);
    expect(notices).toContain('Give the step a title.');
  });
});

describe('Reply to past me', () => {
  test('opens an editor and appends the reply to the letter note', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    click(root, 'Reply to past me');
    const modal = lastModal();
    expect(modal).toBeDefined();

    // the letter is shown inside the modal, not in a new tab
    expect(modal.contentEl.all((e) => e.text === 'Sleep more.').length).toBe(1);

    modal.contentEl.ofTag('textarea')[0].value = 'Sleeping more now.';
    click(modal.contentEl, 'Save reply');
    await flush();

    expect(modified).toHaveLength(1);
    expect(modified[0].path).toBe('Chartroom/Letters/dear-future-me.md');
    expect(modified[0].content.startsWith(LETTER)).toBe(true);
    expect(modified[0].content).toContain(`## Reply ${nowStr()}`);
    expect(modified[0].content).toContain('Sleeping more now.');
  });

  test('does not write an empty reply', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    click(root, 'Reply to past me');
    click(lastModal().contentEl, 'Save reply');
    await flush();

    expect(modified).toHaveLength(0);
    expect(notices).toContain('Write something first.');
  });
});

describe('Lessons', () => {
  test('New lesson writes a lesson note', async () => {
    const { view, root, created } = makeCtx();
    await view.render();

    click(root, '+ New lesson');
    const modal = lastModal();
    modal.contentEl.ofTag('input')[0].value = 'Ask for the sale';
    modal.contentEl.ofTag('input')[1].value = 'sales';
    click(modal.contentEl, 'Create');
    await flush();

    expect(created).toHaveLength(1);
    expect(created[0].path).toBe('Chartroom/Lessons/ask-for-the-sale.md');
    expect(created[0].content).toContain('claim: Ask for the sale');
    expect(created[0].content).toContain('category: sales');
  });

  test('Edit updates the same note and keeps its id, week and created date', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    click(section(root, 'Lessons'), 'Edit');
    const modal = lastModal();
    const inputs = modal.contentEl.ofTag('input');
    expect(inputs[0].value).toBe('Ship the boring version first'); // prefilled
    expect(inputs[1].value).toBe('product');

    inputs[0].value = 'Ship the smallest thing first';
    click(modal.contentEl, 'Save');
    await flush();

    expect(modified).toHaveLength(1);
    expect(modified[0].path).toBe('Chartroom/Lessons/ship-it.md');
    expect(modified[0].content).toContain('id: ship-it');
    expect(modified[0].content).toContain('claim: Ship the smallest thing first');
    expect(modified[0].content).toContain('week: 2026-10-20');
    expect(modified[0].content).toContain('created_at: 2026-10-20');
  });

  test('Delete removes the lesson note and re-renders without it', async () => {
    const { view, root, deleted } = makeCtx();
    await view.render();

    click(root, 'Delete');
    await flush();

    expect(deleted).toEqual(['Chartroom/Lessons/ship-it.md']);
    expect(root.all((e) => e.text === 'Ship the boring version first')).toEqual([]);
  });
});

describe('Editing and reordering next steps', () => {
  test('Edit opens the step prefilled and saves it in place', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    click(section(root, 'Next steps'), 'Edit');
    const modal = lastModal();
    const input = modal.contentEl.ofTag('input')[0];
    expect(input.value).toBe('Call the dentist');
    // priority is offered as words, with the stored number pre-selected
    const active = modal.contentEl.all((e) => e.hasClass('is-active')).map((e) => e.text);
    expect(active).toEqual(['highest']);

    input.value = 'Call the dentist back';
    click(modal.contentEl, 'low');
    click(modal.contentEl, 'Save');
    await flush();

    expect(modified[0].path).toBe('Chartroom/Next-Steps/call-the-dentist.md');
    expect(modified[0].content).toContain('id: call-the-dentist');
    expect(modified[0].content).toContain('title: Call the dentist back');
    expect(modified[0].content).toContain('priority: 4'); // "low"
    expect(modified[0].content).toContain('status: pending');
    expect(modified[0].content).toContain('created_at: 2026-11-01');
  });

  test('a new step can be created with a word priority', async () => {
    const { view, root, created } = makeCtx();
    await view.render();

    click(root, '+ New step');
    const modal = lastModal();
    const labels = modal.contentEl
      .all((e) => e.hasClass('chartroom-segment'))
      .map((o) => o.text);
    expect(labels).toEqual(['highest', 'high', 'medium', 'low', 'lowest']);

    modal.contentEl.ofTag('input')[0].value = 'Book the flights';
    click(modal.contentEl, 'high');
    click(modal.contentEl, 'Create');
    await flush();

    expect(created[0].content).toContain('priority: 2'); // "high"
  });

  test('dropping a step on another persists the new order', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    const cards = cardsIn(section(root, 'Next steps'));
    expect(cards.map(cardTitle)).toEqual(['Call the dentist', 'Renew passport']);

    // drag "Renew passport" above "Call the dentist"
    cards[1].dispatch('dragstart', { dataTransfer: { setData() {} } });
    cards[0].dispatch('dragover', { preventDefault() {} });
    cards[0].dispatch('drop', { preventDefault() {}, dataTransfer: { getData: () => '' } });
    await flush();

    const orderWrites = modified.map((m) => `${m.path} -> ${/order: (\d+)/.exec(m.content)?.[1]}`);
    expect(orderWrites).toEqual([
      'Chartroom/Next-Steps/renew-passport.md -> 1',
      'Chartroom/Next-Steps/call-the-dentist.md -> 2',
    ]);

    const after = cardsIn(section(root, 'Next steps'));
    expect(after.map(cardTitle)).toEqual(['Renew passport', 'Call the dentist']);
  });

  test('a drag that lands on itself changes nothing', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    const cards = cardsIn(section(root, 'Next steps'));
    cards[0].dispatch('dragstart', { dataTransfer: { setData() {} } });
    cards[0].dispatch('drop', { preventDefault() {}, dataTransfer: { getData: () => '' } });
    await flush();

    expect(modified).toEqual([]);
  });
});

describe('Reordering lessons', () => {
  test('dropping a lesson on another persists the new order', async () => {
    const { view, root, modified } = makeCtx();
    await view.render();

    const cards = cardsIn(section(root, 'Lessons'));
    expect(cards).toHaveLength(1);

    click(root, '+ New lesson');
    const modal = lastModal();
    modal.contentEl.ofTag('input')[0].value = 'Ask for the sale';
    click(modal.contentEl, 'Create');
    await flush();

    const two = cardsIn(section(root, 'Lessons'));
    // newest lesson sorts first until something is dragged
    expect(two.map(cardTitle)).toEqual(['Ask for the sale', 'Ship the boring version first']);

    two[1].dispatch('dragstart', { dataTransfer: { setData() {} } });
    two[0].dispatch('drop', { preventDefault() {}, dataTransfer: { getData: () => '' } });
    await flush();

    const lessonWrites = modified.filter((m) => m.path.startsWith('Chartroom/Lessons/'));
    expect(lessonWrites.map((m) => `${m.path} -> ${/order: (\d+)/.exec(m.content)?.[1]}`)).toEqual([
      'Chartroom/Lessons/ship-it.md -> 1',
      'Chartroom/Lessons/ask-for-the-sale.md -> 2',
    ]);
    expect(cardsIn(section(root, 'Lessons')).map(cardTitle)).toEqual([
      'Ship the boring version first',
      'Ask for the sale',
    ]);
  });
});

describe('Snoozed next steps', () => {
  test('sit in their own group at the bottom, dimmed, with disabled actions', async () => {
    const { view, root } = makeCtx();
    await view.render();

    const listEl = section(root, 'Next steps');
    const subhead = listEl.children.find((c) => c.hasClass('chartroom-subhead'));
    expect(subhead?.text).toBe('Snoozed');

    const snoozed = listEl.children.filter((c) => c.hasClass('chartroom-snoozed'));
    expect(snoozed).toHaveLength(1);
    expect(cardTitle(snoozed[0])).toBe('File taxes');
    // Do stays usable; the rest are visible but disabled
    expect(snoozed[0].buttonTexts()).toEqual(['Do', 'Edit', 'Snooze', 'Done']);
    expect(snoozed[0].buttons().map((b) => b.disabled)).toEqual([false, true, true, true]);
    expect(snoozed[0].hasClass('chartroom-draggable')).toBe(false); // not reorderable

    // the group really is below the active cards
    const activeIndex = listEl.children.findIndex((c) => c.hasClass('chartroom-draggable'));
    const snoozedIndex = listEl.children.indexOf(snoozed[0]);
    expect(snoozedIndex).toBeGreaterThan(activeIndex);

    // active cards keep the full action set
    expect(cardsIn(listEl)[0].buttonTexts()).toEqual(['Do', 'Edit', 'Snooze', 'Done']);
  });

  test('Do marks it as being worked on, without opening a tab', async () => {
    const { view, root, modified, opened } = makeCtx();
    await view.render();

    const snoozed = section(root, 'Next steps').children.find((c) => c.hasClass('chartroom-snoozed'))!;
    await snoozed.buttons()[0].onclick();
    await flush();

    expect(modified[0].path).toBe('Chartroom/Next-Steps/file-taxes.md');
    expect(modified[0].content).toContain('status: working');
    expect(modified[0].content).not.toContain('snooze_until');
    expect(modified[0].content).toContain('id: file-taxes');
    expect(opened).toEqual([]); // no new tab

    const after = section(root, 'Next steps');
    expect(after.children.filter((c) => c.hasClass('chartroom-snoozed'))).toHaveLength(0);
    expect(cardsIn(after).map(cardTitle)).toContain('File taxes');
  });

  test('Do on an active step marks it as being worked on', async () => {
    const { view, root, modified, opened } = makeCtx();
    await view.render();

    const first = cardsIn(section(root, 'Next steps'))[0];
    await first.buttons()[0].onclick(); // "Do"
    await flush();

    expect(modified[0].path).toBe('Chartroom/Next-Steps/call-the-dentist.md');
    expect(modified[0].content).toContain('status: working');
    expect(opened).toEqual([]);
    expect(root.all((e) => e.tag === 'span' && e.text === ' · working on it')).toHaveLength(1);

    // Do now does nothing for this step, so it is disabled; siblings keep it
    const afterCards = cardsIn(section(root, 'Next steps'));
    const working = afterCards.find((c) => cardTitle(c) === 'Call the dentist')!;
    const other = afterCards.find((c) => cardTitle(c) === 'Renew passport')!;
    expect(working.buttons()[0].disabled).toBe(true);
    expect(other.buttons()[0].disabled).toBe(false);
  });
});
