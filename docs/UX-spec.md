# UX Spec: OC Wiki

## Principles
- Feels like a fandom wiki, works like a notebook.
- Progressive disclosure: simple surface, advanced options one click away.
- Plain language in the UI; technical terms live in docs and code.
- The human writes first; the LLM proposes, the human approves.

## Visual identity
- Classic fandom wiki: header with wiki name and search, page title, right-floating infobox, table of contents, sectioned body, categories at the bottom.
- Theme built on CSS variables; full customization ships post-MVP.

## Layout
- **Top bar**: wiki switcher, search, new page, run panel toggle, settings.
- **Left sidebar** (collapsible): pages by folder, recent changes, open questions.
- **Main**: rendered page.
- **Right drawer**: agent run panel.

## Editing

### Click-to-edit (default)
- Hover shows a subtle outline on each block.
- Clicking a paragraph, list, or heading section swaps it for an inline editor holding that block's markdown.
- Enter + Ctrl/Cmd or clicking outside saves; Esc cancels.
- Infobox, canon notes, and pressure profiles open form editors.

### Split view (fallback)
- Toggle in the page toolbar.
- Left: full markdown editor. Right: live render.
- Clicking rendered content jumps to the matching source line.

### Slash menu
Typing `/` in any editor offers:
- Infobox
- Canon note (Canon / Likely / Idea)
- Pressure profile
- Callout
- Image
- Link to page
- Section from template

### Links
- Typing `[[` opens a page picker with search, aliases, and "Create page".
- Missing pages render as red links; clicking one opens page creation with the title prefilled.

### Saving
- Each save creates a change log entry.
- A "Minor edit" checkbox sits beside the save action.

## Page creation
- Cards: Blank, Character, Location, Relationship, Spinoff, plus user templates.
- Spinoff card asks for the source page and the changed variables.

## Canon tiers
- Labels: **Canon**, **Likely**, **Idea**.
- Rendered as tagged blocks with distinct accents.
- One-click promote/demote on hover.
- LLM inventions land as **Idea** by default.

## Relationship pages
- One page per pair, linked from both characters.
- A relationships section on each character page lists them.

## Change log
- Feed of saves with author (you / assistant), page, summary, time.
- Filter: hide minor edits (default on), by page, by author.
- Actions: view diff, squash selected, prune older than…

## Open questions
- Board grouped by page.
- Template fields left empty in Strict mode become open questions.
- Resolving a question links to the edit that answered it.

## Interviews
- Section per character: question and answer pairs.
- "Promote to canon" moves an answer into a page section as an Idea or higher.

## LLM actions
Available from the page toolbar and the slash menu:
- **Draft from notes**: notes box, template picker, assumption mode.
- **Suggest links**: inline underlines; click to accept.
- **Fill template**: instructions box, assumption mode.

### Assumption modes
- **Strict**: uses only provided material; gaps become open questions.
- **Guided**: follows user rules ("assume X", "always Y").
- **Liberal**: invents freely; inventions tagged Idea.

### Review
- Proposals appear section by section in a diff view.
- Per section: Accept, Edit, Retry with note, Discard.
- Accept all at the end.

## Agent run panel
- **Simple view (default)**: one status line ("Reading Mira… Drafting Background"), section checklist with progress.
- **Details view**: full transcript of tool calls as collapsible cards with inputs and results.
- Repeated calls show a counter badge ("read_page Mira ×6").
- Interrupt button and a message box to redirect mid-run.
- Setting: approve each proposal, or auto-accept into the diff view.

## Settings
- **Model**: endpoint URL, API key, model name, token budget.
- **Wiki**: name, voice (fandom only in MVP), default template folder.
- **Auto-context** (advanced): per-page triggers, match mode, follow connections depth, priority, injected content.
- **Data**: export ZIP, import ZIP, import Obsidian vault.

## Terminology map
| UI label | Internal term |
|---|---|
| Auto-context | Lorebook |
| Triggers | Keys |
| Follow connections | Recursion |
| Canon / Likely / Idea | hard / soft / maybe |
| Assistant | Agent |
