# UX Spec: OC Wiki

## Principles
- Feels like a fandom wiki, works like a notebook.
- Progressive disclosure: simple surface, advanced options one click away.
- Plain language in the UI; technical terms live in docs and code.
- The human writes first; the LLM proposes, the human approves.

## Visual identity
- Classic fandom wiki: header with wiki name and search, categories above the page title, tabs for subpages, right-floating infobox, table of contents, sectioned body.
- Theme built on CSS variables; full customization ships post-MVP.

## Layout
Follows the Fandom page structure; colors, fonts, and background art arrive with the theme in M6.
- **Global bar** (thin, full width): wiki switcher, search, run panel toggle, settings.
- **Left rail** (icons with small labels): Home, All pages, Recent changes, Open questions, New page, Settings. Hidden on narrow screens, where the wiki header's Explore menu covers navigation.
- **Wiki header**: wiki name, page count, Explore menu (Main Page, All pages, Categories, Recent changes, Open questions, Templates).
- **Main**: page header ("in:" line of categories, title, version switcher, page actions), the tab bar when the page has tabs, then the rendered page.
- **Right rail**: modules such as What links here and Recent changes. Moves below the page on medium and narrow screens.
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
- Section from template ("Character › Appearance"), which inserts that section's heading and starter content

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

### Page details
- A "Details" page action opens one form: aliases and categories, plus the pair on relationship pages and the changed variables on versions.
- Category fields suggest existing categories.

## Page creation
- Cards: Blank, Character, Location, Relationship, Version in a continuity, plus user templates.
- A template card lists the template's sections and blocks (infobox, pressure profile) as checkboxes, checked unless the template marks them optional.
- The Relationship card asks for the two characters and suggests the title "Mira & Theo".
- The Version card asks for the page, the continuity, and the changed variables.

## Templates
- Bundled: Character, Location, Relationship. They can't be edited; "Duplicate" makes an editable copy.
- "Save as template" in the page actions turns a page into a user template.
- The Templates page lists bundled and user templates; user templates can be renamed, edited in the split view editor, and deleted.
- Hints such as "What do they look like?" show in the editor and stay hidden on the page.

## Categories
- Pages list categories in the Details dialog; they show as an "in:" line above the title, each linking to its category page.
- A category page lists its pages grouped by first letter. The Categories page lists every category with its page count.
- Category pages are generated and have no text of their own.

## Tabs
- A page titled with a slash, such as "Mira/History", is a subpage of "Mira".
- A page with subpages, relationships, or versions shows a tab bar under its title: Overview, Relationships, then its subpages. The same bar shows on each of its tabs.
- Deeper subpages ("Mira/History/Childhood") show the bar of their top page with their parent's tab selected.

## Canon tiers
- Labels: **Canon**, **Likely**, **Idea**.
- Rendered as tagged blocks with distinct accents, or inline around a sentence or phrase inside other text.
- One-click promote/demote on hover, for blocks and inline marks alike.
- LLM inventions land as **Idea** by default.

## Relationship pages
- One page per pair, titled "Mira & Theo" by default, naming both characters in its details.
- Each character gets a generated Relationships tab with a section per pair: the other character's name, the pair page's lead, and a "Read more" link.
- An "Add relationship" button on the tab opens the Relationship card with this character filled in.

## Continuities
- Wiki settings list continuities (such as "Noir AU"), each with a name and a description of what changes across it.
- A page's version in a continuity is titled "Mira/Noir AU". Versions need their main page.
- A version switcher beside the title ("Main canon ▾") lists the page's versions and swaps the whole page and its tabs. A version has only Overview and Relationships tabs.
- A banner on a version names the continuity, its description, and the version's own changed variables.
- A version shows its own lead and sections; any lead or `##` section it lacks shows from the main page, live, labelled "From main canon", with a "Change for this version" button that copies it in for editing. An emptied section hides that section in the version.
- Links stay in the continuity: from Noir Mira, a link to Theo opens Noir Theo when it exists, otherwise Theo.
- The version's Relationships tab uses each pair page's version in the same continuity when there is one.
- Each continuity has a page listing its versions.

## Change log
- Feed of saves with author (you / assistant), page, summary, time.
- Filter: hide minor edits (default on), by page, by author.
- Actions: view diff, squash selected, prune older than…

## Open questions
- Written as question callouts (`> [!question]`) anywhere in a page; the page itself adds nothing else.
- The Open questions board lists open questions grouped by page, each linking to its section.
- Removing a question, by deleting it or turning it into an answer, resolves it. The board's "Recently resolved" list links each one to the edit that removed it.
- Template fields left empty in Strict mode become open questions.

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
- **Wiki**: name, voice (fandom only in MVP), keep original images, continuities. Deleting a wiki requires typing its name.
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
