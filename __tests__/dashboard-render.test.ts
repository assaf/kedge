import { KedgeView, DEFAULT_SETTINGS } from '../main';
import { notices, El, Menu, openedMenus } from 'obsidian';

function makeVault(seed?: any[]) {
  const files: any[] = seed ?? [
    {
      path: 'Kedge/Next-Steps/call-the-dentist.md',
      basename: 'call-the-dentist',
      content: '---\nid: call-the-dentist\ntitle: Call the dentist\nstatus: pending\npriority: 1\ncreated_at: 2026-11-01\n---\n',
    },
    {
      path: 'Kedge/Letters/dear-future-me.md',
      basename: 'dear-future-me',
      content: '---\nid: dear-future-me\ntitle: Dear future me\nstatus: delivered\nseal_date: 2026-10-01\ncreated_at: 2026-04-01\n---\nSleep more.',
    },
    {
      path: 'Kedge/Lessons/ship-it.md',
      basename: 'ship-it',
      content: '---\nid: ship-it\nclaim: Ship the boring version first\ncategory: product\nweek: 2026-10-20\ncreated_at: 2026-10-20\n---\n',
    },
  ];
  const modified: Array<{ path: string; content: string }> = [];
  const deleted: string[] = [];

  const vault = {
    adapter: { exists: () => Promise.resolve(true), mkdir: () => Promise.resolve() },
    getMarkdownFiles: () => files as any[],
    getAbstractFileByPath: (path: string) => files.find((f) => f.path === path) ?? null,
    cachedRead: (f: any) => Promise.resolve(f.content),
    modify: (f: any, content: string) => {
      modified.push({ path: f.path, content });
      f.content = content;
      return Promise.resolve();
    },
    delete: (f: any) => {
      deleted.push(f.path);
      return Promise.resolve();
    },
    create: () => Promise.resolve(),
  };
  return { vault, files, modified, deleted };
}

/** The ⋯ inside `el`, and the menu it opens. */
function menuIn(el: El): Menu {
  const caret = el.all((e) => e.hasClass('kedge-menu-button'))[0];
  if (!caret) throw new Error(`no ⋯ here: ${JSON.stringify(el.buttonTexts())}`);
  const opened = openedMenus.length;
  caret.onclick({});
  const menu = openedMenus[opened];
  if (!menu) throw new Error('the ⋯ opened no menu');
  return menu;
}

function sectionEl(root: El, title: string): El {
  const heading = root.all((e) => e.tag === 'h2' && e.text === title)[0];
  let el = heading?.parent ?? null;
  while (el && !el.hasClass('kedge-section')) el = el.parent;
  if (!el) throw new Error(`no section "${title}"`);
  return el;
}

function makeView(seed?: any[]) {
  const { vault, modified, deleted } = makeVault(seed);
  const plugin: any = {
    app: { vault, workspace: { getLeavesOfType: () => [], getLeaf: () => null } },
    settings: { ...DEFAULT_SETTINGS },
  };
  const view: any = new KedgeView({} as any, plugin);
  const root = new El('div');
  view.container = root;
  // The real plugin re-renders every open dashboard; here there is one.
  plugin.refreshDashboards = () => view.render();
  return { view, root, modified, deleted };
}

beforeEach(() => {
  notices.length = 0;
});

