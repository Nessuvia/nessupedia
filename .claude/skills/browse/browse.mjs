#!/usr/bin/env node
// Headless Firefox driver for viewing the OC Wiki dev server. See SKILL.md for usage.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { firefox } from "playwright";

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = resolve(SKILL_DIR, "../../..");
const OUT_DIR = join(SKILL_DIR, "out");
const USER_SERVER = "http://localhost:5173";
const OWN_PORT = 5179;

// Git Bash rewrites arguments with a leading "/" into Windows paths ("/" -> "C:/Program Files/Git/", "/w/x" -> "W:/x").
function appPath(arg = "") {
  if (/^[A-Za-z]:[\\/]/.test(arg)) {
    throw new Error(`"${arg}" looks like a path Git Bash rewrote. Drop the leading slash ("w/...") or set MSYS_NO_PATHCONV=1.`);
  }
  return arg.startsWith("/") ? arg : `/${arg}`;
}

function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  const options = { width: 1280, height: 800, timeout: 5000 };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i].replace(/^--/, "");
    if (flag === "full" || flag === "no-snapshot") options[flag] = true;
    else options[flag] = rest[++i];
  }
  return { command, target, options };
}

async function reachable(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

async function startServer() {
  if (await reachable(USER_SERVER)) return { url: USER_SERVER, stop: () => {} };

  const url = `http://localhost:${OWN_PORT}`;
  const vite = join(REPO_DIR, "node_modules/vite/bin/vite.js");
  const child = spawn(process.execPath, [vite, "--port", String(OWN_PORT), "--strictPort"], { cwd: REPO_DIR, stdio: "ignore" });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await reachable(url)) return { url, stop: () => child.kill() };
    await new Promise((done) => setTimeout(done, 250));
  }
  child.kill();
  throw new Error(`Dev server did not start on ${url}`);
}

function readJson(path) {
  if (path === "-") return JSON.parse(readFileSync(0, "utf8"));
  const candidates = [resolve(process.cwd(), path), join(SKILL_DIR, "fixtures", path), join(SKILL_DIR, "fixtures", `${path}.json`)];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`No file at ${candidates.join(" or ")}`);
  return JSON.parse(readFileSync(found, "utf8"));
}

// Creates wikis and pages through the app's own service singletons, served as modules by Vite.
async function seed(page, fixture) {
  return page.evaluate(async (data) => {
    const { pageService, wikiService } = await import("/src/services/index.ts");
    const ids = { wiki: {}, page: {} };
    for (const wiki of data.wikis) {
      const created = await wikiService.create(wiki.name);
      ids.wiki[wiki.name] = created.id;
      for (const { title, body = "" } of wiki.pages ?? []) {
        ids.page[title] = (await pageService.create({ wikiId: created.id, title, body })).id;
      }
    }
    return ids;
  }, fixture);
}

function interpolate(value, ids) {
  if (typeof value === "string") {
    return value.replace(/\{(wiki|page):([^}]+)\}/g, (raw, kind, name) => ids[kind]?.[name] ?? raw);
  }
  if (Array.isArray(value)) return value.map((item) => interpolate(item, ids));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, ids)]));
  return value;
}

function locate(page, target) {
  if (typeof target === "string") return page.locator(target).first();
  const { role, name, text, exact } = target;
  if (role) return page.getByRole(role, { name, exact }).first();
  return page.getByText(text, { exact }).first();
}

let shotCount = 0;
async function screenshot(page, name, full) {
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${String(++shotCount).padStart(2, "0")}-${name.replace(/[^\w-]+/g, "-")}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(`screenshot: ${file}`);
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function runStep(page, step, context) {
  const [action, raw] = Object.entries(step)[0];
  const arg = interpolate(raw, context.ids);
  const label = `> ${action} ${JSON.stringify(arg)}`;
  console.log(label.length > 160 ? `${label.slice(0, 157)}...` : label);

  switch (action) {
    case "goto":
      await page.goto(new URL(appPath(arg), context.baseUrl).href);
      await settle(page);
      break;
    case "seed":
      context.ids = await seed(page, readJson(arg));
      console.log(`  ids: ${JSON.stringify(context.ids)}`);
      break;
    case "click":
      await locate(page, arg).click();
      await settle(page);
      break;
    case "fill":
      await locate(page, arg[0]).fill(arg[1]);
      break;
    case "type":
      if (Array.isArray(arg)) await locate(page, arg[0]).pressSequentially(arg[1]);
      else await page.keyboard.type(arg);
      break;
    case "dialogs":
      if (arg !== "accept" && arg !== "dismiss") throw new Error(`dialogs takes "accept" or "dismiss"`);
      context.dialogs = arg;
      break;
    case "press":
      if (Array.isArray(arg)) await locate(page, arg[0]).press(arg[1]);
      else await page.keyboard.press(arg);
      await settle(page);
      break;
    case "wait":
      if (typeof arg === "number") await page.waitForTimeout(arg);
      else await locate(page, arg).waitFor();
      break;
    case "screenshot":
      await screenshot(page, arg || "shot", context.options.full);
      break;
    case "snapshot":
      console.log(await page.locator(arg || "body").first().ariaSnapshot());
      break;
    case "text":
      console.log(await locate(page, arg).innerText());
      break;
    case "eval":
      console.log(JSON.stringify(await page.evaluate(arg), null, 2));
      break;
    case "url":
      break;
    default:
      throw new Error(`Unknown step "${action}"`);
  }
  console.log(`  url: ${page.url().replace(context.baseUrl, "")}`);
}

async function main() {
  const { command, target, options } = parseArgs(process.argv.slice(2));
  if (command !== "view" && command !== "run") {
    console.log("usage: browse.mjs view <path> [--seed fixture.json] [--width 1280] [--height 800] [--timeout 5000] [--full] [--no-snapshot]");
    console.log("       browse.mjs run <steps.json | -> [--seed fixture.json] [--width 1280] [--height 800] [--timeout 5000] [--full]");
    process.exit(1);
  }

  const steps = command === "view"
    ? [{ goto: appPath(target) }, { screenshot: "view" }, ...(options["no-snapshot"] ? [] : [{ snapshot: "body" }])]
    : readJson(target);
  if (options.seed) steps.unshift({ goto: "/" }, { seed: options.seed });

  rmSync(OUT_DIR, { recursive: true, force: true });
  const server = await startServer();
  const browser = await firefox.launch();
  const problems = [];
  try {
    const page = await browser.newPage({ viewport: { width: Number(options.width), height: Number(options.height) } });
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") problems.push(`console.${message.type()}: ${message.text()}`);
    });
    page.setDefaultTimeout(Number(options.timeout));
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

    const context = { baseUrl: server.url, ids: { wiki: {}, page: {} }, options, dialogs: "dismiss" };
    page.on("dialog", async (dialog) => {
      console.log(`  dialog ${dialog.type()} "${dialog.message()}": ${context.dialogs}`);
      await (context.dialogs === "accept" ? dialog.accept() : dialog.dismiss());
    });
    console.log(`server: ${server.url}`);
    for (const step of steps) {
      try {
        await runStep(page, step, context);
      } catch (error) {
        console.log(`  FAILED: ${error.message.split("\n")[0]}`);
        await screenshot(page, "failure", false);
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    await browser.close();
    server.stop();
    console.log(problems.length ? `\n${problems.join("\n")}` : "\nno console errors");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
