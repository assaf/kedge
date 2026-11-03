# Kedge

An Obsidian plugin I built for myself. One next step at a time, a few lessons written down, letters to future me. It's all plain markdown in the vault, so nothing is trapped in here.

![Kedge dashboard](public/image.png)

I start things badly. Not for lack of knowing what to do, that part is easy and there's always too much of it. So the page shows one step and a Done button and hides the rest.

## Install

```bash
pnpm install && pnpm build
```

Copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/kedge/`, then turn it on in Settings → Community Plugins.

## Keys

⌘⇧D dashboard, ⌘⇧M letter, ⌘⇧N next step, ⌘⇧L lesson. All of those are buttons on the page too.

Obsidian can't pin a tab, so "Open dashboard in the sidebar" is how you keep it in view while you work.

## How it behaves

Snoozed steps go grey at the bottom and only Do works on them. Do sets `status: working` and clears the snooze. It doesn't open a note; the note is in the file explorer where you left it.

![Next steps](public/steps.png)

Letters show up on their date. Nothing gets rewritten when the page loads, so some days bring one and some bring none.

Priorities are words on screen, 1 to 5 in the file. Dragging a card writes an `order` field.

Lessons have a search box that's fuzzy enough to be useful: `shbv` finds "Ship the boring version first", and so does `boring`.

![Lessons](public/lessons.png)

## Files

- `Kedge/Letters/` keeps `id`, `title`, `status`, `seal_date`, `created_at`
- `Kedge/Next-Steps/` keeps `id`, `title`, `status`, `priority`, `snooze_until`, `order`, `created_at`
- `Kedge/Lessons/` keeps `id`, `claim`, `category`, `week`, `order`, `created_at`

## Running it

`pnpm test` typechecks first, then runs jest against a fake Obsidian I wrote by hand. It's fast. It also lies: the fake had a `workspace.getLeaves` that the real API doesn't, and the suite stayed green while the plugin was broken in the app.

`pnpm smoke` does the real thing. Throwaway vault, real Obsidian, real commands, about five seconds, and it puts your vault back afterwards.

What neither one checks is drag and drop, or how anything looks. That still needs eyes.
