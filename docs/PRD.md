# PRD: OC Wiki (working title)

## Problem
Writers with original characters (OCs) keep canon scattered across notes, headcanons, and chat logs. LLM roleplay tools center 1-on-1 chat and push writers to fit their process into that shape. Writers who think in scenes, histories, and relationships lack a home for canon that an LLM can read and help grow.

## Target users
- Primary (MVP): the author. Single user, one or more OC universes.
- Later: friends and hobbyist writers who build OC universes, often with genre spinoffs and self-inserts.

## Goals
- Give OC universes a fandom-style wiki that feels familiar and friendly.
- Keep authoring human-first; the LLM drafts, suggests, and fills gaps on request.
- Store everything locally, portable as plain markdown.
- Serve as the canon source for later modules (Director's Desk, character messaging, OC social media).

## MVP scope

### Wikis
- Create, rename, delete, switch wikis.
- Universe-agnostic; no assumptions about genre or setting.
- Voice setting: fandom (default). In-universe voice reserved for later.

### Pages
- Create pages from templates or blank.
- Click-to-edit rendered view; split markdown view as a fallback.
- `[[Wikilinks]]` with page picker, red links for missing pages, backlinks.
- Infobox, canon tiers (Canon / Likely / Idea), pressure profile, callouts.
- Images stored as wiki assets.
- Subpages shown as tabs; categories with listing pages.
- Relationship pages, one per pair, gathered into a Relationships tab on each character.

### Templates
- Bundled: character, location, relationship.
- User-created templates per wiki.

### Continuities
- Wiki-wide continuities hold spinoffs and alternate universes.
- A page's version in a continuity inherits the main page section by section and records the changed variables.

### Change log
- Entry on every save; quick successive saves to a page merge into one entry.
- Minor-edit flag hides entries from the default feed.
- Page history with diffs; restore any earlier version, including of deleted pages.
- Old history pruned automatically, unless a page opts out.

### Backup
- ZIP export and import of one wiki or all wikis, with history optional.
- Obsidian vault import from a ZIP (Obsidian-inspired format, non-strict compatibility).
- Persistent storage requested from the browser, with its status in settings.

### LLM features
- Bring-your-own endpoint and key: llama.cpp, koboldcpp, OpenRouter, NanoGPT, or any OpenAI-compatible server.
- Auto-context: lorebook-style triggers from page titles and aliases.
- Agent with read tools; its only output is section proposals for review.
- Built for small local models: the app drives each run and repairs broken replies.
- Draft a page from notes, including a page that doesn't exist yet.
- Suggest links, found without a model first.
- Fill a template with assumption modes: Strict, Guided, Liberal, plus saved Assistant rules per wiki.
- Run panel with simple status and an optional detailed transcript.

### Platform
- Web app, installable PWA, works offline.

## Out of scope (MVP)
- Sharing wiki content with other users.
- Accounts and server storage.
- Dropbox sync (first post-MVP item).
- Full theme customization.
- In-universe voice mode.
- Director's Desk roleplay module.
- Character messaging app, OC social media.
- Open questions board.
- Ollama and LM Studio as supported providers.

## User stories
- As a writer, I jot a few lines about a character and get a full draft page to review section by section.
- As a writer, I mark a detail as Idea and promote it to Canon later.
- As a writer, I record how a character reacts under pressure and find it in one place.
- As a writer, I create a spinoff where one thing changes and everything else carries over.
- As a writer, I see which pages mention a character and jump between them.
- As a writer, I export my wiki as a ZIP and restore it on another device.
- As a writer, I watch the agent work and spot when it loops on the same page.

## Success criteria (MVP)
- The author uses it as the main home for OC canon for one month.
- A character page goes from rough notes to approved draft in under ten minutes.
- ZIP export and re-import round-trips with zero content loss.

## Future modules
1. Dropbox sync
2. Character cards (V2 and V3) import and export
3. Theme customization
4. Director's Desk (scene cards, prose, notes-driven revision, self-insert seat)
5. In-universe wiki voice
6. Character messaging app, with in-character interviews
7. OC social media spinoff
