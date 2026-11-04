# 02: Open the entire note by clicking the table of contents title

**What to build:** Clicking the title of any table of contents opens its owning note from the beginning in the current tab. Ctrl/Cmd-click opens it from the beginning in a new tab. Navigation dismisses the originating table of contents and its associated preview chain.

**Blocked by:** None (can start immediately).

**Status:** completed

- [x] Ordinary title clicks open the owning note from the beginning in the current tab.
- [x] Ctrl-click and Cmd-click request a new tab and open the owning note from the beginning.
- [x] Navigation applies to tables of contents opened from note icons, linked-note icons, nested page or section previews, and sticky headings.
- [x] A sticky heading's custom title opens the entire owning note from the beginning, without navigating to that heading.
- [x] Notes in folders resolve correctly, independently of the displayed title.
- [x] Title navigation closes the originating table of contents and its associated page and section preview chain, including any native preview attached to the title when hover support is present.
- [x] Navigation works when native Page Preview is disabled or requires a modifier. Hover settings do not disable click navigation.
- [x] Existing title text, individual heading navigation, and section preview behavior remain unchanged.
- [x] Behavioral unit tests use the existing table of contents UI and fake host to verify the target, ordinary and modified clicks, custom titles, and popup closure.
- [x] Docker end-to-end tests verify current-tab and new-tab navigation, note position at the beginning, supported entry points, folder resolution, cleanup, and navigation with Page Preview disabled.
- [x] Follow test-first development; the repository's Docker verification passes.

## Context

This ticket implements click navigation from the feature specification. Hover support is separate work; neither ticket requires the other to begin. When hover support is available, include its native title preview in navigation cleanup coverage. Work sequentially in the main repository as required by the project instructions.

## Verification

Completed on 2026-11-04. Docker lint, typecheck, 115 unit tests, build, and real Obsidian end-to-end checks passed. Independent spec and quality reviews passed. The focused video is available under `artifacts/docker/toc-title-preview.mp4`.
