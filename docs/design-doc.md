# Design Doc: OC Wiki

## Overview
Client-only PWA. All data lives in IndexedDB. Markdown is the content format. An LLM agent reads the wiki through tools and proposes edits section by section.

## Stack
| Concern | Choice |
|---|---|
| Framework | Vue 3 + Vite + TypeScript |
| State | Pinia |
| Storage | Dexie (IndexedDB) |
| Markdown | unified / remark / rehype |
| Editor | CodeMirror 6 |
| PWA | vite-plugin-pwa |
| ZIP | fflate |
| Future backend | None planned; sharing may need one (ADR 0010) |

## Architecture
```
┌──────────────────────── Vue app ────────────────────────┐
│  Views ── Pinia stores ── Services                       │
│                             ├─ PageService               │
│                             ├─ LinkIndexer               │
│                             ├─ ChangeLog                 │
│                             ├─ SearchService             │
│                             ├─ MarkdownPipeline          │
│                             ├─ ArchiveService (ZIP)      │
│                             ├─ VaultImporter             │
│                             ├─ MentionFinder             │
│                             └─ Agent                     │
│                                 ├─ RunOrchestrator       │
│                                 ├─ AutoContext           │
│                                 ├─ Tools                 │
│                                 ├─ ReplyRepair           │
│                                 ├─ TokenCounter          │
│                                 └─ LlmClient             │
│                         Dexie (IndexedDB)                │
└──────────────────────────────────────────────────────────┘
```

## Data model
```ts
interface Wiki {
  id: string;
  name: string;
  slug: string; // the wiki's URL segment, unique across wikis
  themeId: string;
  voice: "fandom" | "in-universe";
  keepOriginalImages?: boolean;
  historyDays?: number;
  continuities?: Continuity[];
  assistantRules?: string;
  autoContextDepth?: number;
  appearance?: Appearance;
  lastExportedAt?: number; // set by ZIP export and import; left out of wiki.json
  createdAt: number;
}

interface Appearance {
  accent?: string; // hex; unset uses the theme's default red
  fonts?: { heading?: WikiFont; body?: WikiFont };
  images?: Partial<Record<"banner" | "background" | "wordmark" | "icon", string>>; // asset paths
}

interface WikiFont {
  id: string; // Fontsource ID, e.g. "rubik"
  family: string;
  category: string; // serif, sans-serif, display… for the fallback stack
  files: { path: string; weight: number; style: "normal" | "italic"; unicodeRange?: string }[];
}

interface Continuity {
  id: string;
  name: string;
  description: string;
}

interface Page {
  id: string;
  wikiId: string;
  title: string;
  titleKey: string;
  aliases: string[];
  aliasKeys: string[];
  categoryKeys: string[];
  path: string;
  templateId?: string;
  frontmatter: Record<string, unknown>;
  body: string;
  updatedAt: number;
}

interface Link {
  id?: number;
  wikiId: string;
  fromPageId: string;
  targetTitle: string;
  targetKey: string;
  toPageId?: string;
  field?: "between";
}

interface ChangeEntry {
  id?: number;
  wikiId: string;
  pageId: string;
  pageTitle: string;
  kind: "create" | "edit" | "rename" | "delete" | "restore";
  author: "human" | "llm";
  minor: boolean;
  summary: string;
  diff: string;
  at: number;
}

interface Asset {
  id: string;
  wikiId: string;
  path: string;
  mime: string;
  blob: Blob;
  hash: string;
  width?: number;
  height?: number;
  original?: Blob;
  createdAt: number;
}

interface Template {
  id: string;
  wikiId?: string;
  name: string;
  body: string;
  frontmatter: Record<string, unknown>;
}

interface AgentRun {
  id: string;
  wikiId: string;
  pageId?: string;
  pageTitle: string;
  kind: "draft" | "suggest-links" | "fill-template";
  mode: "strict" | "guided" | "liberal";
  input: { notes?: string; rules?: string; templateId?: string };
  status: "running" | "reviewing" | "done" | "interrupted" | "error";
  error?: string;
  sections: RunSection[];
  linkSuggestions?: LinkSuggestion[];
  transcript: TranscriptEntry[];
  startedAt: number;
}

interface RunSection {
  heading: string;
  status: "pending" | "writing" | "proposed" | "accepted" | "discarded" | "failed";
  markdown?: string;
  raw?: string;
  sources: string[];
  hints?: string[];
  note?: string;
  problem?: string;
  unknownLinks?: { title: string; closest: string[] }[];
}

interface LinkSuggestion {
  start: number;
  end: number;
  text: string;
  title: string;
}

type TranscriptEntry =
  | { kind: "message"; section?: number; role: "system" | "user" | "assistant"; content: string; at: number }
  | { kind: "tool-call"; section?: number; name: string; args: unknown; result?: string; error?: boolean; repeat?: number; at: number }
  | { kind: "repair"; section?: number; text: string; at: number };

interface ModelSettings {
  id: "model";
  provider: "llama.cpp" | "koboldcpp" | "ollama" | "lmstudio" | "openrouter" | "nanogpt" | "openai";
  baseUrl: string;
  apiKey?: string;
  model: string;
  contextLength: number;
  replyTokens: number;
  tools: boolean;
  tokenizerId?: string;
}

interface Tokenizer {
  id: string;
  family: string;
  source: string;
  data: Blob;
  config: Blob;
  downloadedAt: number;
}
```
- `pageId` is unset on a draft of a new page until its first section is accepted.
- A section's `note` is the author's note for a retry, `problem` says why it failed, and `hints` are its template hints.
- `ModelSettings` is one app-wide record in `settings`. `contextLength` and `tools` are filled in by Test connection and can be overridden.

