jest.spyOn(console, 'error').mockImplementation(() => {});

import KedgePlugin from '../main';
import { WorkspaceLeaf, Workspace, VIEW_TYPE_KEDGE, Platform, registeredCommands, notices, DEFAULT_SETTINGS } from 'obsidian';

beforeEach(() => {
  registeredCommands.length = 0;
  notices.length = 0;
  Platform.isMobile = false;
});

describe('Plugin registration and command registration', () => {
  test("onload registers kedge commands without default hotkeys", async () => {
    const plugin = new KedgePlugin() as any;
    plugin.app = {
      vault: {
        adapter: { exists: () => Promise.resolve(true), mkdir: () => Promise.resolve(), modify: () => Promise.resolve(), create: () => Promise.resolve() },
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        cachedRead: () => Promise.resolve(""),
      },
      workspace: new Workspace([]),
    };
    plugin.settings = { ...DEFAULT_SETTINGS };
    await (plugin as any).onload();

    expect(registeredCommands.every((c) => !c?.hotkeys?.length)).toBe(true);

    // the tab and reload twins were the same call; they must stay deleted
    const ids = registeredCommands.map((c) => c.id);
    expect(ids).not.toContain('open-dashboard-tab');
    expect(ids).not.toContain('reload-dashboard');
  });

  test('registers the sidebar command', async () => {
    const plugin = new KedgePlugin() as any;
    plugin.app = {
      vault: {
        adapter: { exists: () => Promise.resolve(true), mkdir: () => Promise.resolve() },
        getMarkdownFiles: () => [],
      },
      workspace: new Workspace([]),
    };
    plugin.settings = { ...DEFAULT_SETTINGS };
    await (plugin as any).onload();

    // Obsidian prefixes plugin command ids with the plugin id at runtime
    expect(registeredCommands.map((c) => c.id)).toContain('open-dashboard-sidebar');
  });
});

describe('activateDashboardInSidebar', () => {
  test('puts the view in the right sidebar leaf', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => {});
    const workspace = new Workspace([]);
    workspace.rightLeaf = leaf;

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboardInSidebar();
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_KEDGE, state: {} });
    expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
  });

  test('says so when there is no right sidebar', async () => {
    const workspace: any = new Workspace([]);
    workspace.getRightLeaf = () => null;

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboardInSidebar();
    expect(notices.some((n) => n.includes('no leaf to attach to'))).toBe(true);
  });

  test('opens a tab on mobile, where there is no right split', async () => {
    Platform.isMobile = true;
    const workspace: any = new Workspace([]);
    workspace.getRightLeaf = () => null; // exactly what mobile does

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboardInSidebar();
    expect(notices).toEqual([]);
    expect(workspace.getLeavesOfType(VIEW_TYPE_KEDGE)).toEqual([
      expect.objectContaining({ viewType: VIEW_TYPE_KEDGE }),
    ]);
    expect(workspace.revealLeaf).toHaveBeenCalled();
  });

  test('mobile reuses an open dashboard instead of stacking tabs', async () => {
    Platform.isMobile = true;
    const open = new WorkspaceLeaf();
    open.viewType = VIEW_TYPE_KEDGE;
    const workspace: any = new Workspace([open]);

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboardInSidebar();
    expect(workspace.getLeaves()).toHaveLength(1);
    expect(open.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_KEDGE, state: {} });
  });
});

describe('activateDashboard', () => {
  test('shows no-leaf notice when no leaves exist', async () => {
    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace: new Workspace([]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(notices.some(n => n.includes('no open leaf'))).toBe(true);
  });

  test('opens view in a leaf', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => {});

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace: new Workspace([leaf]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_KEDGE, state: {} });
  });

  test('shows failed notice when setViewState throws', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => { throw new Error('boom'); });

    const plugin = new KedgePlugin() as any;
    plugin.app = { workspace: new Workspace([leaf]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(notices.some(n => n.includes('failed to open'))).toBe(true);
  });
});


import {
  idFromTitle,
  localDate,
  parseFrontmatter,
  serializeFrontmatter,
  setFrontmatterKeys,
} from '../main';

