# ADR 0004: Markdown with unified/remark and a theme layer

## Status
Accepted

## Context
Content must stay portable, LLM-friendly, and Obsidian-importable. The UI should look like a classic fandom wiki.

## Options
- Markdown → custom renderer → themed layout
- Markdown → HTML template → direct HTML/CSS editing

## Decision
Markdown with frontmatter, wikilinks, callouts, and custom directives, processed by unified/remark/rehype. Styling lives in a per-wiki theme built on CSS variables.

## Consequences
- One syntax tree serves rendering, link indexing, auto-context, section slicing, and click-to-edit.
- Custom syntax costs one small plugin each.
- Full visual customization ships later through themes.