### Dexie schema
```ts
this.version(1).stores({
  wikis: "id, name",
  pages: "id, wikiId, [wikiId+titleKey], *aliasKeys, [wikiId+path], spinoffOf, updatedAt",
  links: "++id, wikiId, fromPageId, toPageId, [wikiId+targetKey]",
  changes: "++id, wikiId, pageId, at, minor",
  assets: "id, wikiId, [wikiId+path]",
  templates: "id, wikiId, name",
  runs: "id, wikiId, pageId, startedAt",
});
this.version(2).stores({
  assets: "id, wikiId, [wikiId+path], [wikiId+hash]",
});
this.version(3).stores({
  pages: "id, wikiId, [wikiId+titleKey], *aliasKeys, *categoryKeys, [wikiId+path], updatedAt",
});
this.version(4).stores({
  settings: "id",
  tokenizers: "id",
});
this.version(5).stores({
  wikis: "id, name, &slug",
});
this.version(6).stores({
  cards: "pageId, wikiId",
});
```
Version 3 fills `categoryKeys` from each page's frontmatter. Version 5 gives each wiki a slug from its name. Version 6 adds character cards, one per page.

### Page titles
Titles are trimmed, must not be blank, and must not contain `[`, `]`, `|`, or `#`, which wikilink syntax reserves. Creation and rename enforce this; a title can't match another page's title or alias.

A `/` makes a subpage: `Mira/History` belongs to `Mira`. Each segment is trimmed and must not be blank. `Relationships` is reserved as a last segment for the generated tab. A last segment that names a continuity makes the page a version (`Mira/Noir AU`), which needs its main page and can't have subpages.

### Storage model
Hybrid: records keyed by ID, each with a `path`. Markdown stores link titles; the `links` table resolves titles to IDs. Titles and aliases match case-insensitively through normalized keys (`titleKey`, `aliasKeys`, `targetKey`): trimmed, whitespace collapsed, lowercased. Renames update the title and path and rewrite inbound link text as minor edits; links by alias, and wikilink-like text in code or frontmatter, stay untouched. Renaming a page renames its subpages and versions with it. Export and import translate between IDs and paths.

Paths follow titles, with slashes as folders: `Mira/History` is stored at `pages/Mira/History.md`.

Frontmatter fields that name pages (`between`) are indexed in `links` with a `field` marker, so they resolve, show red, count in What links here, and are rewritten on rename like body links. Rewriting edits only that field's YAML.

## Markdown format
- The page title renders as the page's only `h1`; bodies start at `##`.
- YAML frontmatter: `title`, `aliases`, `categories`, `template`, `between` (relationship pages), `changes` (versions), `tabs` (tab order), `history: keep` (exempt from pruning), `auto-context` (see Auto-context), custom fields. `categories`, `aliases`, and `changes` accept a single string or a list.
- Raw HTML never renders. An HTML comment standing as its own block (`<!-- hint -->`) renders as a hint block with its source range, hidden by CSS outside click-to-edit.
- `[[Title]]`, `[[Title|label]]`, `[[Title#Heading]]`.
- GitHub-style tables, with column alignment. Inside a cell a bar is written `\|`, as in `[[Title\|label]]`. Other GFM extensions (autolinks, footnotes, strikethrough, task lists) aren't parsed. A table is one click-to-edit block.
- Obsidian callouts: `> [!type] Optional title`, with every Obsidian type and alias; unknown types style as `note`. `[!type]-` renders folded and `[!type]+` open, both as `<details>`.
- Images: `![[assets/path.webp]]`, `![[assets/path.webp|alt text]]`, or `![[assets/path.webp|300]]` for a width. A bare file name also looks in `assets/`, so Obsidian embeds resolve. Embeds of anything but an image stay as text.
- Directives (remark-directive). Text that only looks like a directive, such as `re:Zero`, renders as written.
  - `:::canon{tier=hard|soft|maybe}` wraps blocks; `:canon[a phrase]{tier=maybe}` marks text inline. `canon`, `likely`, and `idea` are accepted as tier names; a missing tier means `hard`.
  - `:::infobox` and `:::pressure` hold field lines, `Label: value`. A line indented two spaces continues the previous value, and a line that is neither starts an unlabeled row. Values are markdown.
  - Infobox lines: `title:` once at the top; `=== Tab name` starts a tab; `image: path | caption` adds an image to the current tab; `## Group` starts a group. Lowercase `title`, `image`, and `===` are reserved; any other label is a row. Lines before the first tab show under every tab.
  - Pressure fields are free-form; the form editor starts with Triggers, Coping, Contradictions, Breaking point, How others read it, and Aftermath.

