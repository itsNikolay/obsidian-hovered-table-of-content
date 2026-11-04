# TOC title implementation plan

Status: completed

## Global Constraints

Read AGENTS.md and the feature spec. Work directly in this repository without worktrees. Preserve existing setup documentation and other uncommitted work. Use Docker and a synthetic vault only. Keep generated content in English. Implement test-first at the confirmed UI/fake-host and Docker Obsidian boundaries. Do not publish or push.


## Task 1

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


## Task 2

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


## Task 3

Record a focused video of the completed feature in real Obsidian inside Docker, using the existing synthetic demo vault and recording infrastructure. Show a linked note TOC title, plain hover preview, moving into and scrolling the preview while the TOC stays open, title click navigation, and Ctrl-click opening a new tab. Save a playable MP4 under artifacts/docker and representative screenshots. Do not overwrite the existing README demo GIF unless required by an intentional change. Include assertions so the recording fails when behavior is wrong. Reuse existing recording helpers rather than duplicating the entire harness.
