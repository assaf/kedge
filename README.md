# Chartroom — Obsidian plugin

Next best step · Letters to/from future self · Snoozable next steps · One-line lessons.

## Install

```bash
cd chartroom-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugins folder:

```
<vault>/.obsidian/plugins/chartroom/
```

Then enable "Chartroom" in Obsidian → Settings → Community Plugins → Installed.

## Commands

| Command | What it does |
|---|---|
| Open dashboard (`Cmd+Shift+M`) | Opens the dashboard in a tab, reusing the existing one |
| Open dashboard in tab (`Cmd+Shift+T`) | Same, in a new tab |
| Reload dashboard | Reopens the dashboard if the UI is stale |
| Write letter to future me (`Cmd+Shift+L`) | Modal to write + seal a letter with a delivery date |
| Create next step (`Cmd+Shift+N`) | Modal: step title + priority, writes a pending note |
| Create lesson | Modal: one-line lesson + optional category |

The dashboard carries the same actions as buttons: "+ New step", "+ New lesson",
"Edit" on a step (title + priority), "Edit" / "Delete" on a lesson, and
"Reply to past me" on each delivered letter (the reply is appended to the
letter note as a dated `## Reply` section).

Priorities are picked in words — highest, high, medium, low, lowest — and
stored as 1–5. Next steps and lessons can be reordered by dragging a card by
its ⠿ grip; the order is written to each note's `order` field, and notes
without one fall back to priority / newest-first.

Snoozed next steps drop to their own dimmed group at the bottom of the list
and are not draggable. Only "Do" is enabled on them; Edit / Snooze / Done are
shown greyed out and inert. A snooze whose date has passed counts as due
again, so it rejoins the active list on its own.

"Do" never opens a tab — on a snoozed step or an active one it sets
`status: working` (shown as "working on it") and clears `snooze_until`. The
note itself is opened from the file explorer when you need it.

## Data model (all stored as markdown notes in your vault)

- `Chartroom/Letters/*.md` — frontmatter: `id`, `title`, `status` (sealed/delivered/opened), `seal_date`, `created_at`
- `Chartroom/Next-Steps/*.md` — frontmatter: `id`, `title`, `status` (pending/snoozed/done), `priority` (1–5), `snooze_until`, `order`, `created_at`
- `Chartroom/Lessons/*.md` — frontmatter: `id`, `claim`, `category`, `week`, `order`, `created_at`

## Develop

```bash
npm install        # obsidian, typescript, @types/node, esbuild, jest
npm run build      # esbuild → main.js
npm run dev        # watch mode
npm run typecheck  # tsc --noEmit against the real obsidian.d.ts
npm test           # typecheck + jest (mocked Obsidian)
npm run smoke      # live run in real Obsidian, scratch vault
```

`npm test` is fast and offline, but it exercises a hand-written Obsidian mock.
It cannot see whether Obsidian accepts an API call, whether a view appears, or
what anything looks like — those failures shipped before.

`npm run smoke` closes that gap. It builds, creates a throwaway vault in
`$TMPDIR`, copies the plugin in, switches Obsidian to it through the official
`obsidian` CLI, and asserts:

- the plugin loads (restricted mode disabled for the scratch vault)
- its commands register
- `chartroom:open-chartroom` executes
- the workspace really contains a `chartroom-dashboard` view
- `onload` created `Chartroom/{Letters,Next-Steps,Lessons}`

It needs Obsidian running and the CLI on `PATH` (`obsidian`), takes ~5 s, and
restores the vault registry byte-for-byte on the way out — your notes are never
touched. `--keep` leaves the scratch vault behind for inspection.

What still needs your eyes: drag-and-drop gestures and anything visual (theme
colours, layout). Those need CDP (`obsidian dev:cdp`) rather than the CLI.

`package.json` scripts assume `esbuild`. Obsidian API types come from the
`obsidian` npm package; the app it runs against may be newer (check
`obsidian version`).
