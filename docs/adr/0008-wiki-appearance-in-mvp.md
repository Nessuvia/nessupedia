# ADR 0008: Wiki appearance in the MVP

## Status
Accepted. Moves part of Theme customization from post-MVP into M6.

## Context
The PRD put all theme customization after the MVP, leaving one fixed look. On Fandom, what makes a wiki feel like a fan's own place is its art, wordmark, accent color and fonts, as on the Houseki no Kuni and RWBY wikis (screenshots in `docs/refs/`). With every wiki looking the same, the app doesn't feel like a fandom wiki, so the MVP isn't viable without per-wiki appearance.

## Options
- One fixed look for every wiki, with all customization post-MVP
- A per-wiki appearance with a few fixed choices (accent, fonts, four images), and the theme editor post-MVP
- A full theme editor now

## Decision
M6 ships one built-in fandom theme with light and dark modes, and each wiki sets its own appearance:
- An accent color, from the brand palette or any color.
- A heading font and a body font from Fontsource, or system fonts (the default). Chosen fonts download once and are stored in the wiki, so they work offline and travel in the ZIP export.
- Four images: banner, background, wordmark, and icon. A downloadable Wiki Assets Pack holds placeholder grids at the exact sizes; the images can be dropped or uploaded one by one, or imported as a filled-in pack.

Fonts and images are stored as assets under `appearance/`, and the choices on the wiki record, so export and import carry them without changes to the archive format. Light or dark is a per-device choice, not a per-wiki one.

Full color sets, custom CSS, and layout options remain post-MVP as the theme editor.

## Consequences
- Each wiki can look like its fandom from the start.
- Choosing a font needs a network connection once; the settings page says so and credits Fontsource.
- A wiki with no images uses the plain themed look, tinted by its accent.
- The theme editor builds on the same variables and assets later.