```markdown
:::infobox
title: Mira Vale
Species: Human
=== Adult
image: assets/mira-adult.webp | Age 30
## Biographical
Born: 1203, [[Harrow]]
=== Young
image: assets/mira-young.webp | Age 12
:::

:::pressure
Triggers: Being talked over.
Coping: Counts exits, then jokes.
  Never in front of [[Theo]].
:::

She was born in winter :canon[during the long frost]{tier=maybe}.
```

### Pipeline
```
markdown
 → remark-parse
 → remark-frontmatter
 → remark-directive + custom handlers (canon, infobox, pressure)
 → remark-callouts (custom)
 → remark-wikilinks + image embeds (custom)
 → remark-rehype
 → rehype-slug
 → rehype-sanitize
 → rehype-stringify / Vue renderer
```
The mdast is reused for link indexing, auto-context scanning, section slicing, and click-to-edit source positions.

## Routes
| Path | View |
|---|---|
| `/` | Redirects to the last opened wiki, or to `/new-wiki` when none exist |
| `/new-wiki` | Create a wiki; doubles as first run |
| `/w/:wiki` | Redirects to the wiki's Main Page |
| `/w/:wiki/wiki/:title` | Page view |
| `/w/:wiki/edit/:title` | Split view editor, loaded on demand; hides the right rail |
| `/w/:wiki/history/:title` | A page's history, diffs, and restore; also serves deleted pages |
| `/w/:wiki/card/:title` | A page's character card: add, edit, download, remove |
| `/w/:wiki/new?title=` | Create a page, title prefilled from red links |
| `/w/:wiki/special/search?q=` | Full-text results with snippets, plus "Create page" when no title or alias matches |
| `/w/:wiki/special/settings` | Wiki settings: rename, change the URL, delete with typed confirmation |
| `/w/:wiki/special/appearance` | The wiki's accent, fonts, images, and Wiki Assets Pack |
| `/w/:wiki/special/documents` | Wiki Documents: cards and page images, filtered by type |
| `/w/:wiki/special/all-pages` | All pages, grouped by first letter |
| `/w/:wiki/special/recent-changes` | Recent changes feed |
| `/w/:wiki/special/categories` | Every category with its page count |
| `/w/:wiki/special/category/:name` | A category's pages, grouped by first letter |
| `/w/:wiki/special/templates` | Bundled and user templates |
| `/w/:wiki/special/templates/:templateId/edit` | Split view editor for a user template |
| `/w/:wiki/special/continuity/:name` | A continuity's description and versions |
| `/w/:wiki/special/review/:runId` | Review an Assistant run's proposals section by section |

`/w/:wiki/wiki/Mira/Relationships` and `/w/:wiki/wiki/Mira/Noir AU/Relationships` render the generated Relationships tab; no page holds them.

`:wiki` is the wiki's slug: its name lowercased with hyphens, numbered when taken, and editable in settings. A guard looks the slug up and passes views the wiki's ID; a link that names the wiki by ID, as URLs did before slugs, is redirected to the slug. Links inside a wiki leave the slug out and inherit the current one.

Routes under `/w/:wiki` render inside the wiki layout. A route can add right rail modules through a named `rail` view. History mode. The service worker serves the app shell for every navigation, so deep links work offline. Views read Dexie through `useLiveQuery`, so lists and pages update after any write.

