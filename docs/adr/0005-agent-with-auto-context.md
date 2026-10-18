# ADR 0005: Agent with auto-context and section proposals

## Status
Accepted. Amended by ADR 0007: `propose_section` is dropped in favor of plain-text replies, and Liberal mode tags whole sections as Idea.

## Context
The LLM should find canon on its own, similar to an agentic coding tool. Local models vary in tool-calling quality. The human owns events and outcomes.

## Options
- Lorebook-style injection only
- Agent tools only
- Auto-context seeding plus agent tools

## Decision
Auto-context seeds each call; agent tools fetch deeper material. `propose_section` is the single write path. Runs plan sections, then fill each with a short tool loop, delivering complete sections.

## Consequences
- Every LLM change passes human review.
- Tool-light models fall back to auto-context only.
- Transcripts surface loops and repeated reads.
- Inventions land in the Idea tier.
