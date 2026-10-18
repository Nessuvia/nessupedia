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
| Future backend | Rails (Dropbox OAuth, sharing) |

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
│                             └─ Agent                     │
│                                 ├─ AutoContext           │
│                                 ├─ Tools                 │
│                                 └─ LlmClient             │
│                         Dexie (IndexedDB)                │
└──────────────────────────────────────────────────────────┘
```

## Data model
```ts
interface Wiki {
  id: string;
  name: string;
  themeId: string;
  voice: "fandom" | "in-universe";
  keepOriginalImages?: boolean;
  continuities?: Continuity[];
  createdAt: number;
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
  autoContext?: AutoContextSettings;
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
  kind: "create" | "edit" | "rename" | "delete";
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
  pageId: string;
  kind: "draft" | "suggest-links" | "fill-template";
  status: "running" | "done" | "interrupted" | "error";
  transcript: TranscriptEntry[];
  startedAt: number;
}
```

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
```
Version 3 fills `categoryKeys` from each page's frontmatter.

### Page titles
Titles are trimmed, must not be blank, and must not contain `[`, `]`, `|`, or `#`, which wikilink syntax reserves. Creation and rename enforce this; a title can't match another page's title or alias.

A `/` makes a subpage: `Mira/History` belongs to `Mira`. Each segment is trimmed and must not be blank. `Relationships` is reserved as a last segment for the generated tab. A last segment that names a continuity makes the page a version (`Mira/Noir AU`), which needs its main page and can't have subpages.

### Storage model
Hybrid: records keyed by ID, each with a `path`. Markdown stores link titles; the `links` table resolves titles to IDs. Titles and aliases match case-insensitively through normalized keys (`titleKey`, `aliasKeys`, `targetKey`): trimmed, whitespace collapsed, lowercased. Renames update the title and path and rewrite inbound link text as minor edits; links by alias, and wikilink-like text in code or frontmatter, stay untouched. Renaming a page renames its subpages and versions with it. Export and import translate between IDs and paths.

Paths follow titles, with slashes as folders: `Mira/History` is stored at `pages/Mira/History.md`.

Frontmatter fields that name pages (`between`) are indexed in `links` with a `field` marker, so they resolve, show red, count in What links here, and are rewritten on rename like body links. Rewriting edits only that field's YAML.

## Markdown format
- The page title renders as the page's only `h1`; bodies start at `##`.
- YAML frontmatter: `title`, `aliases`, `categories`, `template`, `between` (relationship pages), `changes` (versions), `tabs` (tab order), custom fields. `categories`, `aliases`, and `changes` accept a single string or a list.
- Raw HTML never renders. An HTML comment standing as its own block (`<!-- hint -->`) renders as a hint block with its source range, hidden by CSS outside click-to-edit.
- `[[Title]]`, `[[Title|label]]`, `[[Title#Heading]]`.
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
| `/w/:wikiId` | Redirects to the wiki's Main Page |
| `/w/:wikiId/wiki/:title` | Page view |
| `/w/:wikiId/edit/:title` | Split view editor, loaded on demand; hides the right rail |
| `/w/:wikiId/new?title=` | Create a page, title prefilled from red links |
| `/w/:wikiId/special/search?q=` | Full-text results with snippets, plus "Create page" when no title or alias matches |
| `/w/:wikiId/special/settings` | Wiki settings: rename, delete with typed confirmation |
| `/w/:wikiId/special/all-pages` | All pages, grouped by first letter |
| `/w/:wikiId/special/recent-changes` | Recent changes feed |
| `/w/:wikiId/special/categories` | Every category with its page count |
| `/w/:wikiId/special/category/:name` | A category's pages, grouped by first letter |
| `/w/:wikiId/special/templates` | Bundled and user templates |
| `/w/:wikiId/special/templates/:templateId/edit` | Split view editor for a user template |
| `/w/:wikiId/special/continuity/:name` | A continuity's description and versions |

`/w/:wikiId/wiki/Mira/Relationships` and `/w/:wikiId/wiki/Mira/Noir AU/Relationships` render the generated Relationships tab; no page holds them.

Routes under `/w/:wikiId` render inside the wiki layout. A route can add right rail modules through a named `rail` view. History mode. The service worker serves the app shell for every navigation, so deep links work offline. Views read Dexie through `useLiveQuery`, so lists and pages update after any write.

