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
  createdAt: number;
}

interface Page {
  id: string;
  wikiId: string;
  title: string;
  titleKey: string;
  aliases: string[];
  aliasKeys: string[];
  path: string;
  templateId?: string;
  spinoffOf?: string;
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
```

### Page titles
Titles are trimmed, must not be blank, and must not contain `[`, `]`, `|`, or `#`, which wikilink syntax reserves. Creation and rename enforce this; a title can't match another page's title or alias.

### Storage model
Hybrid: records keyed by ID, each with a `path`. Markdown stores link titles; the `links` table resolves titles to IDs. Titles and aliases match case-insensitively through normalized keys (`titleKey`, `aliasKeys`, `targetKey`): trimmed, whitespace collapsed, lowercased. Renames update the title and path and rewrite inbound link text as minor edits; links by alias, and wikilink-like text in code or frontmatter, stay untouched. Export and import translate between IDs and paths.

## Markdown format
- The page title renders as the page's only `h1`; bodies start at `##`.
- YAML frontmatter: `title`, `aliases`, `categories` (M3), `template`, `spinoffOf`, `changes`, custom fields.
- `[[Title]]`, `[[Title|label]]`, `[[Title#Heading]]`.
- Obsidian callouts: `> [!note]`.
- Directives:
  - `:::infobox` with key/value lines and an `image` field.
  - `:::canon{tier=hard|soft|maybe}`
  - `:::pressure` with fields: triggers, coping, contradictions, breaking point, how others read it, aftermath.
- Images: `![[assets/path.png]]`.

### Pipeline
```
markdown
 → remark-parse
 → remark-frontmatter
 → remark-directive + custom handlers
 → remark-wikilinks (custom)
 → remark-callouts
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
| `/w/:wikiId/new?title=` | Create a page, title prefilled from red links |
| `/w/:wikiId/special/all-pages` | All pages, grouped by first letter |
| `/w/:wikiId/special/recent-changes` | Recent changes feed |

Routes under `/w/:wikiId` render inside the wiki layout. A route can add right rail modules through a named `rail` view. History mode. The service worker serves the app shell for every navigation, so deep links work offline. Views read Dexie through `useLiveQuery`, so lists and pages update after any write.

## Page view
- Links render red when no page title or alias matches, case-insensitively; existence updates live. Red links open page creation with the title filled in, and a missing page offers "Create this page".
- Wikilink clicks route inside the app; modified clicks open new tabs as usual.
- A title that matches an alias redirects to the page's title and shows "(Redirected from …)"; a case-only mismatch corrects the URL silently.
- The lead (everything before the first `##`) renders above a numbered Contents box, shown at three or more h2 to h4 headings, with a remembered hide toggle.
- The right rail adds What links here; for a missing page it lists pages whose red links target that title.

## Search
- `suggest` matches titles and aliases for type-ahead and the page picker.
- `search` adds full text over each page's plain text (frontmatter excluded, wikilinks read as their labels).
- Ranking: exact, prefix, word prefix, then substring; titles beat aliases at the same tier; any name match beats body matches, which need every term and rank by occurrence count.
- In-memory scan with plain text cached per page until its body changes.

## Click-to-edit
- Renderer attaches `data-start` / `data-end` offsets from mdast positions to each top-level block.
- Clicking a block opens a CodeMirror instance bound to that slice.
- Saving splices the slice into `body`, re-parses, re-renders, writes a change entry.
- Directive blocks map to form components that serialize back to directive syntax.

## Change log
- Every save computes a unified diff against the prior body.
- Entries carry the page title at the time of the change, so the feed can show pages that no longer exist.
- Deleting a page drops its history except the creation entry, then records a deletion entry whose diff holds the final body. A page recreated from a red link starts a fresh history under a new ID.
- Squash merges selected entries into one diff.
- Prune deletes entries older than a cutoff.

## Spinoffs
- `spinoffOf` points at the source page.
- Frontmatter `changes` lists altered variables.
- Render shows a banner linking to the source page and listing changes.
- Agent tools expose the source page alongside the spinoff.

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
