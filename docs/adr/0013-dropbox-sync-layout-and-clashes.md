# ADR 0013: Dropbox sync layout and clashes

## Status
Accepted. Replaces ADR 0010's choice of the archive layout for sync.

## Context
Sync is for the same wikis on several devices, used one at a time, with the page as the unit: a page changed on one device moves, and a page changed on both is the user's choice. The archive layout doesn't fit that. `wiki.json` lists every page's title and template, so any new page or rename on either device edits that one file, and page files are named by title, so a rename is a delete plus a new file.

## Options
- Archive layout, merging `wiki.json` entry by entry
- One file per item, named by ID, with a `sync.json` of who wrote each file
- Last write wins per page, with the losing version kept in history

## Decision
One file per item, named by ID. Each page file holds the page, its card, and its change entries. A three-way compare of this device's hash, Dropbox's `content_hash`, and the hash at last sync decides what moves. Every page changed on both sides is asked about, and nothing in that wiki moves until all are decided. Uploads carry the file's last known `rev`, so a race becomes a clash rather than an overwrite.

## Consequences
- Renames, new pages, and edits to different pages never clash.
- The Dropbox folder isn't browsable markdown. ZIP export stays the readable copy.
- Edits outside the app aren't supported, but `sync.json` detects them and they go through the same choice.
- The losing version of a clash is not kept.
