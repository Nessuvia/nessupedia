# Roadmap: OC Wiki

## M0: Foundation
- Vue + Vite + TS scaffold, PWA plugin
- Dexie schema and services skeleton
- Markdown pipeline with wikilinks and frontmatter

## M1: Wiki core
- Wiki create / switch / rename / delete
- Page create, render, split view
- Link index, red links, backlinks
- Search

## M2: Editing experience
- Click-to-edit blocks
- Slash menu
- `[[` page picker in every editor
- Infobox, canon, pressure directives with form editors
- Callouts, images as assets

## M3: Structure
- Categories: `categories` frontmatter field, "in:" line above the page title, category listing pages, and a Details dialog for aliases and categories
- Templates: bundled and user-made, section checkboxes at creation, and the slash menu's "Section from template"
- Subpages shown as a tab bar
- Relationship pages and a generated Relationships tab
- Continuities: wiki-wide alternate universes with page versions that inherit section by section

## M4: History and data
- Persistent storage request and status
- ZIP export / import of one wiki or all, with optional history
- Change log: page history with diffs, restore (deleted pages too), merged edit sessions, automatic prune
- Obsidian vault import from a ZIP, with folders and chosen tags as categories

## M5: LLM
- Endpoint settings and client
- Auto-context engine
- Agent tools and run loop
- Draft from notes, suggest links, fill template
- Run panel: simple and details views

## M6: MVP polish
- Fandom wiki theme
- Install prompt
- One month of personal use

## Post-MVP
1. Dropbox sync (Rails for OAuth)
2. Theme customization
3. Director's Desk
4. In-universe voice
5. Character messaging app, with in-character interviews
6. OC social media spinoff
7. Open questions board
