# ADR 0007: Runs driven by the app, with plain-text sections

## Status
Accepted. Amends ADR 0005.

## Context
The author's model is a Gemma 4 31B finetune on a local server, with a 16k context. Models of that size drift in long open-ended tool loops, often fail to put long markdown inside a JSON tool argument, forget to call a finishing tool, and sometimes write tool calls as text. Their replies go wrong in many small ways, so a run must recover without losing the work already done.

## Options
- The model drives the whole loop (Claude Code style), ending sections with `propose_section`
- The app drives the flow; the model handles one narrow request at a time

## Decision
The app owns the flow. The plan comes from the template's headings when there is one. Each section is a fresh, short conversation with read-only tools, and the model's plain-text reply is the proposal. `propose_section` is dropped, and the app tracks sources from the pages it served. The model writes simple line markers (`QUESTION:`) that the app turns into wiki syntax. Every failure type has a bounded repair or retry, and a section that still fails is shown raw with Retry, while the rest of the run carries on. In Liberal mode, each proposed section is tagged Idea as a whole.

## Consequences
- Every LLM change still passes human review; proposals are the only write path.
- A broken reply costs one section, not the run.
- Liberal sections need untagging or promoting in review, rather than the model marking its own inventions.
- Tool-less models follow the same flow on auto-context alone.