## Page view
- Links render red when no page title or alias matches, case-insensitively; existence updates live. Red links open page creation with the title filled in, and a missing page offers "Create this page".
- Wikilink clicks route inside the app; modified clicks open new tabs as usual.
- A title that matches an alias redirects to the page's title and shows "(Redirected from …)"; a case-only mismatch corrects the URL silently.
- The lead (everything before the first `##`) renders above a numbered Contents box, shown at three or more h2 to h4 headings, with a remembered hide toggle.
- The right rail adds What links here; for a missing page it lists pages whose red links target that title.
- Categories show as an "in:" line above the title, in frontmatter order.
- Page actions beside the title: Edit, Details, History, Rename, Save as template, Delete. Details writes frontmatter through the `yaml` document API, so other keys, their order, and comments survive. Rename and Delete open dialogs that state their effects (how many pages' links get rewritten or turn red) before acting. Dialogs use the native `<dialog>` element.

## Search
- `suggest` matches titles and aliases for type-ahead and the page picker.
- `search` adds full text over each page's plain text (frontmatter excluded, wikilinks read as their labels).
- Ranking: exact, prefix, word prefix, then substring; titles beat aliases at the same tier; any name match beats body matches, which need every term and rank by occurrence count.
- In-memory scan with plain text cached per page until its body changes.
- A version is searched by its own text only; sections it inherits belong to the main page.
- The global bar's search box is a combobox over `suggest`: arrows pick a suggestion, Enter opens it, Enter with none picked opens the results page. Matches are highlighted with text spans, never HTML.

## Split view
- CodeMirror 6 with markdown and YAML frontmatter highlighting on the left; the same `PageContent` renderer as the page view on the right, with links inert.
- The draft loads once per page, so live updates never overwrite typing.
- Save (button or Ctrl/Cmd+S anywhere in the editor) writes one change entry with the summary and minor flag, then returns to the page. Save stays disabled until the draft differs.
- Leaving with unsaved changes asks to confirm; closing the tab triggers the browser's leave warning.
- New pages open straight into the editor.

## Click-to-edit
- Renderer attaches `data-start` / `data-end` offsets from mdast positions to each top-level block, and returns the blocks as separate HTML strings so one can be swapped for an editor.
- Clicking a block opens a CodeMirror instance bound to that slice; a heading's slice is its own line. Clicks on links, buttons, or a text selection don't open it.
- Saving splices the slice into `body`, re-parses, re-renders, writes a change entry summarized as the section it sits in. If the slice changed underneath since opening, the save is refused.
- Directive blocks map to form components that serialize back to directive syntax.
- Canon blocks and inline marks carry their own offsets; promote and demote rewrite only the `tier` attribute.
- In split view, clicking a preview block moves the source cursor to its start.

## Editors
- One CodeMirror setup serves split view, inline blocks, and form text fields.
- `/` at the start of a line or after a space opens the slash menu; `[[` opens the page picker over `suggest`, with "Create page" inserting a red link.
- Pasting or dropping image files stores them as assets and inserts `![[path]]` embeds.

## Assets
- `AssetService` stores images: GIFs and SVGs as they are, everything else scaled to 2048 px on the long edge and encoded as WebP, unless the result is no smaller and needs no scaling.
- Paths are `assets/<name>-<hash>.<ext>`, so they never change once written; adding identical bytes returns the existing asset.
- Rendered images carry `data-asset`; the page view resolves them to object URLs through a cache keyed by wiki and path.

## Appearance
- `AppearanceService` keeps a wiki's appearance. Images are assets named `assets/appearance-<slot>-<hash>`, and font files `assets/fonts/<font>-<subset>-<weight>-<style>.woff2`; the wiki record points at them. Replacing or removing one deletes the old asset, unless it's a page's image that was reused. Export and import carry them with no change to the archive format.
- Images go through the same encoder as page images. Slots and their sizes: banner 1920 × 300, background 1920 × 1080, wordmark 500 × 130, icon 256 × 256.
- Fonts come from Fontsource: the font list from `api.fontsource.org/v1/fonts`, and the chosen font's `woff2` files from its CDN for weights 400 and 700, normal and italic where they exist, in the `latin` and `latin-ext` subsets with their unicode ranges. Characters outside those fall back to the system font. Fonts register through `FontFace` when the wiki opens.
- The layout sets `--accent`, `--accent-text` (black or white by contrast), the font stacks, and the image URLs as CSS variables on the wiki layout. Light and dark are two sets of theme variables under `[data-mode]` on the root, chosen from `prefers-color-scheme` until the toggle stores a choice in local storage.
- The Wiki Assets Pack is built in the browser: each placeholder is drawn on a canvas at its exact size as a labelled grid, zipped with a README. Importing a pack matches `banner`, `background`, `wordmark`, and `icon` by file name, ignoring case and extension.

## Change log
- Every save computes a unified diff of the page source, frontmatter included, against the prior source.
- A save by the same author within 10 minutes of the page's latest entry, when that entry is an edit, folds into it: the diff is recomputed from the entry's starting source, `at` moves to the save, `minor` holds only if both are minor, and the summaries join with "; ", each once. A session that ends where it began drops its entry. Creations, renames, deletions, and restores never merge, so nothing merges across them.
- Entries carry the page title at the time of the change, so the feed can show pages that no longer exist.
- Older versions are rebuilt backward from the current source by reversing diffs newest first, so pruning old entries never breaks newer ones. The diff view shows the stored patch with word-level highlights between paired removed and added lines.
- Restore saves a rebuilt version as a `restore` entry.
- Deleting a page keeps its history and records a deletion entry whose diff holds the final source. Restoring a deleted page recreates it under its old ID from any version, re-indexing its links. Creating a page whose title matches a deleted page's drops that history first; the creation form checks and warns. A page recreated from a red link starts a fresh history under a new ID.
- `historyDays` on the wiki sets automatic pruning; unset keeps everything. The first time a wiki opens in a session, and right after the setting is shortened (with a confirmation), entries older than the cutoff are deleted, except deletion entries and entries of pages whose frontmatter has `history: keep` (read from the final source for deleted pages). A deleted page whose earlier entries were pruned can still be restored as it was when deleted.

## Character cards
- `CardService` keeps one card per page in `cards`, keyed by page ID, so a rename keeps it. The card is V3 JSON; V1 and V2 cards are upgraded on upload, keeping the lorebook, extensions, and unknown fields. Copies of the fields beside `data`, which some apps write for V1 readers, are dropped.
- A PNG card's image is stored as an asset and the card's `avatar` names its path. Uploading a JSON card keeps the existing image.
- Card changes are change entries with `subject: "card"`, diffed as the card's JSON with its avatar path. They chain and merge apart from the page's text, and show in the page's history with their own restore.
- Deleting a page removes its card first and records it, so restoring the page brings the card back.
- Download writes a plain V3 card: a PNG with base64 `chara` (V2 fields) and `ccv3` text chunks, replacing any the image held, or JSON when there's no image. A WebP avatar is redrawn as PNG.
- An infobox `chat:` line sets the chat button's text. The button shows only when the page, or a version's main page, has a card, and defaults to "Chat with <name>". It opens a placeholder for now.
- Archives write each card to `cards/<page path>.json`, listed in `wiki.json` under `cards` with its page key and avatar.

## Categories
- `categories` in frontmatter; `categoryKeys` holds their normalized keys for the multi-entry index.
- Category names follow page title rules. A category exists while a page lists it.
- The category page shows each page's title; the Categories page counts pages per key and shows the most common spelling.

## Templates
- Bundled templates ship as markdown files in `src/templates/` with IDs like `bundled:character`; they never enter the database. User templates live in `templates` with their `wikiId`.
- A template is a page body with frontmatter. `description` and `optional` are template-only keys; every other key is copied to new pages, which also get `template: <name>` and `templateId`.
- `{{title}}` becomes the new page's title. Hints are HTML comments, kept in the source for editing and for the assistant.
- At creation, each `##` section and each top-level infobox or pressure block is a checkbox. Those named in `optional` (by heading, or `Infobox` / `Pressure profile`) start unchecked; unchecked parts are left out.
- "Save as template" copies the page's body and frontmatter, minus `title`, `aliases`, and `template`.
- "Section from template" lists every template's `##` sections and inserts one with its subsections.

## Subpages and tabs
- Subpages are found by title prefix on `[wikiId+titleKey]`, so they need no extra index.
- The tab bar belongs to the top page: Overview, Relationships when it has pairs, then its direct subpages, ordered by its `tabs` field and then alphabetically. Versions don't appear as tabs.
- On a subpage the `h1` shows the top page's title, and the tab for the page or its ancestor is selected. Deeper and missing subpages add a subtitle naming them ("History › Childhood").
- Page and edit routes take the title as path segments, so URLs read `/wiki/Mira/History`; an escaped `%2F` resolves the same.
- Renaming a page renames its subpages at every depth in one transaction; a clash anywhere refuses the whole rename. Deleting a page leaves its subpages.

## Relationships
- A page whose `between` names two pages is a relationship page. Versions take `between` from their main page.
- A template with a `between` key, like the bundled Relationship template's empty list, makes its creation card ask for the two pages and suggest "A & B" as the title until one is typed. `/new?template=<id>&with=<title>` opens it with the first page filled in.
- The Relationships tab lists, for each relationship page linking the character through `between`, the other character as an `h2`, the pair page's lead without its infobox, and a "Read more" link. Pairs sort by the other character's title.
- On a version, each pair uses its own version in that continuity when one exists.
- `get_relationships` returns the same list.

## Continuities
- Continuities live on the wiki record. Names follow page title rules without `/`, are unique case-insensitively, and can't be `Relationships`.
- Renaming a continuity renames its versions; one with versions can't be deleted until they're deleted or renamed.
- A version's own body holds its lead and the sections it overrides. Rendering merges it with the main page: a non-blank lead replaces the main lead (infobox included), and `##` sections match by heading key. Main sections keep their order, with version-only sections after the section they follow in the version. A matched section with no content hides it.
- The merge happens on source: lead and section texts are joined into one markdown document with a segment map, so the usual renderer, contents box, and heading ids apply. Blocks from the version map back to its own offsets for click-to-edit, canon promote and demote, and click-to-source; inherited blocks map to nothing and stay read-only. A lead holding only hints counts as empty.
- "Change for this version" appends the section's source to the version body, or puts the main lead after its frontmatter; "Hide in this version" appends an empty heading. The split view preview shows the merge too.
- Links rendered on a version prefer `<title>/<continuity>` when that page exists. Red links still test the plain title.
- The banner shows the continuity's description and the version's `changes`.
- The "Version in a continuity" card titles the page `<page>/<continuity>`, takes a top-level page, and writes only `changes`; a "New version" link beside a top-level page's title opens it as `/new?template=version&with=<title>`. New versions open in the page view, where sections can be changed one by one.
- A version's tab bar holds Overview and, when its main page has relationships, Relationships at `<page>/<continuity>/Relationships`. That tab lists the main page's relationships, linking each pair and other character to their version in the continuity when one exists, with the pair version's merged lead. Relationships are added from main canon, so it has no "Add relationship" button.
- Agent tools read a version as the merged page, with inherited sections marked as main canon.

## Archive
### Layout
```
wiki-name/
  wiki.json
  templates/*.md
  pages/**/*.md
  assets/**/*
  cards/**/*.json
  changes.json
```
- `wiki.json` holds the wiki's settings and continuities, plus what files can't: each page's title and template; each template's name; each asset's type, hash, size, and original. Page and template file names come from titles, made safe for file systems and numbered when two collide case-insensitively.
- Exporting all wikis puts one such folder per wiki in the ZIP.
- `changes.json` is optional and can be cut to entries newer than a chosen age. Entries name their page by an archive-local key, so deleted pages' histories survive.
- Original images go under `assets/originals/` when the wiki keeps them.
- One serializer serves ZIP export and later Dropbox sync.
- Zipping and unzipping run in one worker, with file buffers transferred rather than copied, so large wikis don't freeze the page.
- Import always creates a new wiki, adding " (2)" (or the next free number) to a taken name and "-2" to a taken slug. It accepts a ZIP of wiki folders or one with `wiki.json` at the top, checks every wiki in it before writing any, rebuilds IDs, keeps history as it was, and re-indexes links. It's offered in wiki settings and on the first-run screen.

### Obsidian import
- Reads `.md` files and images from a ZIP of the vault into a new wiki, named after the folder the ZIP wraps the vault in, or the ZIP itself. Dot folders such as `.obsidian` and other files are left out.
- Each folder on a note's path becomes a category. Titles are file names, with `[ ] | #` turned into dashes; notes that share a name get their folder in brackets ("Mira (Archive)"), the shallowest keeping the plain name. Links resolve the way Obsidian does (a path names one note; a bare name prefers the linking note's folder, then the shallowest match) and are rewritten, with the old text as the label when the title changed. Linked property values such as `categories: ["[[Movies]]"]` are unwrapped.
- Frontmatter `tags` and inline `#tags` are listed with counts; chosen tags become categories, nested ones joined with " › ", and leave `tags`. Unchosen tags stay as they were.
- Images are stored as assets first; `![[image]]` embeds and relative markdown images point at them. Wikilinks and callouts stay, and `\|` in tables is kept.
- `%% comments %%` become HTML comments, which never render.
- Notes in the templates folder named in `.obsidian/templates.json` become user templates; `{{date}}`-style placeholders in their frontmatter survive edits.
- Each page gets a creation entry "Imported from Obsidian". A Main Page is added when the vault has none, pointing at a Readme, Home, or Index note if there is one.
- Unknown syntax, such as block references, note embeds, and plugin blocks, passes through as text.
- If the import fails partway, the new wiki is deleted.

