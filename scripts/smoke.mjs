#!/usr/bin/env node
/**
 * Live Obsidian smoke test (tier B).
 *
 * The jest suite runs against a hand-written Obsidian mock, so it cannot see
 * whether the real app accepts an API call or whether a view ever appears.
 * This script opens a throwaway vault in the real Obsidian through the
 * official `obsidian` CLI, runs the plugin's own command, and checks the
 * resulting workspace — the class of bug that shipped with getLeaves().
 *
 * Your real vault is never written to: the scratch vault is a temp directory
 * and the vault registry is restored byte-for-byte afterwards.
 *
 * Usage:
 *   npm run smoke                     # build, then smoke
 *   node scripts/smoke.mjs --keep     # leave the scratch vault for inspection
 *   SMOKE_SOURCE_VAULT=/path/to/vault node scripts/smoke.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const HOME = os.homedir();
const OBSIDIAN = process.env.SMOKE_OBSIDIAN_BIN ?? "obsidian";
const SOURCE_VAULT =
  process.env.SMOKE_SOURCE_VAULT ??
  path.join(HOME, "Library/Mobile Documents/iCloud~md~obsidian/Documents/MyVault");
const REGISTRY = path.join(HOME, "Library/Application Support/obsidian/obsidian.json");
const KEEP = process.argv.includes("--keep");

const results = [];
let scratch = "";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function pass(label, detail = "") {
  results.push({ ok: true, label });
  console.log(`  ok   ${label}${detail ? ` — ${detail}` : ""}`);
}

function fail(label, detail = "") {
  results.push({ ok: false, label });
  console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
}

function die(message) {
  throw new Error(message);
}

/** Runs the Obsidian CLI and returns stdout. */
function obsidian(args, { timeout = 30_000 } = {}) {
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
    return { ok: false, out: "", err: error.message };
  }
}

async function waitFor(label, timeoutMs, probe) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const value = probe();
    if (value) return value;
    last = `${label} not yet true`;
    await sleep(500);
  }
  return { timedOut: last };
}

// --------------------------------------------------------------------- scratch vault

function buildScratchVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "chartroom-smoke-"));
  const plugins = path.join(dir, ".obsidian", "plugins", "chartroom");
  fs.mkdirSync(plugins, { recursive: true });
  for (const file of ["main.js", "manifest.json", "styles.css"]) {
    if (!fs.existsSync(file)) die(`${file} missing — run "npm run build" first`);
    fs.copyFileSync(file, path.join(plugins, file));
  }
  fs.writeFileSync(
    path.join(dir, ".obsidian", "community-plugins.json"),
    JSON.stringify(["chartroom"], null, 2)
  );
  return dir;
}

// --------------------------------------------------------------------- vault switching

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
}

/** Points Obsidian at `dir` the same way its own vault switcher does. */
function markVaultOpen(dir) {
  const registry = readRegistry();
  const vaults = registry.vaults ?? {};
  for (const vault of Object.values(vaults)) vault.open = false;
  const existing = Object.entries(vaults).find(([, v]) => v.path === dir)?.[0];
  const id = existing ?? Math.random().toString(16).slice(2, 18).padEnd(16, "0");
  vaults[id] = { path: dir, ts: Date.now(), open: true };
  registry.vaults = vaults;
  fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2));
}

function activeVaultPath() {
  const res = tryObsidian(["vault", "info=path"]);
  return res.ok ? res.out.split("\n")[0].trim() : "";
}


async function restoreVault(backup, timeoutMs = 90_000) {
  fs.writeFileSync(REGISTRY, backup);
  tryObsidian(["restart"]);
  await waitFor("vault restored", timeoutMs, () => activeVaultPath() === SOURCE_VAULT);
}

// --------------------------------------------------------------------- checks

/**
 * The CLI answers before the app settles: a command list can come back empty
 * and a just-opened view can be missing from the tree for a moment. Every
 * check therefore polls to a deadline instead of trusting one reading.
 */
const WANTED_COMMANDS = [
  "chartroom:open-chartroom",
  "chartroom:create-next-step",
  "chartroom:create-lesson",
];

