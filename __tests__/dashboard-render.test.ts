import { KedgeView, DEFAULT_SETTINGS } from '../main';
import { notices, El } from 'obsidian';

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

function makeView(seed?: any[]) {
  const { vault, modified, deleted } = makeVault(seed);
  const plugin: any = {
    app: { vault, workspace: { getLeavesOfType: () => [], getLeaf: () => null } },
    settings: { ...DEFAULT_SETTINGS },
  };
  const view: any = new KedgeView({} as any, plugin);
  const root = new El('div');
  view.container = root;
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
    expect(texts).toContain('Edit');
    expect(texts).toContain('Delete');
    expect(texts).toContain('Reply to past me');
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

  test('Done on the next best step marks the note done and re-renders', async () => {
    const { view, root, modified } = makeView();
    await view.render();

    const doneBtns = root.buttons().filter((b) => b.text === 'Done');
    expect(doneBtns.length).toBeGreaterThan(0);
    await doneBtns[0].onclick();

    expect(modified[0].path).toBe('Kedge/Next-Steps/call-the-dentist.md');
    expect(modified[0].content).toContain('status: done');
    expect(modified[0].content).toContain('priority: 1');

    // after re-render the step is no longer pending, so the empty state shows
    expect(root.buttonTexts()).toContain('New next step');
  });
});