## LLM integration

### Client
- OpenAI-compatible `/chat/completions` with tool calling and streamed replies; requests go directly from the browser.
- One app-wide `ModelSettings` record, key included, stored unencrypted in IndexedDB.
- Providers (ADRs 0006 and 0009), each with a preset base URL and its own detection:

| Provider | Default base URL | Token counts | Context length | Tokenizer family |
|---|---|---|---|---|
| llama.cpp | `http://localhost:8080/v1` | `POST /tokenize` | `/props` | n/a |
| koboldcpp | `http://localhost:5001/v1` | `POST /api/extra/tokencount` | `/api/extra/true_max_context_length` | n/a |
| Ollama | `http://localhost:11434/v1` | tokenizer or estimate | `/api/ps`, after the probe | from model name |
| LM Studio | `http://localhost:1234/v1` | tokenizer or estimate | `/api/v0/models` `loaded_context_length`, after the probe | from model name |
| OpenRouter | `https://openrouter.ai/api/v1` | tokenizer or estimate | `/models` | `/models` architecture |
| NanoGPT | `https://nano-gpt.com/api/v1` | tokenizer or estimate | model list when offered | from model name |
| OpenAI-compatible | typed | tokenizer or estimate | typed | from model name |

- Local servers' extras live at the server root, found by dropping `/v1` from the base URL.
- Test connection lists models, reads the context length, and sends one tiny request offering a single tool. A tool call, native or written as text, marks `tools` true. Failures explain the likely cause: an unreachable server, a rejected key, or browser access (CORS) being blocked.

