# kedge

obsidian plugin i wrote for myself. one next step, lessons, letters to future me. all markdown in the vault.

![kedge](public/image.png)

## install

```
pnpm install && pnpm build
```

copy `main.js`, `manifest.json`, `styles.css` to `<vault>/.obsidian/plugins/kedge/` and enable it in settings.

## keys

cmd+shift+d dashboard, cmd+shift+m letter, cmd+shift+n next step, cmd+shift+l lesson. the sidebar one has no key, it's in the palette.

## what happened when

- 2026-11-03: sidebar command. obsidian won't pin a tab, so that's the closest thing to keeping it on screen.
- 2026-11-02: snoozed steps moved into their own grey group at the bottom with the buttons dead except do. also took the date and the fake shortcuts out of the header. they were never bound to anything.
- 2026-11-01: letters list collapsed to one line per letter. title only, edit and delete on the right.
- 2026-10-31: letters arrive. before that a sealed letter just sat there, nothing ever flipped it to delivered.
- 2026-10-30: drag to reorder. writes an `order` field on the note.
- 2026-10-29: lesson search. fuzzy, `shbv` finds "Ship the boring version first".
- 2026-10-28: first commit.

## tests

pnpm test typechecks, then runs jest against a mock obsidian i wrote by hand. pnpm smoke boots a throwaway vault in real obsidian, runs the command, checks the view is actually there. five seconds.

the mock has a `workspace.getLeaves` that the real api doesn't. the suite was green for a while while the plugin wouldn't open at all. that's why smoke exists.

drag and drop and anything visual: still untested.

## files

`Kedge/Letters/`, `Kedge/Next-Steps/`, `Kedge/Lessons/`. frontmatter fields are `id`, `title` or `claim`, `status`, `priority`, `snooze_until`, `seal_date`, `week`, `order`, `created_at`, whichever apply.