describe('Frontmatter', () => {
  test('idFromTitle creates lowercase slug', () => {
    expect(idFromTitle('Hello World!')).toBe('hello-world');
  });

  test('parseFrontmatter returns empty object for invalid', () => {
    expect(parseFrontmatter('no frontmatter')).toEqual({});
  });

  test('parseFrontmatter reads a CRLF note', () => {
    // A note written with Windows line endings used to parse as having no
    // frontmatter, so the card disappeared from the dashboard.
    const crlf = '---\r\nid: call-the-dentist\r\nstatus: pending\r\n---\r\nbody';
    expect(parseFrontmatter(crlf)).toEqual({ id: 'call-the-dentist', status: 'pending' });
  });

  test('serializeFrontmatter quotes values that would not read back', () => {
    const out = serializeFrontmatter({
      id: 'x',
      title: 'Call the dentist: Monday',
      status: 'sealed',
      priority: 3,
    });
    expect(out).toContain('id: x');
    expect(out).toContain('status: sealed');
    expect(out).toContain('priority: 3');
    // a colon before a space opens a mapping, so the title must be quoted
    expect(out).toContain('title: "Call the dentist: Monday"');
    expect(parseFrontmatter(out).title).toBe('Call the dentist: Monday');
  });

  test('a title that ends in a quote survives the round trip', () => {
    const out = serializeFrontmatter({ title: 'Say "hi"' });
    expect(parseFrontmatter(out).title).toBe('Say "hi"');
  });

  test('setFrontmatterKeys touches only the keys it is given', () => {
    const note = [
      '---',
      'id: renew-passport',
      'title: "Renew passport"',
      'status: pending',
      'tags:',
      '  - admin',
      '  - errand',
      '---',
      'Boring body.',
    ].join('\n');

    const out = setFrontmatterKeys(note, { status: 'done', order: 2 });
    expect(out).toContain('status: done');
    expect(out).toContain('order: 2');
    // everything else is byte for byte what it was
    expect(out).toContain('title: "Renew passport"');
    expect(out).toContain('tags:\n  - admin\n  - errand');
    expect(out.endsWith('Boring body.')).toBe(true);
  });

  test('setFrontmatterKeys with null removes the key and its line only', () => {
    const note = '---\nid: x\nstatus: snoozed\nsnooze_until: 2026-11-09\n---\n';
    const out = setFrontmatterKeys(note, { status: 'working', snooze_until: null });
    expect(out).not.toContain('snooze_until');
    expect(out).toContain('status: working');
    expect(out).toContain('id: x');
  });

  test('setFrontmatterKeys adds a block to a note that has none', () => {
    const out = setFrontmatterKeys('just a body', { id: 'x' });
    expect(out).toBe('---\nid: x\n---\njust a body');
  });

  test('setFrontmatterKeys keeps the line endings of the note', () => {
    const crlf = '---\r\nid: x\r\nstatus: pending\r\n---\r\nbody';
    const out = setFrontmatterKeys(crlf, { status: 'done' });
    expect(out).toContain('status: done\r\n');
    expect(out).not.toMatch(/[^\r]\n(?!$)/); // every newline is part of a CRLF
  });

  test('localDate is the calendar date, not the UTC one', () => {
    // 6:30pm in California is already the next day in UTC
    const evening = new Date(2026, 10, 3, 18, 30);
    expect(localDate(evening)).toBe('2026-11-03');
    expect(localDate(new Date(2026, 0, 9, 0, 5))).toBe('2026-01-09');
  });
});

import {
  nextStepNote,
  lessonNote,
  appendReply,
  priorityLabel,
  priorityLevel,
  priorityFromLabel,
  isSnoozed,
  hasArrived,
  addMonths,
  formatDate,
  filterLessons,
  fuzzyScore,
  byOrder,
  PRIORITY_LABELS,
} from '../main';

