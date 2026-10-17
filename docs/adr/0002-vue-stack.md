# ADR 0002: Vue 3 + Pinia + Vite

## Status
Accepted

## Context
The author has an existing React project and wants a second stack for range. Japanese job listings favor Vue and Nuxt.

## Options
- Vue 3
- Svelte / SvelteKit
- React

## Decision
Vue 3 with Vite, Pinia for state, TypeScript throughout.

## Consequences
- Strong fit for the Japanese hiring market.
- Pinia maps closely to Zustand experience.
- Dexie `liveQuery` pairs with Vue refs.
- Nuxt stays available for a later server-rendered surface.