### Token counting
`TokenCounter` uses the first method available:
1. The server's tokenize endpoint, which is exact for the loaded model.
2. A downloaded tokenizer. A bundled catalog maps tokenizer families and model-name patterns to `tokenizer.json` URLs on ungated mirrors. Settings suggest the match for the current model, with a Download button. `tokenizer.json` and `tokenizer_config.json` go in the `tokenizers` table, never the codebase, and run through `@huggingface/tokenizers`, loaded on demand.
3. An estimate of 4 characters per token, corrected by the `usage` counts replies report. When estimating, the budget shrinks by 10%.

The prompt budget is `contextLength` minus `replyTokens`. Auto-context fills what the fixed parts of a request leave.

### Auto-context
Per-page settings live in frontmatter, written only when they differ from the defaults:
```yaml
auto-context:
  enabled: false
  triggers: [the Hollow Crown, Mira's blade]
  include: infobox
```
- `enabled` defaults to true. `triggers` adds words to the page's title and aliases. `include` is `lead` (the default, infobox included), `infobox`, or `full`.
- How far to follow links is one wiki-wide setting, `autoContextDepth` (default 1, 0 turns it off). There is no priority.

For each request:
1. `MentionFinder` scans the input (notes, rules, the current page) for titles, aliases, and triggers of enabled pages: case-insensitive whole words, longest match first.
2. Follow wikilinks from matched pages up to `autoContextDepth`.
3. Order direct matches before followed ones, then by mention count, and fill up to the budget.
4. Each page's chosen part goes in under a `# Title` line with its aliases, without frontmatter, hints, or Idea-tier text. Canon and Likely text is labeled with its tier: `[Likely] … [/Likely]` around blocks, `[Likely: …]` around phrases. Versions go in merged, with inherited parts marked "(From main canon)". Pages that don't fit are reported as left out.

