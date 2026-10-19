# UX Spec: OC Wiki

## Principles
- Feels like a fandom wiki, works like a notebook.
- Progressive disclosure: simple surface, advanced options one click away.
- Plain language in the UI; technical terms live in docs and code.
- The human writes first; the LLM proposes, the human approves.

## Visual identity
- Classic fandom wiki: header with wiki name and search, categories above the page title, tabs for subpages, right-floating infobox, table of contents, sectioned body.
- Clean yet fun, with generous spacing, in the spirit of the Houseki no Kuni and RWBY wikis.
- One built-in theme on CSS variables, in nessuvia's reds, pinks, black and white, with light and dark modes. Each wiki sets its own appearance (see Settings); the theme editor ships post-MVP.
- Light or dark follows the system until the toggle in the wiki header is used, then sticks on that device.

## Layout
Follows the Fandom page structure.
- **Global bar** (thin, full width, dark in both modes): wiki switcher, search, run panel toggle, settings.
- **Background**: the wiki's background image, fixed in place while the page scrolls. Without one, the page color tinted by the accent.
- **Left rail** (icons with small labels): Home, All pages, Recent changes, New page, Settings. Hidden on narrow screens, where the wiki header's Explore menu covers navigation.
- **Wiki header**: a band showing the wiki's banner image (or an accent gradient), with the wordmark or the icon and wiki name, page count, Explore menu (Main Page, All pages, Categories, Recent changes, Templates), and the light / dark toggle.
- **Content card**: one rounded card under the header holding the main column and the right rail.
- **Main**: page header ("in:" line of categories, title, version switcher, page actions), the tab bar when the page has tabs, then the rendered page.
- **Right rail**: modules such as What links here and Recent changes, with headers in the accent color. Moves below the page on medium and narrow screens.
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

- A "Chat button" field sets the text of the button shown under the infobox when the page has a character card ("Chat with Damien!"). Without it the button reads "Chat with <name>". For now it opens "Coming soon…".

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
- A "Details" page action opens one form: aliases and categories, plus the pair on relationship pages and the changed variables on versions, and a "Keep all history" checkbox.
- An "Auto-context" group in Details (folded by default) holds an on/off switch, extra trigger words, and what to include: Lead (default), Infobox only, or Full page.
- Category fields suggest existing categories.

## Page creation
- Cards: Blank, Character, Location, Relationship, Version in a continuity, plus user templates.
- A template card lists the template's sections and blocks (infobox, pressure profile) as checkboxes, checked unless the template marks them optional.
- The Relationship card asks for the two characters and suggests the title "Mira & Theo".
- The Version card asks for the page, the continuity, and the changed variables.
- "Draft from notes" beside the template choice opens a notes box, an assumption mode, and a one-off rules box. Starting it opens the review; the page is created only when its first section is accepted, so discarding everything leaves nothing behind.

## Templates
- Bundled: Character, Location, Relationship. They can't be edited; "Duplicate" makes an editable copy.
- "Save as template" in the page actions turns a page into a user template.
- The Templates page lists bundled and user templates; user templates can be renamed, edited in the split view editor, and deleted.
- Hints such as "What do they look like?" show as faint placeholders in click-to-edit. Clicking one opens an empty editor with the hint as its placeholder; what you write replaces the hint, and saving nothing keeps it. Previews and exports never show them.

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
- A version shows its own lead and sections; any lead or `##` section it lacks shows from the main page, live, labelled "From main canon", with a "Change for this version" button that copies it in for editing and a "Hide in this version" button. Hidden sections are listed at the bottom in click-to-edit, each with "Show".
- Versions list only the categories they set themselves; the continuity page groups them.
- Deleting a main page leaves its versions, which then show only their own text with a notice; recreating the page reconnects them.
- Links stay in the continuity: from Noir Mira, a link to Theo opens Noir Theo when it exists, otherwise Theo.
- The version's Relationships tab uses each pair page's version in the same continuity when there is one.
- Each continuity has a page listing its versions.

## Change log
- Feed of saves with author (you / Assistant), page, summary, time.
- Filter: hide minor edits (default on), by page, by author.
- Saves to the same page by the same author within 10 minutes merge into one entry, so a burst of fixes reads as one change.
- Each entry opens its diff: the markdown source, with changed words highlighted inside changed lines.
- A "History" page action lists the page's entries, each with its diff and "Restore this version", which saves the old text as a new change.
- A deleted page's entry in the feed opens its history, where any version can be restored. Creating a new page with the same title removes that history, and the creation screen says so before creating.
- Wiki settings choose how long history is kept: Forever (default), 1 year, 90 days, or 30 days. "Keep all history" in a page's Details exempts that page.