## Page view
- Links render red when no page title or alias matches, case-insensitively; existence updates live. Red links open page creation with the title filled in, and a missing page offers "Create this page".
- Wikilink clicks route inside the app; modified clicks open new tabs as usual.
- A title that matches an alias redirects to the page's title and shows "(Redirected from …)"; a case-only mismatch corrects the URL silently.
- The lead (everything before the first `##`) renders above a numbered Contents box, shown at three or more h2 to h4 headings, with a remembered hide toggle.
- The right rail adds What links here; for a missing page it lists pages whose red links target that title.
- Categories show as an "in:" line above the title, in frontmatter order.
- Page actions beside the title: Edit, Details, Rename, Save as template, Delete. Details writes frontmatter through the `yaml` document API, so other keys, their order, and comments survive. Rename and Delete open dialogs that state their effects (how many pages' links get rewritten or turn red) before acting. Dialogs use the native `<dialog>` element.

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

## Change log
- Every save computes a unified diff against the prior body.
- Entries carry the page title at the time of the change, so the feed can show pages that no longer exist.
- Deleting a page drops its history except the creation entry, then records a deletion entry whose diff holds the final body. A page recreated from a red link starts a fresh history under a new ID.
- Squash merges selected entries into one diff.
- Prune deletes entries older than a cutoff.

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
  changes.json
```
- `wiki.json` holds the wiki's settings and continuities.
- One serializer serves ZIP export and later Dropbox sync.
- Import validates `wiki.json`, rebuilds IDs, re-indexes links.

### Obsidian import
- Reads `.md` files and attachments from a folder or ZIP.
- Converts `![[image]]` to asset paths; keeps wikilinks and callouts.
- Unknown syntax passes through untouched.

## LLM integration

### Client
- OpenAI-compatible `/chat/completions` with tool calling.
- Settings: base URL, key, model, token budget.
- Key stored in IndexedDB; requests go directly from the browser.

### Auto-context
```ts
interface AutoContextSettings {
  enabled: boolean;
  extraTriggers: string[];
  match: "any" | "all" | "not";
  followDepth: number;
  priority: number;
  inject: "full" | "summary" | "infobox" | { section: string };
}
```
1. Scan the input text and current page for triggers (titles, aliases, extra triggers).
2. Collect matched pages; follow connections up to `followDepth`.
3. Sort by priority, fill up to the token budget.
4. Inject as a system context block.

### Tools
```ts
type WikiTool =
  | { name: "search_pages"; args: { query: string; limit?: number } }
  | { name: "read_page"; args: { title: string } }
  | { name: "read_section"; args: { title: string; heading: string } }
  | { name: "list_backlinks"; args: { title: string } }
  | { name: "get_relationships"; args: { title: string } }
  | { name: "get_canon"; args: { title: string; tier?: "hard" | "soft" | "maybe" } }
  | { name: "list_open_questions"; args: { title?: string } }
  | { name: "propose_section"; args: { heading: string; markdown: string; sources: string[] } };
```
- `propose_section` is the single write path; output goes to the diff view.
- Models lacking tool support run in auto-context-only mode.

### Run flow
1. **Plan**: agent reads template and inputs, returns a section list.
2. **Sections**: each runs a short tool loop and ends with `propose_section`.
3. **Review**: diff view fills per section.
4. **Commit**: accepted sections write to the page with `author: "llm"`.

### Guardrails
- Max tool calls per section.
- Duplicate-call detection surfaces in the run panel.
- Interrupt aborts the in-flight request and pauses the run.
- Liberal mode wraps inventions in `:::canon{tier=maybe}`.

## PWA
- App shell precached; offline by default.
- Install prompt after first wiki creation.
- `navigator.storage.persist()` requested on first save.

## Risks
| Risk | Mitigation |
|---|---|
| Browser evicts IndexedDB | Persistent storage request, export reminders |
| Click-to-edit offsets drift | Re-parse after every save, split view fallback |
| Local models handle tools poorly | Auto-context-only mode, tool call caps |
| Large assets bloat storage | Size warnings, image compression on import |

## Future
- Dropbox sync on the archive layout, Rails for OAuth.
- Theme editor.
- Director's Desk reading from auto-context and tools.
