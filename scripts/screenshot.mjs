#!/usr/bin/env node
/**
 * Regenerates `public/image.png`, the dashboard shot in the README.
 *
 * The shot has to be reproducible, so nothing here is hand-done: the same
 * sample notes are written into a throwaway vault, Obsidian is switched to it,
 * and the dashboard is rendered in light mode.
 *
 * The dashboard is taller than the window, and it scrolls in its own container
 * (not the page, so `captureBeyondViewport` paints the rest blank). The image
 * is therefore built from one screenshot per viewport of scroll, cropped at
 * exact scroll boundaries so no row appears twice, with the Obsidian tab bar
 * cropped off each strip so it does not repeat at the seams. A white border is
 * added left and right so the figure does not run into the edge of the text.
 *
 * Your real vault is never written to: the scratch vault is a temp directory
 * and the vault registry is restored byte-for-byte afterwards.
 *
 * Usage:
 *   pnpm screenshot                     # rebuild first? no: uses the built main.js
 *   node scripts/screenshot.mjs --keep  # leave the scratch vault for inspection
 *
 * Requires: Obsidian running with its CLI available, and ImageMagick (`magick`
 * or `convert`) for the margins.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HOME = os.homedir();
const OBSIDIAN = process.env.SCREENSHOT_OBSIDIAN_BIN ?? "obsidian";
const REGISTRY = path.join(HOME, "Library/Application Support/obsidian/obsidian.json");
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public/image.png");
const BORDER = 100; // device px added on each side
const KEEP = process.argv.includes("--keep");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(message) {
  throw new Error(message);
}

/** Runs the Obsidian CLI and returns stdout. */
function obsidian(args, { timeout = 40_000 } = {}) {
  return execFileSync(OBSIDIAN, args, {
    encoding: "utf8",
    timeout,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryObsidian(args, options) {
  try {
    return { ok: true, out: obsidian(args, options) };
  } catch (error) {
    return { ok: false, out: String(error.stdout ?? ""), err: error.message };
  }
}

/** The CLI can exit 0 while printing an error, so the output decides. */
function succeeded(res) {
  return res.ok && !/^Error:/m.test(res.out.trim());
}

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    await sleep(300);
  }
  return { timedOut: `${label} not yet true` };
}

/** Runs JS inside Obsidian and returns the printed value (without the `=> `). */
function evaluate(code) {
  const res = tryObsidian(["eval", `code=${code}`]);
  return succeeded(res) ? res.out.replace(/^=>\s*/, "").trim() : "";
}

function imageTool() {
  for (const bin of ["magick", "convert"]) {
    try {
      execFileSync(bin, ["-version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* keep looking */
    }
  }
  die("ImageMagick not found: install it (brew install imagemagick) for the margins");
}

// --------------------------------------------------------------- scratch vault

/** The demo content the README shot shows. Keep it stable: it is the fixture. */
const NOTES = [
  ["Kedge/Lessons/ship-it.md", [
    "id: ship-it",
    'claim: "Ship the boring version first"',
    "category: product",
    "week: 2026-11-02",
    "created_at: 2026-10-20",
  ], "Perfection is the enemy of shipped."],
  ["Kedge/Lessons/ask-for-the-sale.md", [
    "id: ask-for-the-sale",
    'claim: "Ask for the sale"',
    "category: sales",
    "week: 2026-10-26",
    "created_at: 2026-10-20",
  ], "The worst they can say is no."],
  ["Kedge/Lessons/write-it-down.md", [
    "id: write-it-down",
    'claim: "Write it down before you forget it"',
    "category: process",
    "week: 2026-11-02",
    "created_at: 2026-10-18",
  ], "A note to yourself is still a note."],
  ["Kedge/Next-Steps/call-the-dentist.md", [
    "id: call-the-dentist",
    'title: "Call the dentist"',
    "status: pending",
    "priority: 1",
    "tags:",
    "  - admin",
    "created_at: 2026-11-01",
  ], "Book the cleaning before the holidays."],
  ["Kedge/Next-Steps/file-taxes.md", [
    "id: file-taxes",
    'title: "File taxes"',
    "status: pending",
    "priority: 2",
    "tags:",
    "  - admin",
    "created_at: 2026-10-30",
  ], "Gather last year's forms."],
  ["Kedge/Next-Steps/renew-passport.md", [
    "id: renew-passport",
    'title: "Renew passport"',
    "status: pending",
    "priority: 2",
    "tags:",
    "  - admin",
    "created_at: 2026-11-02",
  ], "It expires in March."],
  ["Kedge/Next-Steps/trim-the-hedge.md", [
    "id: trim-the-hedge",
    'title: "Trim the hedge"',
    "status: snoozed",
    "snooze_until: 2099-01-01",
    "priority: 3",
    "created_at: 2026-10-15",
  ], "Wait until after the first frost."],
  ["Kedge/Letters/dear-self-in-december.md", [
    "id: dear-self-in-december",
    'title: "Dear self in December"',
    "status: delivered",
    "seal_date: 2026-10-15",
    "created_at: 2026-04-05",
  ], "You said you'd finish the rewrite by now. How's it going?"],
  ["Kedge/Letters/dear-future-me.md", [
    "id: dear-future-me",
    'title: "Dear future me"',
    "status: delivered",
    "seal_date: 2026-10-01",
    "created_at: 2026-04-01",
  ], "Sleep more. Drink more water."],
  ["Kedge/Letters/dear-me-in-a-year.md", [
    "id: dear-me-in-a-year",
    'title: "Dear me in a year"',
    "status: sealed",
    "seal_date: 2099-01-01",
    "created_at: 2026-11-02",
  ], "Did the stall make its first thousand?"],
];

function buildScratchVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kedge-shot-"));
  const plugins = path.join(dir, ".obsidian", "plugins", "kedge");
  fs.mkdirSync(plugins, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    const from = path.join(ROOT, file);
    if (!fs.existsSync(from)) die(`${file} missing — run "pnpm build" first`);
    fs.copyFileSync(from, path.join(plugins, file));
  }
  fs.writeFileSync(
    path.join(dir, ".obsidian", "community-plugins.json"),
    JSON.stringify(["kedge"], null, 2)
  );
  for (const [rel, frontmatter, body] of NOTES) {
    const file = path.join(dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, ["---", ...frontmatter, "---", body.trim(), ""].join("\n"));
  }
  return dir;
}

// ------------------------------------------------------------------ vault swap

function readRegistry() {
  return fs.readFileSync(REGISTRY);
}

/** Points Obsidian at `dir` the same way its own vault switcher does. */
function markVaultOpen(dir) {
  const registry = JSON.parse(readRegistry().toString());
  const vaults = registry.vaults ?? {};
  for (const vault of Object.values(vaults)) vault.open = false;
  const id = "ffffffffffffffff";
  vaults[id] = { path: dir, ts: Date.now(), open: true };
  registry.vaults = vaults;
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
}

function activeVaultPath() {
  const res = tryObsidian(["vault", "info=path"]);
  return succeeded(res) ? res.out.split("\n")[0].trim() : "";
}

/** Switches the running app to `dir`, and waits until the view is really up. */
async function switchTo(dir, timeoutMs = 120_000) {
  markVaultOpen(dir);
  const res = tryObsidian(["restart"]);
  if (!res.ok) die(`obsidian restart failed: ${res.err}`);
  const switched = await waitFor("vault switch", timeoutMs, () => activeVaultPath() === dir);
  if (switched !== true) die(`Obsidian never opened the scratch vault (${switched.timedOut}).`);
  // A fresh vault starts in restricted mode, where community plugins are listed
  // as enabled but never loaded. Turning it off reloads the app.
  const restricted = tryObsidian(["plugins:restrict", "off"]);
  if (!restricted.ok) die(`could not disable restricted mode: ${restricted.err}`);
  const settled = await waitFor("workspace tree", timeoutMs, () => {
    const tree = tryObsidian(["workspace"]);
    return succeeded(tree) && /^main$/m.test(tree.out);
  });
  if (settled !== true) die(`the workspace never settled (${settled.timedOut}).`);
}

async function restoreVault(backup, timeoutMs = 90_000) {
  fs.writeFileSync(REGISTRY, backup);
  tryObsidian(["restart"]);
  await waitFor("vault restored", timeoutMs, () => activeVaultPath() !== "");
}

// --------------------------------------------------------------------- capture

/**
 * The dark/light switch without a config write: `theme-light`/`theme-dark` on
 * the body is what Obsidian's own toggle flips, and the next reload restores
 * whatever the vault had, so the user's theme is never touched on disk.
 */
function forceLightMode() {
  evaluate(
    "document.body.classList.remove('theme-dark'); document.body.classList.add('theme-light'); 'light'"
  );
}

/** Everything the crops need, measured once: heights, tab bar, content edges. */
function measure() {
  const raw = evaluate(
    "JSON.stringify((()=>{const el=document.querySelector('.workspace-leaf-content.kedge-view'); if(!el) return null; const tabs=document.querySelector('.workspace-tab-header-container'); const rects=Array.from(document.querySelectorAll('.kedge-section')).map(s=>s.getBoundingClientRect()); if(!rects.length) return null; return {contentH:el.scrollHeight, viewH:el.clientHeight, tabH:tabs?Math.round(tabs.getBoundingClientRect().bottom):0, left:Math.min(...rects.map(r=>r.left)), right:Math.max(...rects.map(r=>r.right)), innerW:window.innerWidth};})())"
  );
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const setScroll = (y) =>
  evaluate(`document.querySelector('.workspace-leaf-content.kedge-view').scrollTop = ${y}`);
const readScroll = () =>
  Number(evaluate("document.querySelector('.workspace-leaf-content.kedge-view').scrollTop"));

function imageSize(file) {
  const out = execFileSync(imageTool(), ["identify", "-format", "%w %h", file], {
    encoding: "utf8",
  }).trim();
  const [w, h] = out.split(" ").map(Number);
  return { w, h };
}

/**
 * One screenshot per viewport of scroll, each cropped to the slice of the page
 * it is the first to show: [pos, pos + viewH), or the tail for the last one.
 * The device scale is read off the first screenshot rather than assumed, since
 * it follows the display, not the script.
 */
function captureStrips(geom, dir) {
  const maxScroll = Math.max(0, geom.contentH - geom.viewH);
  const positions = [];
  for (let y = 0; y < geom.contentH; y += geom.viewH) positions.push(Math.min(y, maxScroll));

  const strips = [];
  let scale = null;
  positions.forEach((pos, index) => {
    setScroll(pos);
    const landed = Math.abs(readScroll() - pos) < 3;
    if (!landed) die(`could not scroll to ${pos}`);
    const pageEnd = index === positions.length - 1 ? geom.contentH : positions[index + 1];
    const heightCss = pageEnd - pos;
    if (heightCss <= 0) return;

    const shot = path.join(dir, `strip-${index}.png`);
    const res = tryObsidian(["dev:screenshot", `path=${shot}`]);
    if (!res.ok) die(`screenshot failed: ${res.err}`);
    const { w } = imageSize(shot);
    scale = scale ?? w / geom.innerW;

    const crop = path.join(dir, `crop-${index}.png`);
    execFileSync(
      imageTool(),
      [
        shot,
        "-crop",
        `${Math.round((geom.right - geom.left) * scale)}x${Math.round(heightCss * scale)}+${Math.round(geom.left * scale)}+${Math.round(geom.tabH * scale)}`,
        "+repage",
        crop,
      ],
      { stdio: "ignore" }
    );
    strips.push(crop);
  });

  if (strips.length === 0) die("nothing to capture");
  return strips;
}

function stitch(strips, file, dir) {
  const tool = imageTool();
  const stacked = path.join(dir, "stacked.png");
  execFileSync(tool, [...strips, "-append", stacked], { stdio: "ignore" });
  execFileSync(tool, [stacked, "-bordercolor", "white", "-border", `${BORDER}x0`, file], {
    stdio: "ignore",
  });
}

// ------------------------------------------------------------------------ run

const backup = readRegistry();
const scratch = buildScratchVault();
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "kedge-shot-work-"));

try {
  await switchTo(scratch);

  const opened = await waitFor("dashboard", 60_000, () => {
    const res = tryObsidian(["command", "id=kedge:open-dashboard"]);
    return succeeded(res) ? res.out : false;
  });
  if (typeof opened !== "string") die("the dashboard command failed");

  evaluate("document.querySelector('.workspace-leaf-content.kedge-view').scrollTop = 0");
  forceLightMode();
  await sleep(800);

  const geom = await waitFor("dashboard sections", 15_000, () => measure());
  if (!geom || geom.timedOut) die("the dashboard never rendered its sections");

  const strips = captureStrips(geom, workDir);
  stitch(strips, OUT, workDir);
  const dims = execFileSync(imageTool(), ["identify", "-format", "%wx%h", OUT], {
    encoding: "utf8",
  }).trim();
  console.log(
    `ok ${path.relative(ROOT, OUT)} ${dims} — ${strips.length} strips, ${Math.round(geom.contentH)}px of dashboard, ${BORDER}px margins`
  );
} finally {
  if (KEEP) {
    console.log(`kept ${scratch} and ${workDir}`);
  } else {
    fs.rmSync(scratch, { recursive: true, force: true });
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  await restoreVault(backup);
}
