# 01: Preview the entire note from the table of contents title

**What to build:** Hovering the title of any table of contents opens the owning note in Obsidian's native page preview. Readers can enter and scroll the preview, follow nested links, and continue using the popup chain until they move away.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Hovering a table of contents title previews the entire owning note, normally without Ctrl/Cmd under the default Page Preview configuration.
- [x] The behavior applies to tables of contents opened from note icons, linked-note icons, nested page or section previews, and sticky headings.
- [x] A sticky heading's custom title previews its entire owning note rather than only that section. Titles and existing heading behavior remain unchanged.
- [x] Notes in folders resolve correctly, independently of the displayed title.
- [x] Native Page Preview delay and explicit modifier requirements are honored; disabling Page Preview prevents the preview. No separate plugin setting or custom preview renderer is added.
- [x] Moving from the title into the page preview keeps the originating table of contents open. The reader can scroll and use links and nested previews without prematurely closing the chain.
- [x] Leaving the entire popup chain dismisses it with the normal delay. Closing the originating popup releases its title page preview without leaving orphaned windows.
- [x] Behavioral unit tests use the existing table of contents UI and fake host to cover note targeting and preview cleanup, including custom titles.
- [x] Docker end-to-end tests verify real native previews, the supported entry points, folder resolution, scrolling, nested interactions, retention, dismissal, and Page Preview settings.
- [x] Follow test-first development; the repository's Docker verification passes.

## Context

This ticket implements the hover interaction from the feature specification. Click navigation is separate work; neither ticket requires the other to begin. Use the shared table of contents behavior and existing host and popup integrations.

## Verification

Completed on 2026-11-04. Docker lint, typecheck, 115 unit tests, build, and real Obsidian end-to-end checks passed. Independent spec and quality reviews passed. The focused video is available under `artifacts/docker/toc-title-preview.mp4`.