function readCommands() {
  const res = tryObsidian(["commands", "filter=chartroom"]);
  if (!cliSucceeded(res)) return [];
  return res.out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

async function checkCommandsRegistered(timeoutMs = 60_000) {
  const ready = await waitFor("commands", timeoutMs, () => {
    const ids = readCommands();
    return WANTED_COMMANDS.every((id) => ids.includes(id)) ? ids : false;
  });
  if (Array.isArray(ready)) pass("commands registered", `${ready.length} chartroom:* commands`);
  else fail("commands registered", `missing some of ${WANTED_COMMANDS.join(", ")}`);
}

/** The CLI can exit 0 while printing an error, so the output decides. */
function cliSucceeded(res) {
  return res.ok && !/^Error:/m.test(res.out.trim());
}

async function checkCommandRuns(timeoutMs = 30_000) {
  const done = await waitFor("command execution", timeoutMs, () => {
    const res = tryObsidian(["command", "id=chartroom:open-chartroom"]);
    return cliSucceeded(res) ? res.out : false;
  });
  if (typeof done === "string") {
    pass("obsidian command id=chartroom:open-chartroom", done.split("\n")[0]);
  } else {
    fail("obsidian command id=chartroom:open-chartroom", "the CLI refused to run it");
  }
}

async function switchTo(dir, timeoutMs = 120_000) {
  markVaultOpen(dir);
  const res = tryObsidian(["restart"]);
  if (!res.ok) die(`obsidian restart failed: ${res.err}`);
  const switched = await waitFor("vault switch", timeoutMs, () => activeVaultPath() === dir);
  if (switched !== true) {
    die(
      `Obsidian never opened the scratch vault (${switched.timedOut}). ` +
        `If it is holding the vault in restricted mode, open ${dir} once by hand.`
    );
  }
  // A fresh vault starts in restricted mode, where community plugins are
  // listed as enabled but never loaded. Turning it off reloads the app.
  const restricted = tryObsidian(["plugins:restrict", "off"]);
  if (!restricted.ok) die(`could not disable restricted mode: ${restricted.err}`);

  // ...and that reload answers the CLI before the workspace is rebuilt, so a
  // command fired too early is accepted and does nothing. Wait for the tree.
  const settled = await waitFor("workspace tree", timeoutMs, () => {
    const tree = tryObsidian(["workspace"]);
    return cliSucceeded(tree) && /^main$/m.test(tree.out);
  });
  if (settled !== true) die(`the workspace never settled (${settled.timedOut}).`);
}

async function checkViewInWorkspace(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let retriedAt = 0;
  while (Date.now() < deadline) {
    const tree = tryObsidian(["workspace"]);
    if (cliSucceeded(tree) && tree.out.includes("[chartroom-dashboard]")) {
      pass("dashboard view is in the workspace");
      return;
    }
    // one retry in case the first open landed mid-reload
    if (Date.now() - retriedAt > 5_000) {
      retriedAt = Date.now();
      tryObsidian(["command", "id=chartroom:open-chartroom"]);
    }
    await sleep(500);
  }
  fail("dashboard view is in the workspace", "no [chartroom-dashboard] tab appeared");
}

async function checkFoldersCreated(timeoutMs = 30_000) {
  const wanted = ["Chartroom/Letters", "Chartroom/Next-Steps", "Chartroom/Lessons"];
  const ready = await waitFor("folders", timeoutMs, () => {
    const listing = tryObsidian(["folders"]);
    if (!cliSucceeded(listing)) return false;
    const folders = listing.out.split("\n").map((line) => line.trim());
    return wanted.every((folder) => folders.includes(folder)) ? folders : false;
  });
  if (Array.isArray(ready)) pass("plugin onload created its folders");
  else fail("plugin onload created its folders", `missing some of ${wanted.join(", ")}`);
}

// --------------------------------------------------------------------- main

async function main() {
  if (!fs.existsSync(SOURCE_VAULT)) die(`source vault not found: ${SOURCE_VAULT}`);
  const version = tryObsidian(["version"]);
  if (!version.ok) die(`the obsidian CLI is not answering — is Obsidian running? (${version.err})`);
  console.log(`smoke: Obsidian ${version.out.split("\n")[0]}`);

  scratch = buildScratchVault();
  const registryBackup = fs.readFileSync(REGISTRY);
  console.log(`smoke: scratch vault ${scratch}`);

  try {
    await switchTo(scratch);
    await checkCommandsRegistered();
    await checkCommandRuns();
    await checkViewInWorkspace();
    await checkFoldersCreated();
  } finally {
    await restoreVault(registryBackup);
    if (scratch) {
      if (KEEP) console.log(`smoke: kept ${scratch}`);
      else fs.rmSync(scratch, { recursive: true, force: true });
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`smoke: ${error.message}`);
  process.exitCode = 1;
} finally {
  const failed = results.filter((r) => !r.ok);
  if (results.length) {
    console.log(
      `\nsmoke: ${results.length - failed.length} passed, ${failed.length} failed` +
        (KEEP ? "" : " (scratch vault removed)")
    );
  }
  if (failed.length) process.exitCode = 1;
}
