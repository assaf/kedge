# Kedge

An Obsidian plugin. Dashboard with one next step, lessons I've written down, letters to future me. Markdown in the vault.

![Kedge](public/image.png)

(I have ADHD. A list of forty tasks is worse than no list.)

## Install

```bash
pnpm install && pnpm build
```

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/kedge/`. Enable it. That's the whole install.

## What's in it

Five commands: dashboard, dashboard in the sidebar, letter, next step, lesson. ⌘⇧D, ⌘⇧M, ⌘⇧N, ⌘⇧L for the four that have keys. The same things are buttons on the page.

## Things that will annoy you

- Obsidian doesn't pin tabs. The sidebar command is the closest thing, and it survives a restart.
- Do doesn't open the note, it marks the step as the one you're on (`status: working`) and clears any snooze. Open the note from the file explorer.
- Snoozed steps drop to the bottom, grey, with Edit, Snooze and Done disabled. Only Do works.
- A letter doesn't flip its own status when its date arrives. It just shows up. Some days you get one, some days nothing.
- Drag handles are the ⠿ on the left of a card. Dragging writes an `order` field, which beats priority for sorting.
- Lesson search is fuzzy whether you want it to be or not. `shbv` finds "Ship the boring version first".

![Next steps](public/steps.png)

![Lessons](public/lessons.png)

## Tests

```bash
pnpm test     # typecheck, then jest against a hand-written Obsidian mock
pnpm smoke    # real Obsidian, throwaway vault, ~5s
```

`pnpm test` was green for a while while the plugin couldn't open at all. The mock has a `workspace.getLeaves` that the real API doesn't. That's the reason `pnpm smoke` exists: it boots a temp vault, runs the actual command, and checks the workspace really has a Kedge view in it.

Nobody checks drag and drop or how the thing looks. That's on me and on you.

## Files

- `Kedge/Letters/` keeps `id`, `title`, `status`, `seal_date`, `created_at`
- `Kedge/Next-Steps/` keeps `id`, `title`, `status`, `priority`, `snooze_until`, `order`, `created_at`
- `Kedge/Lessons/` keeps `id`, `claim`, `category`, `week`, `order`, `created_at`

Last touched 2026-11-03. Obsidian 1.15.0.