describe('KedgeView.render', () => {
  test('renders the dashboard with create/edit/reply actions', async () => {
    const { view, root } = makeView();
    await view.render();

    expect(notices).toEqual([]);
    const texts = root.buttonTexts();
    expect(texts).toContain('+ New step');
    expect(texts).toContain('+ New lesson');
    expect(texts).toContain('Reply to past me');
    // edit/delete live in the row menus now, not on the surface
    expect(texts).not.toContain('Edit');
    expect(root.buttons().filter((b) => b.hasClass('kedge-menu-button')).length).toBeGreaterThan(0);
  });

  test('the header carries no date and no invented shortcuts', async () => {
    const { view, root } = makeView();
    await view.render();

    const heading = root.children[0].all((e) => e.tag === 'h2').map((e) => e.text);
    expect(heading).toEqual(['⚓ Kedge']);
    expect(root.all((e) => e.text.includes('Today:')).length).toBe(0);
    expect(root.all((e) => e.text.includes('Ctrl/Cmd')).length).toBe(0);
  });

  test('all bound shortcuts sit on one line in the header', async () => {
    const { view, root } = makeView();
    const keys: Record<string, string> = {
      'kedge:open-dashboard': '⌘ ⇧ D',
      'kedge:write-letter': '⌘ ⇧ M',
      'kedge:create-next-step': '⌘ ⇧ N',
      'kedge:create-lesson': '⌘ ⇧ L',
    };
    (view.plugin.app as any).hotkeyManager = {
      printHotkeyForCommand: (id: string) => keys[id] ?? '',
    };
    await view.render();

    const headerMeta = root.children[0].all((e) => e.hasClass('kedge-meta'));
    expect(headerMeta.map((m) => m.text)).toEqual([
      'Open dashboard: ⌘ ⇧ D  ·  New letter: ⌘ ⇧ M  ·  New step: ⌘ ⇧ N  ·  New lesson: ⌘ ⇧ L',
    ]);

    // buttons stay clean: no key hints inside them
    expect(root.all((e) => e.hasClass('kedge-key'))).toEqual([]);
    expect(root.buttonTexts()).toContain('+ New step');
    expect(root.buttonTexts()).toContain('+ New lesson');
    expect(root.buttonTexts()).toContain('+ New letter');
  });

  test('unbound commands are left out of the line', async () => {
    const { view, root } = makeView();
    (view.plugin.app as any).hotkeyManager = {
      printHotkeyForCommand: (id: string) =>
        id === 'kedge:create-lesson' ? '⌘ ⇧ L' : '',
    };
    await view.render();

    const headerMeta = root.children[0].all((e) => e.hasClass('kedge-meta'));
    expect(headerMeta.map((m) => m.text)).toEqual(['New lesson: ⌘ ⇧ L']);
  });

  test('offers a New next step button when nothing is pending', async () => {
    const { view, root } = makeView([]);
    await view.render();

    expect(root.buttonTexts()).toContain('New next step');
  });

  test('renders the letter title as a badge span, not raw HTML', async () => {
    const { view, root } = makeView();
    await view.render();

    const badges = root.all((e) => e.tag === 'span' && e.cls.includes('seal-badge'));
    expect(badges.map((b) => b.text)).toEqual(['sealed 1 Oct 2026']);
    const leaked = root.all((e) => e.text.includes('<span'));
    expect(leaked).toEqual([]);
  });

  test('a note already marked working keeps its label and offers the same menu', async () => {
    const { view, root } = makeView([
      {
        path: 'Kedge/Next-Steps/half-done.md',
        basename: 'half-done',
        content: '---\nid: half-done\ntitle: Half done\nstatus: working\npriority: 1\ncreated_at: 2026-11-01\n---\n',
      },
    ]);
    await view.render();

    // nothing sets `working` any more, but notes that carry it still read right
    expect(root.all((e) => e.tag === 'span' && e.text === ' · working on it')).toHaveLength(1);
    expect(root.buttons().map((b) => b.text)).not.toContain('Do');
  });

  test('Done on the next best step marks the note done and re-renders', async () => {
    const { view, root, modified } = makeView();
    await view.render();

    // Done sits behind the ⋯ on the card: Edit, Snooze, Done
    await menuIn(sectionEl(root, 'Next best step')).items[2].click();

    expect(modified[0].path).toBe('Kedge/Next-Steps/call-the-dentist.md');
    expect(modified[0].content).toContain('status: done');
    expect(modified[0].content).toContain('priority: 1');

    // after re-render the step is no longer pending, so the empty state shows
    expect(root.buttonTexts()).toContain('New next step');
  });

  test('Done leaves every property it did not set alone', async () => {
    const note = [
      '---',
      'id: renew-passport',
      'title: "Renew passport: urgent"',
      'status: pending',
      'priority: 2',
      'tags:',
      '  - admin',
      '  - errand',
      'created_at: 2026-11-01',
      '---',
      'Boring body.',
    ].join('\n');
    const { view, root, modified } = makeView([
      { path: 'Kedge/Next-Steps/renew-passport.md', basename: 'renew-passport', content: note },
    ]);
    await view.render();

    await menuIn(sectionEl(root, 'Next best step')).items[2].click();

    const written = modified[0].content;
    expect(written).toContain('status: done');
    // the quoted title, the tag list and the body are untouched
    expect(written).toContain('title: "Renew passport: urgent"');
    expect(written).toContain('tags:\n  - admin\n  - errand');
    expect(written.endsWith('Boring body.')).toBe(true);
  });

});
