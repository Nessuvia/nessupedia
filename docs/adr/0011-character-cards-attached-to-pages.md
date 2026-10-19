# ADR 0011: Character cards attached to pages

## Status
Accepted.

## Context
Character cards (V2 and V3) are the format chat apps such as SillyTavern use. The roadmap planned to import them as character pages and build cards back from a page's canon. Cards hold a lot of text, and some hold lorebooks with hundreds of entries. Mapping that text into pages would fill the wiki with text the author didn't write for it. Building cards back from pages would lose what the author tuned for chat.

## Options
- Map a card's fields into a page's sections, and build cards from pages
- Keep the card as its own part of a page, stored as it came

## Decision
Keep the card as its own part of a page. A page holds at most one card, and since versions are pages, each AU can have its own. The card is stored as V3 JSON, with its image as an asset. It's edited in a form, and every change is a card change in the page's history. Download returns the card as stored: a PNG with `chara` and `ccv3` chunks when it has an image, JSON otherwise. The lorebook and extensions are kept as they came. Nothing from the card goes into page text.

## Consequences
- Authors who don't use cards see only a "Card" page action.
- The Assistant reads a card through `read_card`, and runs on a page with a card get its text fields as a reference. The lorebook isn't read.
- Wiki exports carry cards and their history. A downloaded card has no history.
- Lorebooks can't be edited in the app yet.