### Tools
```ts
type WikiTool =
  | { name: "search_pages"; args: { query: string; limit?: number } }
  | { name: "read_page"; args: { title: string } }
  | { name: "read_section"; args: { title: string; heading: string } }
  | { name: "list_backlinks"; args: { title: string } }
  | { name: "get_relationships"; args: { title: string } }
  | { name: "get_canon"; args: { title: string; tier?: "canon" | "likely" | "idea" } }
  | { name: "read_card"; args: { title: string } };
```
- `read_card` returns a card's text fields without its lorebook or extensions. A version without a card reads its main page's. Runs on a page with a card get the same text in the prompt, under "The page's character card", as a reference the wiki overrides.
- All tools only read; `get_canon` is how Idea-tier text is reached. Pages read like auto-context, tiers labelled and Idea text left out, and search only matches and quotes what the model may see.
- Titles match aliases too, and a run in a continuity reads each page's version there when it has one.
- Long results are cut to fit what's left of the prompt budget.
- A section ends when a reply has no tool call: that reply is the proposal (ADR 0007). Sources are the pages auto-context and tools served.
- Models without tool support follow the same flow on auto-context alone.

### Run flow
`RunOrchestrator` drives every run; the model only answers narrow requests.
1. **Plan**: the template's `##` headings with their hints, with no model call. From the New page screen, the run keeps the page's starting text (the template with the chosen parts) and plans from its sections; the page is created from that text on the first accept. On a page, the form starts with the page's template. Fill template plans the page's sections that hold nothing but hints, an infobox, or a pressure profile. Draft from notes without a template asks for headings one per line, falling back to the Character template's after two failures.
2. **Sections**: each section is a fresh conversation:
   - Instructions, mode, the wiki's Assistant rules, and the run's one-off rules.
   - Auto-context, the notes, the page title, and the page as it stands when it exists.
   - The headings of sections already written, and the current section's hints.
   - On a retry, the last try and the author's note.
   - "Write the *Background* section."

   A short tool loop follows, then the plain-text reply. With tools on, auto-context takes at most 60% of what the fixed parts leave, so lookups have room; tool results are cut to the room left.
