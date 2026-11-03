# Kedge — Obsidian plugin

Next best step · Letters to/from future self · Snoozable next steps · One-line lessons.

![](public/image.png)

## Install

```bash
cd kedge
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugins folder:

```
<vault>/.obsidian/plugins/kedge/
```

Then enable "Kedge" in Obsidian → Settings → Community Plugins → Installed.

## Commands

| Command                                   | What it does                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------ |
| Open dashboard (`Cmd+Shift+M`)            | Opens the dashboard, reusing the existing Kedge leaf and re-rendering it       |
| Open dashboard in the sidebar             | Puts the dashboard in the right sidebar, so it stays visible beside your notes |
| Write letter to future me (`Cmd+Shift+L`) | Modal to write + seal a letter with a delivery date                            |
| Create next step (`Cmd+Shift+N`)          | Modal: step title + priority, writes a pending note                            |
| Create lesson                             | Modal: one-line lesson + optional category                                     |

The dashboard carries the same actions as buttons: "+ New step", "+ New lesson",
"Edit" on a step (title + priority), "Edit" / "Delete" on a lesson and on every
letter, and "Reply to past me" on each arrived letter (the reply is appended to
the letter note as a dated `## Reply` section).

Obsidian has no tab pinning. The way to keep the dashboard on screen is the
sidebar: "Open dashboard in the sidebar" attaches it to the right-sidedock
leaf, which survives restarts as part of the workspace layout. It sits beside
whatever note you are editing instead of sharing the main area's tabs.

Priorities are picked in words — highest, high, medium, low, lowest — and
stored as 1–5. Next steps and lessons can be reordered by dragging a card by
its ⠿ grip; the order is written to each note's `order` field, and notes
without one fall back to priority / newest-first.

The Lessons section has a search box. Typing filters the list in place —
fuzzy, so `boring` finds "Ship the boring version first" and `shbv` finds it
too — best match first, with category matches ranked below claim matches.
Clearing the box restores the full list; ordering by drag is only wired up
while the list is unfiltered, since a filtered order has no meaning.

Snoozed next steps drop to their own dimmed group at the bottom of the list
and are not draggable. Only "Do" is enabled on them; Edit / Snooze / Done are
shown greyed out and inert. A snooze whose date has passed counts as due
again, so it rejoins the active list on its own.

"Do" never opens a tab — on a snoozed step or an active one it sets
`status: working` (shown as "working on it") and clears `snooze_until`. The
note itself is opened from the file explorer when you need it.

## Letters to your future self

"Write letter to future me" opens a modal with a title, the letter, and when
it comes back: quick picks of 1 month / 6 months / 1 year, or an exact date.
A line under the field previews the return date ("Will come back on 3 May
2027") before you seal it.

The dashboard then has two letter sections. **Scheduled letters** is a compact
list — one line per letter, title only, truncated with an ellipsis when long,
with Edit and Delete on the right; the return date and written date sit in the
row's tooltip. Editing reopens the same letter, body included, and changing the
date reschedules it. **From past you** holds the letters whose date has
arrived, each with "Reply to past me" (the reply is appended to the letter note
as a dated `## Reply` section).

Arrival is computed, never written: a `sealed` letter whose `seal_date` is
today or earlier simply shows up. So on any given day you may see none, one,
or several letters arrive, and the notes themselves are never rewritten just
by opening the dashboard. The dashboard only counts as arrived; it does not
flip the status.

## Data model (all stored as markdown notes in your vault)

- `Kedge/Letters/*.md` — frontmatter: `id`, `title`, `status` (sealed/delivered/opened), `seal_date`, `created_at`
- `Kedge/Next-Steps/*.md` — frontmatter: `id`, `title`, `status` (pending/snoozed/done), `priority` (1–5), `snooze_until`, `order`, `created_at`
- `Kedge/Lessons/*.md` — frontmatter: `id`, `claim`, `category`, `week`, `order`, `created_at`

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
- `kedge:open-dashboard` executes
- the workspace really contains a `kedge-dashboard` view
- `onload` created `Kedge/{Letters,Next-Steps,Lessons}`

It needs Obsidian running and the CLI on `PATH` (`obsidian`), takes ~5 s, and
restores the vault registry byte-for-byte on the way out — your notes are never
touched. `--keep` leaves the scratch vault behind for inspection.

What still needs your eyes: drag-and-drop gestures and anything visual (theme
colours, layout). Those need CDP (`obsidian dev:cdp`) rather than the CLI.

`package.json` scripts assume `esbuild`. Obsidian API types come from the
`obsidian` npm package; the app it runs against may be newer (check
`obsidian version`).
