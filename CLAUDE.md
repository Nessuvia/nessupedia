# OC Wiki (nessupedia)

A fandom-style wiki for original character (OC) universes. Writers keep canon, histories, relationships, and spinoffs in one place, and an LLM agent reads the wiki to draft and fill gaps on request. Authoring is human-first: the LLM proposes section by section, the human approves. Everything lives on the user's device as markdown.

MVP is a client-only installable PWA for a single user. Data sits in IndexedDB through Dexie. LLM calls go from the browser to a user-supplied OpenAI-compatible endpoint. Dropbox sync, sharing, and a Rails backend come after MVP.

## Docs

The docs define the project. Read the relevant one before starting a feature.

- `docs/PRD.md`: problem, scope, out of scope, success criteria
- `docs/UX-spec.md`: layout, editing, canon tiers, agent run panel, terminology map
- `docs/design-doc.md`: architecture, data model, Dexie schema, markdown format, agent tools
- `docs/roadmap.md`: milestones M0 to M6, then post-MVP
- `docs/adr/`: decision records (client-only PWA, Vue stack, hybrid storage, markdown pipeline, agent with auto-context)

## Stack

Vue 3, Vite, TypeScript, Pinia, Dexie, unified/remark/rehype, CodeMirror 6, vite-plugin-pwa, fflate. Tests run on Vitest with jsdom and fake-indexeddb.

## Commands

- `npm run dev`: dev server
- `npm run build`: typecheck and production build
- `npm run typecheck`: vue-tsc only
- `npm test`: Vitest once
- `node .claude/skills/browse/browse.mjs`: view and drive the app in headless Firefox; see the `browse` skill

## Layout

- `src/db/`: data model types and the Dexie schema
- `src/markdown/`: parse and render pipeline, wikilinks, frontmatter, directives (canon, infobox, pressure), callouts, image embeds, field line grammar
- `src/services/`: PageService, LinkIndexer, ChangeLog, SearchService, CategoryService, TemplateService, WikiService, AssetService (with a worker that encodes images); `index.ts` wires singletons to the app database
- `src/editor/`: CodeMirror extensions shared by every editor
- `src/templates/`: bundled page templates as markdown files
- `src/router/`: routes and the home redirect
- `src/stores/`: Pinia stores (current wiki, wiki creation)
- `src/composables/`: `useLiveQuery` (Dexie live queries as refs), `useStoredRef`, `useDismiss` (close popups), `useLeaveGuard` (unsaved changes), `useTemplateNameCheck`
- `src/views/`: route components; `src/components/`: shared UI
- `src/utils/`: small pure helpers
- `src/styles/`: theme CSS variables
- `tests/`: Vitest suites

## Conventions

- Services take the database in their constructor; tests build a fresh `WikiDatabase` per case.
- `parseMarkdown` returns the mdast tree for reuse in link indexing, auto-context, and click-to-edit offsets. `renderMarkdown` takes that tree and returns the HTML plus its h2 to h4 headings for the table of contents.
- Pages are keyed by ID with a `path` for export. Markdown stores link titles; the `links` table resolves them to IDs.
- UI copy uses plain labels (Auto-context, Canon / Likely / Idea, Assistant). Code uses internal terms (lorebook, hard / soft / maybe, agent). See the terminology map in the UX spec.
- Write readable code with no line-by-line comments. A short comment above a block that does something non-obvious is fine.

## Branches and commits

### Branches
- Never commit directly to `master`.
- Each milestone gets one branch cut from `master`, named `m<N>-<slug>` (for example `m1-wiki-core`). Post-MVP work uses a short descriptive slug.
- Merge into `master` when the milestone is done, meaning the next step belongs to a new milestone. Then cut the next milestone's branch from the updated `master`.

### Commits
- One sentence per message.
- One feature per commit; a feature that touches many files stays in one commit, and separate features go in separate commits.
- No attribution to Claude or Anthropic.
