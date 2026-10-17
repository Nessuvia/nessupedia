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
Follows the Fandom page structure; colors, fonts, and background art arrive with the theme in M6.
- **Global bar** (thin, full width): wiki switcher, search, run panel toggle, settings.
- **Left rail** (icons with small labels): Home, All pages, Recent changes, New page, Settings. Hidden on narrow screens, where the wiki header's Explore menu covers navigation.
- **Wiki header**: wiki name, page count, Explore menu (Main Page, All pages, Recent changes).
- **Main**: page header (categories from the `categories` frontmatter field in M3, title, page actions), then the rendered page.
- **Right rail**: modules such as What links here and Recent changes, plus open questions later. Moves below the page on medium and narrow screens.
- **Right drawer**: agent run panel.

## Editing

### Click-to-edit (default)
- Hover shows a subtle outline on each block.
- Clicking a paragraph, list, callout, or code block swaps it for an inline editor holding that block's markdown. Clicking a heading edits just the heading line.
- Enter + Ctrl/Cmd or clicking outside saves; Esc cancels. A "Minor edit" checkbox sits beside Save.
- Infobox, canon notes, and pressure profiles open form editors.

### Split view (fallback)
- Toggle in the page toolbar.
- Left: full markdown editor. Right: live render.
- Clicking rendered content jumps to the matching source line.

### Slash menu
Typing `/` in any editor offers:
- Infobox
- Canon note (Canon / Likely / Idea), as a block or inline
- Pressure profile (hidden once the page has one)
- Callout
- Image
- Link to page
- Section from template (M3)

### Links
- Typing `[[` opens a page picker with search, aliases, and "Create page".
- Missing pages render as red links; clicking one opens page creation with the title prefilled.

### Infobox
- Fandom style: a title, images with captions, and labeled groups ("Biographical", "Physical") of label / value rows.
- Tabs ("Young / Adult") each hold their own images and groups; rows outside any tab show under every tab.
- Several images in one tab switch with small tabs named by their captions.

### Pressure profile
- One per page.
- Starts with six fields: Triggers, Coping, Contradictions, Breaking point, How others read it, Aftermath. Fields can be renamed, removed, or added.

### Callouts
- Every Obsidian callout type and alias, with its own color and icon. `[!note]-` starts folded, `[!note]+` starts open.

### Images
- Paste or drop images into any editor, or pick one from the slash menu or the infobox form.
- Images are scaled to at most 2048 px on the long edge and stored as WebP. GIFs and SVGs are kept as they are.
- "Keep original images" in wiki settings stores the untouched file alongside.
- The same image added twice is stored once.

### Saving
- Each save creates a change log entry.
- A "Minor edit" checkbox sits beside the save action.

## Page creation
- Cards: Blank, Character, Location, Relationship, Spinoff, plus user templates.
- Spinoff card asks for the source page and the changed variables.

## Canon tiers
- Labels: **Canon**, **Likely**, **Idea**.
- Rendered as tagged blocks with distinct accents, or inline around a sentence or phrase inside other text.
- One-click promote/demote on hover, for blocks and inline marks alike.
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
- **Wiki**: name, voice (fandom only in MVP), default template folder, keep original images. Deleting a wiki requires typing its name.
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