3. **Review**: proposals fill the review view as they arrive, each as a diff against the page's section of that heading. With "Approve each proposal" on (`input.stepwise`), the run waits for each proposal to be accepted, discarded, or sent back before writing the next. A retry asked for while the run is going is written after the current section.
4. **Commit**: accepted sections replace the content under the heading with the same key, hints included, keeping any infobox or pressure profile after the new text; other sections are added in plan order. A run is done once every section is accepted or discarded. A draft of a new page creates the page on its first accept. Each accepted batch is one change entry with `author: "llm"`, merged by the usual 10-minute rule.

Modes:
- **Strict**: gaps become `QUESTION:` lines, which the app turns into `> [!question]` callouts.
- **Guided**: a gap may be filled when a rule covers it.
- **Liberal**: invents freely, and each section is wrapped in `:::canon{tier=maybe}` as a whole.

Rules apply in every mode.

### Reply repair
`ReplyRepair` cleans every reply before review:
- It strips thinking tags, openers like "Here's the section:", an outer code fence, and a repeated heading.
- It splits off extra `##` sections, closes open `:::` blocks, and converts `QUESTION:` lines.
- It removes `[Canon]` and `[Likely]` labels the model copied from auto-context; the prompt also asks it not to.
- Wikilinks are checked against titles and aliases with fuzzy matching. Unknown ones are flagged in review, not removed.

| Failure | Response |
|---|---|
| Tool call written as text (JSON, a code fence, `<tool_call>` tags) | Parsed as a tool call |
| Malformed tool arguments | Repaired (trailing commas, quotes, raw newlines) |
| Unknown tool or page | An error result naming the closest matches |
| Repeated call | The earlier result, plus a nudge to write the section |
| Tool-call limit (8 per section) | One last request with tools turned off |
| Reply stuck repeating itself | Aborted, then retried once at a lower temperature |
| No text for a while | Aborted after a timeout and retried |
| Empty or unusable reply | Retried once with a note on what was wrong |
| Context overflow from the server | Auto-context halved and retried, up to twice |
| Server error | Retried once |
| Refused key, unreachable server, rejected request | The run stops with the error; written sections stay |

A section that still fails is marked `failed` with its raw reply kept, and the run moves on. Every repair is logged as a `repair` transcript entry.

### Guardrails
- A call repeating an earlier one (same tool, same arguments) counts as a repeat from its second occurrence and shows a ×N badge in the run panel.
- Interrupt aborts the in-flight request and pauses the run between steps; a typed message joins the next request. Continue picks up the unwritten sections, with an optional message.
- The run is saved after every step. After a reload, a running run becomes `interrupted`, and its unreviewed proposals stay reviewable. Review changes go through the orchestrator, so a run being written never overwrites them.
- The last 20 runs per wiki are kept.

### Suggest links
- `MentionFinder` finds unlinked mentions of titles and aliases in the page body. It skips code, existing links, headings, and the page's own names, and underlines the first mention of each page.
- Suggestions underline in the page view: the renderer marks their source ranges, inside plain text whose offsets are exact, and click-to-edit pauses until Done. Versions don't offer it, since they show their main page's text too.
- Accepting wraps the text in `[[…]]` as a minor human edit, keeping the words as written (`[[Mi]]`, or `[[Mira|her sister]]` when they aren't a name). Later suggestions shift by the added length, and one whose text changed is skipped.
- "Ask the Assistant for more" sends the page and the wiki's title list and asks for `phrase -> Title` lines. Lines whose phrase isn't in the text, or whose title doesn't exist, are dropped. The rest join the underlines, and accepting them is an Assistant edit. The request is kept as a `suggest-links` run with its `linkSuggestions`, and the title list is cut to 40% of the prompt budget.

## PWA
- App shell precached; offline by default.
- Install prompt after first wiki creation.
- `navigator.storage.persist()` requested on first save; settings show `navigator.storage.persisted()` with a button to ask again.

## Risks
| Risk | Mitigation |
|---|---|
| Browser evicts IndexedDB | Persistent storage request, export reminders |
| Click-to-edit offsets drift | Re-parse after every save, split view fallback |
| Local models handle tools poorly | App-driven runs, reply repair, tool call caps, auto-context-only mode |
| Context overflow on small models | Exact server counts, 10% margin when estimating, retry with less context |
| Large assets bloat storage | Size warnings, image compression on import |

## Future
- Dropbox sync on the archive layout, with OAuth PKCE from the browser (ADR 0010).
- Theme editor: full color sets, custom CSS, layout options.
- Director's Desk reading from auto-context and tools.
