# ADR 0003: Hybrid storage model

## Status
Accepted

## Context
Pages need cheap renames and backlinks in-app, and a folder layout for ZIP export and Dropbox sync.

## Options
- Page records keyed by ID
- Virtual filesystem keyed by path
- Hybrid: ID records with a `path` field

## Decision
Hybrid. Records keyed by ID, each with a `path`. Markdown stores link titles; a `links` table resolves titles to IDs.

## Consequences
- Renames update one record plus inbound link text.
- Export and import translate between IDs and paths.
- One archive serializer serves ZIP and Dropbox.