## Character cards
- A "Card" page action opens the page's card. A page without one offers "Add a card" (.png or .json, V2 or V3) and "Start a blank card".
- The card screen has Back, a Saved / Unsaved status, Save, Download, Replace, and Remove, then the image and name, then collapsible sections in two columns: Identity, Openings, and Lorebook on the left; Image, Prompt, and Metadata on the right. One column on narrow screens.
- The lorebook shows its name and entry count only. It keeps the chat-app name "Lorebook", apart from Auto-context.
- Card changes show in the page's History marked "card", with "Restore this card".
- Wiki Documents, in the left rail, lists every card and page image, with All / Cards / Images filters. Cards link to their card screen and page; images list the pages that use them. Both download.

## Export and import
- **Export ZIP**: this wiki, or all wikis when more than one exists. "Include history" is checked by default, with a slider for how far back: 7 days, 30 days, 90 days, 1 year, All (default). Original images go in when "Keep original images" is on.
- **Import ZIP** creates a new wiki; a name that's taken gets " (2)".
- **Import Obsidian vault** takes a ZIP of the vault and creates a new wiki.
  - Folders become categories. Notes that share a name get their folder added ("Mira (Archive)"), and links to them are rewritten.
  - A list of the vault's tags with counts lets you choose which become categories; the rest stay as they were.
  - Block references, note embeds, and plugin syntax stay as plain text.
- The browser is asked to keep the wiki's storage on first save. Settings show whether it agreed, with a button to ask again.

## Dropbox sync
For the same wikis on several devices, used one at a time. The page is the unit: a page changed on one device since the last sync just moves; a page changed on both is a clash, and you choose.

### Connecting
- **Settings > Dropbox** (app-wide): Connect opens Dropbox's sign-in in a popup. Once connected it shows "Connected as <email>", Disconnect, and the device name ("Firefox on Windows" by default, editable).
- A note says files are kept in `Apps/nessupedia/` in your Dropbox and the app can't see the rest of it.
- **In Dropbox, not on this device**: wikis found in the folder, each with Download. Download brings the whole wiki, under the same ID, with sync on in Auto.
- Disconnect stops sync for every wiki and leaves the Dropbox copies.

### Per wiki
- **Wiki settings > Sync**: "Sync this wiki to Dropbox" (off by default), then the mode:
  - **Auto** (default): sends on every save; receives when the app opens, when the tab regains focus, and when back online.
  - **Manual**: "Only recommended for advanced users. Nothing is sent or received until you press Sync now."
- Sync now, "Last synced <time>", and Sync details.
- Turning sync off leaves the Dropbox copy. "Delete from Dropbox" is its own button and asks first.
- Deleting a wiki offers "Also delete it from Dropbox", unchecked.
- A wiki on Auto doesn't get the export reminder: Dropbox is its backup.

### Sync badge
- Shown beside the wiki name in the global bar and on every wiki in the wiki switcher, so a wiki that isn't synced never looks like one that is.
- States: Synced, Syncing, Not synced to Dropbox (sync off), N changes not sent (Manual), Offline, last synced 3 h ago, Not synced, retrying, Reconnect Dropbox, Needs a choice.
- Clicking it opens a small popover with the line, Sync now, and Sync details.

### Clashes
- One dialog per wiki lists every clash. Nothing is received or sent for that wiki until each one is decided.
- Each row: the page (or template, card, image, wiki settings), and for each side the device and save time. Expanding a row shows a word diff for text, the two images side by side, or the changed fields for settings.
- Per row: **Keep our version** / **Use the synced version**. "Keep ours for all" and "Use synced for all" sit above the list. Apply is enabled once every row is decided.
- Deleted on one side: "Deleted on <device>, <date>" in place of the diff.
- A file changed outside the app is labelled "Changed outside the app". One that can't be read only offers Keep our version.
- **Decide later** closes the dialog. The wiki keeps working on this device, its badge reads Needs a choice, and the dialog comes back on the next sync.
- A page open in the editor isn't replaced by an incoming version. The editor shows "Changed on <device>. Reload / Keep editing"; saving after Keep editing opens the same choice for that one page.

