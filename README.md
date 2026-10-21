# Hovered Table of Content

![Hovering the T icon shows the table of contents, section previews, linked notes, the T on links in a note and sticky headings](docs/demo.gif)

An Obsidian plugin that keeps a note's structure one hover away.

- **T icon.** Every note gets a small square **T** button. Hover over it to see the note's table of contents in a popup.
- **Section previews.** Hover over a heading in the table of contents to preview that section: the heading, its text and its subsections. Click the heading to jump to it (Ctrl/Cmd-click opens it in a new tab).
- **Previews of linked notes.** Hover over a link inside a preview to see the linked note in Obsidian's page preview. Every link to another note also gets its own **T** icon. Hover over it to see the linked note's table of contents, which previews its sections in turn.
- **T on links in notes.** Every link to another note in the note itself gets a **T** right after it, in Reading view and Live Preview. Hover over it to see the linked note's table of contents.
- **T in page previews.** Obsidian's page previews of notes get a **T** button too, with the table of contents of the previewed note.
- **Sticky headings.** When you scroll past a heading, it stays pinned at the top of the note. Click it to jump back. Each sticky heading has a **T** icon that lists only that heading's subheadings.

It works in Reading view, Live Preview and Source mode.

## Settings

| Setting | Default | |
| --- | --- | --- |
| Icon position | Top right | Top left, top center, top right, bottom left, bottom center or bottom right of the note. The popup opens towards the middle of the note. |
| Icon in notes | On | Shows the **T** button in each note. |
| Icons on links | On | Shows a **T** next to links in previews and in Obsidian's page previews of notes. |
| Icons on links in notes | On | Shows a **T** next to links to other notes in the note itself, in Reading view and Live Preview. |
| Sticky headings | On | Turns sticky headings on or off. |
| Sticky heading mode | Heading with its parents | *Closest heading* shows only the last heading above the screen. *Heading with its parents* also shows its parent headings. |
| Icons on sticky headings | On | Shows a **T** with the subheadings next to each sticky heading. |

## Development

The tests run in Docker, including end-to-end checks against the real Linux Obsidian app on a virtual display:

```sh
npm run docker:test    # lint, typecheck, unit tests (vitest + jsdom), build
npm run docker:check   # all of the above + end-to-end tests in real Obsidian
npm run docker:demo    # re-record docs/demo.gif in real Obsidian
```

The end-to-end run uses a synthetic vault created inside the container (`--network=none`). Screenshots and `report.json` are written to `artifacts/docker/`.

Without Docker, use Node 22.13 or later: `npm ci && npm run check`.

| Path | |
| --- | --- |
| `src/headings.ts` | Pure heading logic: nesting, sections, sticky headings |
| `src/links.ts` | Pure link logic: finds links in the editor's syntax tokens |
| `src/ui/popup.ts` | Hover popups that can be nested |
| `src/ui/toc.ts` | Table of contents popup, section previews, link icons |
| `src/ui/sticky.ts` | Sticky headings overlay |
| `src/view-decoration.ts` | Adds the button, sticky headings and link icons to a note view |
| `src/main.ts` | Plugin lifecycle and the link to the Obsidian API |
| `scripts/test-obsidian-docker.mts` | End-to-end tests against real Obsidian |
| `scripts/record-demo.mts` | Records the demo GIF at the top of this README |

Based on [obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin). The sticky-heading approach comes from [obsidian-sticky-heading](https://github.com/imshenshen/obsidian-sticky-heading), and the heading handling from [obsidian-automatic-table-of-contents](https://github.com/johansatge/obsidian-automatic-table-of-contents).
