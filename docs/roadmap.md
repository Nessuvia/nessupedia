# Roadmap: OC Wiki

## M0: Foundation (done)
- Vue + Vite + TS scaffold, PWA plugin
- Dexie schema and services skeleton
- Markdown pipeline with wikilinks and frontmatter

## M1: Wiki core (done)
- Wiki create / switch / rename / delete
- Page create, render, split view
- Link index, red links, backlinks
- Search

## M2: Editing experience (done)
- Click-to-edit blocks
- Slash menu
- `[[` page picker in every editor
- Infobox, canon, pressure directives with form editors
- Callouts, images as assets

## M3: Structure (done)
- Categories: `categories` frontmatter field, "in:" line above the page title, category listing pages, and a Details dialog for aliases and categories
- Templates: bundled and user-made, section checkboxes at creation, and the slash menu's "Section from template"
- Subpages shown as a tab bar
- Relationship pages and a generated Relationships tab
- Continuities: wiki-wide alternate universes with page versions that inherit section by section

## M4: History and data (done)
- Persistent storage request and status
- ZIP export / import of one wiki or all, with optional history
- Change log: page history with diffs, restore (deleted pages too), merged edit sessions, automatic prune
- Obsidian vault import from a ZIP, with folders and chosen tags as categories

## M5: LLM (done)
- Model settings, client, Test connection, and token counting (server, downloaded tokenizer, estimate)
- Auto-context: frontmatter settings, mention finder, follow connections
- Agent tools, run orchestrator, and reply repair
- Review view and Draft from notes, from a page or the New page screen
- Fill template
- Suggest links: local matches, then "Ask the Assistant for more"
- Run panel: simple and details views, growing alongside the steps above

## M6: MVP polish (done)
- Fandom wiki theme with light and dark modes
- Wiki appearance: accent color, Fontsource fonts, banner / background / wordmark / icon images, and the Wiki Assets Pack (ADR 0008)
- Install prompt
- Export reminders

## Post-MVP
1. Dropbox sync, with OAuth PKCE from the browser and one file per item (ADR 0010, ADR 0013)
2. Character cards (V2 and V3): attach a card to a page, edit it with its own history, download it as stored, list cards and images in Wiki Documents, and an infobox chat button that's a placeholder for now (ADR 0011) (done)
3. Theme editor: full color sets, custom CSS, layout options
4. Director's Desk
5. In-universe voice
6. Character messaging app, with in-character interviews
7. OC social media spinoff
8. Open questions board
