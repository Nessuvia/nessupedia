---
name: browse
description: View and drive the OC Wiki app in headless Firefox. Use to screenshot a page, read its accessibility tree, click through navigation, check console errors, or confirm a UI change works in the real app. Starts its own dev server and can seed wikis and pages.
---

# Browse the app

`browse.mjs` drives Playwright's own headless Firefox build against the Vite dev server. The user only has Firefox installed; never install or assume Chrome.

Run from the repo root:

```sh
node .claude/skills/browse/browse.mjs view <path> [options]
node .claude/skills/browse/browse.mjs run <steps.json | -> [options]
```

## Setup

On a fresh machine, or if `node_modules` is missing in this folder:

```sh
cd .claude/skills/browse && npm install && npx playwright install firefox
```

These dependencies live only in this folder; never add Playwright to the app's `package.json`.

## Server

If a dev server answers on `http://localhost:5173` (the user's `npm run dev`), the script reuses it. Otherwise it starts Vite on port 5179 and stops it when done. Each run uses a fresh browser profile, so IndexedDB starts empty.

## Paths in Git Bash

Git Bash rewrites arguments that start with `/` into Windows paths (`/` becomes `C:/Program Files/Git/`, `/w/x` becomes `W:/x`). Pass app paths without the leading slash: `view ""` for the root, `view "w/{wiki:Ashfall}/wiki/Mira"`. Paths inside a steps file are not rewritten.

## Options

- `--seed <fixture>`: create wikis and pages before the steps. Accepts a path or a name in `fixtures/` (`--seed ashfall`).
- `--width 1280`, `--height 800`: viewport.
- `--full`: full-page screenshots.
- `--timeout 5000`: milliseconds to wait for each element.
- `--no-snapshot` (view only): skip the accessibility tree.

## view

Opens the path, saves a screenshot, and prints the accessibility tree and any console errors. Prefer the printed tree for checking structure and text; Read the screenshot when layout or styling matters.

## run

Takes a JSON array of steps from a file, or from stdin with `-`:

```sh
node .claude/skills/browse/browse.mjs run - --seed ashfall <<'EOF'
[
  { "goto": "/w/{wiki:Ashfall}/wiki/Mira" },
  { "click": { "role": "link", "name": "Theo" } },
  { "snapshot": "main" },
  { "screenshot": "theo" }
]
EOF
```

Each step is one key:

| Step | Argument |
|---|---|
| `goto` | App path |
| `click` | Target |
| `fill` | `[target, value]`; replaces the value of an input, or the text of a contenteditable |
| `type` | `[target, text]` typed key by key, or `text` for the focused element. Use for CodeMirror, where it exercises real input handling |
| `dialogs` | `"accept"` or `"dismiss"`: how later `alert` / `confirm` / `beforeunload` prompts are answered. Default `dismiss`; each prompt prints as `dialog …` |
| `press` | Key (`"Enter"`), or `[target, key]` |
| `wait` | Milliseconds, or a target to wait for |
| `screenshot` | File name |
| `snapshot` | CSS selector to print the accessibility tree of (default `body`) |
| `text` | Target whose visible text to print |
| `eval` | JavaScript expression evaluated in the page; the result prints as JSON |
| `seed` | Fixture path or name |

A target is a Playwright selector string (`"text=Mira"`, `"a.wikilink.new"`, `"#search"`) or an object: `{ "role": "link", "name": "Theo", "exact": true }` or `{ "text": "Early life" }`. The first match is used.

After every step the script prints the current URL. On a failed step it saves `failure.png` and stops with exit code 1. Screenshots land in `out/`, which is cleared at the start of each run; Read the printed path to view one.

## App landmarks

- Page view: `.page-actions` (the Edit link) exists only there; `.page-body` also appears in the editor's preview, so don't wait on it to detect a finished save.
- Editor (`/w/:id/edit/:title`): type into `.cm-content` with `type`; the summary is `.summary input`, the Minor edit box `.minor input`. Leaving with unsaved changes raises a `confirm`, answered by the `dialogs` setting.

## Seeding and ids

`seed` imports `/src/services/index.ts` in the page, the same module instance the app uses, and creates each wiki and page through `wikiService` and `pageService`. Links, change entries, and search behave exactly as in the app.

Seeding prints the created ids. Any step argument can reference them as `{wiki:Name}` or `{page:Title}`.

`eval` can reach the services the same way:

```json
{ "eval": "import('/src/services/index.ts').then(({ linkIndexer }) => linkIndexer.redLinks('{wiki:Ashfall}'))" }
```

## Fixtures

Fixtures are `{ "wikis": [{ "name": "...", "pages": [{ "title": "...", "body": "markdown" }] }] }`.

- `ashfall.json` has two wikis. Ashfall has a Main Page, Mira (alias Mi), Theo (aliases The Archivist and Teddy), and Ashfall. The pages cover headings, labeled links, alias links, red links (The Lantern Guild, Corin Vale, Ember Quarter), and a wikilink inside a code block. Second Wiki has only a Main Page.

Add a fixture here when a feature needs data the existing ones lack.