### Sync details
- The recent syncs on this device, newest first: time, items sent, items received, and each clash with what was chosen. A row expands to list the items.
- Failures show the step that failed and Dropbox's reason.

## LLM actions
A run is one use of an Assistant action, from Start until its review is finished. Actions are available from the page toolbar and the slash menu:
- **Draft from notes**: notes box, template picker, assumption mode, one-off rules. Also offered on the New page screen.
- **Suggest links**: underlines exact mentions of page titles and aliases at once, with no model needed; click one to accept, or Accept all. "Ask the Assistant for more" adds indirect mentions found by the model.
- **Fill template**: fills the page's empty sections. It has an instructions box, an assumption mode, and one-off rules.

### Assumption modes
- **Strict**: uses only provided material; gaps become question callouts (`> [!question]`).
- **Guided**: fills a gap when a rule covers it ("assume X", "always Y").
- **Liberal**: invents freely; each section it writes is tagged Idea.

Assistant rules saved in wiki settings apply to every run in every mode; the one-off rules box adds to them for that run.

### Review
- Proposals appear section by section in a diff view as they arrive.
- Per section: Accept, Edit, Retry with note, Discard.
- Liberal sections arrive tagged Idea; untag them or mark parts Likely or Canon before accepting.
- A section whose reply couldn't be used says so, shows the raw reply, and offers Retry.
- Links to pages that don't exist are flagged.
- Accept all at the end. Each accepted batch is one history entry by the Assistant.

## Agent run panel
- **Simple view (default)**: one status line ("Reading Mira… Drafting Background"), section checklist with progress.
- **Details view**: full transcript of tool calls as collapsible cards with inputs and results, plus a note for each repair or retry.
- Repeated calls show a counter badge ("read_page Mira ×6").
- Interrupt button and a message box to redirect mid-run.
- Recent runs are listed. An interrupted run, including one cut off by a reload, keeps its unreviewed proposals for review; runs never resume on their own.
- Setting: approve each proposal, or auto-accept into the diff view (default).

## Settings
- **Model** (shared by all wikis): provider (llama.cpp, koboldcpp, Ollama, LM Studio, OpenRouter, NanoGPT, OpenAI-compatible), endpoint URL, API key, model, context size, reply length, and "Uses tools".
  - The screen notes that the key is stored unencrypted on this device.
  - Test connection checks the server, fills in the context size and tool support, and explains failures, including blocked browser access.
  - When the server can't count tokens, a Tokenizer row suggests one for the model with a Download button. Without one, counts are estimated with a 10% margin.
- **Wiki**: name, voice (fandom only in MVP), keep original images, keep history for, continuities, Assistant rules, and Follow connections depth (default 1). Deleting a wiki requires typing its name.
- **Appearance** (its own page per wiki, linked from wiki settings):
  - **Accent color**: swatches from the brand palette, plus any color. Used for the header gradient, buttons, tabs, and box headers; text on it is black or white, whichever reads better.
  - **Fonts**: a heading font and a body font, searched from Fontsource, or System fonts (default). A note says fonts are small and download once, then work offline. A small credit links to Fontsource.
  - **Images**: banner (1920 × 300), background (1920 × 1080), wordmark (500 × 130, shown at half size), and icon (256 × 256). Each slot takes a dropped file or an upload, shows a preview, and has Remove.
  - **Wiki Assets Pack**: Download gives `Wiki_Assets_Pack.zip`, with `BANNER.png`, `BACKGROUND.png`, `WORDMARK.png`, and `ICON.png` as placeholder grids at the exact sizes and a short README. Import pack fills each slot whose file is in the ZIP, matching names without regard to case or image type.
- **Dropbox** (shared by all wikis) and **Sync** in wiki settings: see Dropbox sync.
- **Data**: storage status, export ZIP, import ZIP, import Obsidian vault. Under Export, "Last exported N days ago" (or "Never exported"), in red when a backup is due.

## Export reminder
- A banner above the wiki header when the wiki has changed since its last export and that export (or, if none, the wiki's creation) is 7 days old: "Export now" downloads this wiki's ZIP with history, "Later" hides it for 7 days on this device.
- Importing a ZIP counts as an export, since the ZIP is a backup.

## Terminology map
| UI label | Internal term |
|---|---|
| Auto-context | Lorebook |
| Triggers | Keys |
| Follow connections | Recursion |
| Canon / Likely / Idea | hard / soft / maybe |
| Assistant | Agent |
| Our version / synced version | local / remote |
| Clash | conflict |
