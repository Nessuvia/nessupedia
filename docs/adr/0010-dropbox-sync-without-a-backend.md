# ADR 0010: Dropbox sync without a backend

## Status
Accepted. Replaces the plan in ADR 0001 for a backend that handles Dropbox OAuth. The sync layout is replaced by ADR 0013.

## Context
Dropbox sync is the first post-MVP item. The plan assumed a Rails backend to keep the OAuth client secret. Dropbox also supports OAuth with PKCE for public clients, meaning apps that can't keep a secret, and issues refresh tokens to them. Its API accepts calls from the browser.

## Options
- Rails backend for OAuth
- PKCE from the browser, no backend

## Decision
PKCE from the browser. The app redirects to Dropbox, exchanges the code for tokens itself, and stores the refresh token in IndexedDB. Sync uses the archive layout that ZIP export already writes.

## Consequences
- The app stays static files only, so no hosting or accounts are needed.
- The refresh token sits on the device unencrypted, like the model API key.
- Sharing may still need a backend. That's decided when sharing is planned.
