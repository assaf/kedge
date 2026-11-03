jest.spyOn(console, 'error').mockImplementation(() => {});

import ChartroomPlugin from '../main';
import { WorkspaceLeaf, Workspace, VIEW_TYPE_CHARTROOM, Notice, registeredCommands, notices, DEFAULT_SETTINGS } from 'obsidian';

beforeEach(() => {
  registeredCommands.length = 0;
  notices.length = 0;
});

describe('Plugin registration and command registration', () => {
  test('onload registers chartroom commands with hotkeys', async () => {
    const plugin = new ChartroomPlugin() as any;
    plugin.app = {
      vault: {
        adapter: { exists: () => Promise.resolve(true), mkdir: () => Promise.resolve(), modify: () => Promise.resolve(), create: () => Promise.resolve() },
        getMarkdownFiles: () => [],
        getAbstractFileByPath: () => null,
        cachedRead: () => Promise.resolve(''),
      },
      workspace: new Workspace([]),
    };
    plugin.settings = { ...DEFAULT_SETTINGS };
    await (plugin as any).onload();

    const openCmd = registeredCommands.find(c => c?.hotkeys?.[0]?.key === 'M');
    expect(openCmd).toBeDefined();
    expect(openCmd.hotkeys[0].key).toBe('M');

    const tabCmd = registeredCommands.find(c => c?.hotkeys?.[0]?.key === 'T');
    expect(tabCmd).toBeDefined();
    expect(tabCmd.hotkeys[0].key).toBe('T');
  });
});

describe('activateDashboard', () => {
  test('shows no-leaf notice when no leaves exist', async () => {
    const plugin = new ChartroomPlugin() as any;
    plugin.app = { workspace: new Workspace([]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(notices.some(n => n.includes('no open leaf'))).toBe(true);
  });

  test('opens view in a leaf', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => {});

    const plugin = new ChartroomPlugin() as any;
    plugin.app = { workspace: new Workspace([leaf]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_CHARTROOM, state: {} });
  });

  test('shows failed notice when setViewState throws', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => { throw new Error('boom'); });

    const plugin = new ChartroomPlugin() as any;
    plugin.app = { workspace: new Workspace([leaf]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).activateDashboard();
    expect(notices.some(n => n.includes('failed to open'))).toBe(true);
  });
});

describe('reloadDashboard', () => {
  test('re-registers view and opens leaf', async () => {
    const leaf = new WorkspaceLeaf();
    leaf.setViewState = jest.fn(async () => {});

    const plugin = new ChartroomPlugin() as any;
    plugin.app = { workspace: new Workspace([leaf]) };
    plugin.settings = { ...DEFAULT_SETTINGS };

    await (plugin as any).reloadDashboard();
    expect(leaf.setViewState).toHaveBeenCalledWith({ type: VIEW_TYPE_CHARTROOM, state: {} });
  });
});

import { idFromTitle, parseFrontmatter, serializeFrontmatter } from '../main';

describe('Pure helpers', () => {
  test('idFromTitle creates lowercase slug', () => {
    expect(idFromTitle('Hello World!')).toBe('hello-world');
  });

  test('parseFrontmatter returns empty object for invalid', () => {
    expect(parseFrontmatter('no frontmatter')).toEqual({});
  });

  test('serializeFrontmatter formats correctly', () => {
    const obj = { id: '123', title: 'test', status: 'sealed' };
    const result = serializeFrontmatter(obj);
    expect(result).toContain('id: 123');
    expect(result).toContain('status: sealed');
  });

  test('nowStr returns ISO date format matching YYYY-MM-DD', () => {
    const result = require('../main').nowStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import {
  nextStepNote,
  lessonNote,
  appendReply,
  priorityLabel,
  priorityFromLabel,
  isSnoozed,
  hasArrived,
  addMonths,
  formatDate,
  byOrder,
  PRIORITY_LABELS,
} from '../main';

describe('Note builders', () => {
  test('nextStepNote produces a note loadNextSteps can read back', () => {
    const { id, content } = nextStepNote('Call the dentist', 1, undefined, '2026-11-02');
    expect(id).toBe('call-the-dentist');
    const fm = parseFrontmatter(content);
    expect(fm.id).toBe('call-the-dentist');
    expect(fm.title).toBe('Call the dentist');
    expect(fm.status).toBe('pending');
    expect(fm.priority).toBe('1');
    expect(fm.created_at).toBe('2026-11-02');
  });

  test('nextStepNote falls back to a stable id when the title has no slug', () => {
    const { id } = nextStepNote('!!!', 3, undefined, '2026-11-02');
    expect(id).toBe('step-2026-11-02');
  });

  test('editing a step keeps its id, status, order and created date', () => {
    const existing = {
      id: 'call-the-dentist',
      status: 'snoozed',
      snoozeUntil: '2026-11-09',
      createdAt: '2026-10-01',
      order: 4,
    };
    const { id, content } = nextStepNote('Call the dentist back', 2, existing, '2026-11-02');
    expect(id).toBe('call-the-dentist');
    const fm = parseFrontmatter(content);
    expect(fm.id).toBe('call-the-dentist');
    expect(fm.title).toBe('Call the dentist back');
    expect(fm.status).toBe('snoozed');
    expect(fm.priority).toBe('2');
    expect(fm.snooze_until).toBe('2026-11-09');
    expect(fm.created_at).toBe('2026-10-01');
    expect(fm.order).toBe('4');
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
    const { id, content } = lessonNote('Ship the boring version first', 'product', undefined, '2026-11-02');
    expect(id).toBe('ship-the-boring-version-first');
    const fm = parseFrontmatter(content);
    expect(fm.claim).toBe('Ship the boring version first');
    expect(fm.category).toBe('product');
    expect(fm.week).toBe('2026-11-02');
    expect(fm.created_at).toBe('2026-11-02');
  });

  test('editing a lesson keeps its id, week and created date when the claim changes', () => {
    const existing = { id: 'old-claim', week: '2026-01-05', createdAt: '2026-01-05' };
    const { id, content } = lessonNote('New claim', 'health', existing, '2026-11-02');
    expect(id).toBe('old-claim');
    const fm = parseFrontmatter(content);
    expect(fm.id).toBe('old-claim');
    expect(fm.claim).toBe('New claim');
    expect(fm.week).toBe('2026-01-05');
    expect(fm.created_at).toBe('2026-01-05');
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