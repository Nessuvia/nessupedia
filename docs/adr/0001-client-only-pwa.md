# ADR 0001: Client-only PWA with IndexedDB

## Status
Accepted

## Context
MVP serves a single user. Content should stay on the user's device. The author works in web development.

## Options
- Server app with database
- Client-only PWA with IndexedDB
- Desktop app

## Decision
Client-only PWA. All data in IndexedDB through Dexie.

## Consequences
- Zero hosting cost beyond static files; offline by default.
- Backup depends on ZIP export until Dropbox sync ships.
- A backend arrives later for Dropbox OAuth and sharing.