describe('Note builders', () => {
  test('nextStepNote produces a note loadNextSteps can read back', () => {
    const content = nextStepNote('Call the dentist', 1, 'call-the-dentist', '2026-11-02');
    const fm = parseFrontmatter(content);
    expect(fm.id).toBe('call-the-dentist');
    expect(fm.title).toBe('Call the dentist');
    expect(fm.status).toBe('pending');
    expect(fm.priority).toBe('1');
    expect(fm.created_at).toBe('2026-11-02');
  });


  test('priorityLevel collapses 1-5 into 3 badge colours', () => {
    expect(priorityLevel(1)).toBe(1); // highest -> red
    expect(priorityLevel(2)).toBe(1); // high -> red
    expect(priorityLevel(3)).toBe(2); // medium -> green
    expect(priorityLevel(4)).toBe(3); // low -> yellow
    expect(priorityLevel(5)).toBe(3); // lowest -> yellow
    expect(priorityLevel(0)).toBe(1);
    expect(priorityLevel(9)).toBe(3);
    expect(priorityLevel(NaN)).toBe(2);
  });
  test('priority words and numbers map both ways', () => {
    expect(PRIORITY_LABELS).toEqual(['highest', 'high', 'medium', 'low', 'lowest']);
    expect(priorityLabel(1)).toBe('highest');
    expect(priorityLabel(3)).toBe('medium');
    expect(priorityLabel(9)).toBe('lowest');
    for (let n = 1; n <= 5; n++) expect(priorityFromLabel(priorityLabel(n))).toBe(n);
    expect(priorityFromLabel('nonsense')).toBe(3);
  });

  test('byOrder puts manually ordered notes first and keeps the rest as they were', () => {
    const items = [
      { order: null as number | null, name: 'a' },
      { order: 2, name: 'b' },
      { order: 1, name: 'c' },
      { order: null as number | null, name: 'd' },
    ];
    expect(items.slice().sort(byOrder).map((i) => i.name)).toEqual(['c', 'b', 'a', 'd']);
  });


  test('isSnoozed covers future snoozes only', () => {
    expect(isSnoozed({ status: 'snoozed', snoozeUntil: '2099-01-01' }, '2026-11-02')).toBe(true);
    expect(isSnoozed({ status: 'snoozed', snoozeUntil: null }, '2026-11-02')).toBe(true);
    // an elapsed snooze is due again, so it belongs with the active steps
    expect(isSnoozed({ status: 'snoozed', snoozeUntil: '2026-01-01' }, '2026-11-02')).toBe(false);
    expect(isSnoozed({ status: 'pending', snoozeUntil: null }, '2026-11-02')).toBe(false);
  });
  test('lessonNote creates a lesson keyed by its claim', () => {
    const content = lessonNote(
      'Ship the boring version first',
      'product',
      'ship-the-boring-version-first',
      '2026-11-02'
    );
    const fm = parseFrontmatter(content);
    expect(fm.id).toBe('ship-the-boring-version-first');
    expect(fm.claim).toBe('Ship the boring version first');
    expect(fm.category).toBe('product');
    expect(fm.week).toBe('2026-11-02');
    expect(fm.created_at).toBe('2026-11-02');
  });

  test('appendReply keeps the letter body and adds a dated reply section', () => {
    const raw = '---\ntitle: Dear future me\n---\n\nSealed thoughts.';
    const out = appendReply(raw, 'Thanks, past me.', '2026-11-02');
    expect(out.startsWith(raw)).toBe(true);
    expect(out).toContain('\n\n## Reply 2026-11-02\n\nThanks, past me.\n');
  });

  test('appendReply does not double the blank line on a note ending in a newline', () => {
    const out = appendReply('body\n', 'reply', '2026-11-02');
    expect(out).toBe('body\n\n## Reply 2026-11-02\n\nreply\n');
  });
});

describe('Letters', () => {
  test('a sealed letter arrives on its date, without rewriting the note', () => {
    const sealed = { status: 'sealed', sealDate: '2027-05-03' };
    expect(hasArrived(sealed, '2026-11-02')).toBe(false);
    expect(hasArrived(sealed, '2027-05-02')).toBe(false);
    expect(hasArrived(sealed, '2027-05-03')).toBe(true);
    expect(hasArrived(sealed, '2028-01-01')).toBe(true);
    expect(hasArrived({ status: 'delivered', sealDate: '2099-01-01' }, '2026-11-02')).toBe(true);
    expect(hasArrived({ status: 'opened', sealDate: '2099-01-01' }, '2026-11-02')).toBe(true);
  });

  test('addMonths clamps to the end of a shorter month', () => {
    expect(addMonths(1, '2026-01-31')).toBe('2026-02-28');
    expect(addMonths(1, '2028-01-31')).toBe('2028-02-29'); // leap year
    expect(addMonths(6, '2026-11-02')).toBe('2027-05-02');
    expect(addMonths(12, '2026-11-02')).toBe('2027-11-02');
  });

  test('formatDate reads like a card badge', () => {
    expect(formatDate('2027-05-03')).toBe('3 May 2027');
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('Lesson search', () => {
  const lessons = [
    { claim: 'Ship the boring version first', category: 'product' },
    { claim: 'Ask for the sale', category: 'sales' },
    { claim: 'Slow mornings make better work', category: 'health' },
  ];

  test('a substring beats a scattered subsequence, and a miss is -1', () => {
    const substring = fuzzyScore('Ship the boring version first', 'boring');
    const scattered = fuzzyScore('Ship the boring version first', 'shbv');
    expect(substring).toBeGreaterThan(scattered);
    expect(scattered).toBeGreaterThan(0);
    expect(fuzzyScore('Ship the boring version first', 'xyz')).toBe(-1);
    expect(fuzzyScore('anything', '   ')).toBe(0); // blank query matches everything
  });

  test('a word start scores higher than a mid-word hit', () => {
    expect(fuzzyScore('Ask for the sale', 'sale')).toBeGreaterThan(
      fuzzyScore('Wholesale prices', 'sale')
    );
  });

  test('filtering keeps matches and ranks them', () => {
    expect(filterLessons(lessons, 'sale').map((l) => l.claim)).toEqual(['Ask for the sale']);
    expect(filterLessons(lessons, 'zzz')).toEqual([]);
    expect(filterLessons(lessons, '')).toHaveLength(3); // untouched order
  });

  test('a category match finds a lesson whose claim does not contain the word', () => {
    expect(filterLessons(lessons, 'health').map((l) => l.claim)).toEqual([
      'Slow mornings make better work',
    ]);
  });
});