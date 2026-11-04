# Table of contents title: page preview and navigation

Status: completed

## Problem Statement

The table of contents title identifies a note or section but currently behaves as plain text. A reader cannot hover it to read the entire note or click it to open the note, interrupting navigation through floating tables of contents.

## Solution

Make the title of every table of contents popup an entry point to its entire note. Hovering uses Obsidian's native Page Preview, normally without Ctrl/Cmd, while honoring the user's Page Preview settings and delay. Clicking opens the note from the beginning in the current tab; Ctrl/Cmd-click opens it in a new tab. Navigation closes the originating table of contents and its associated preview chain.

## User Stories

1. As a reader, I want to hover a table of contents title to preview the entire note without leaving my current note.
2. As a reader, I want this preview to work without Ctrl/Cmd under the default Page Preview configuration.
3. As a reader, I want my explicit Page Preview modifier settings to remain effective.
4. As a reader, I want a disabled Page Preview feature to remain disabled.
5. As a reader, I want title previews to use the same delay as other native page previews.
6. As a reader, I want to move from the title into its page preview without closing the table of contents.
7. As a reader, I want to scroll the page preview to read the note.
8. As a reader, I want to use links within the page preview and continue navigating nested previews.
9. As a reader, I want the associated popup chain to remain open while I interact with it.
10. As a reader, I want the popup chain to close with its normal delay after I leave it.
11. As a reader, I want titles of tables of contents opened from note links to behave the same way.
12. As a reader, I want titles of tables of contents opened inside page or section previews to behave the same way.
13. As a reader, I want a sticky heading's table of contents title to preview the entire owning note, even though the title displays a section name.
14. As a reader, I want an ordinary title click to open the owning note from the beginning in the current tab.
15. As a reader, I want Ctrl/Cmd-click on a title to open the owning note from the beginning in a new tab.
16. As a reader, I want clicking a sticky heading's table of contents title to open its entire note from the beginning.
17. As a reader, I want title navigation to close the originating table of contents and its associated preview chain.
18. As a reader, I want hovering and clicking individual table of contents entries to retain their existing section-specific behavior.

## Implementation Decisions

- Apply the behavior to the shared table of contents title, covering note, linked-note, nested-preview, and sticky-heading tables of contents.
- Resolve the target from the note that owns the table of contents, independently of the displayed title. A sticky heading title still targets the entire note.
- Reuse the existing native page preview integration and popup-chain lifetime handling. Keep Obsidian API interactions behind the existing host interface.
- Preserve native Page Preview settings, including modifier requirements, disabling, and delay. Add no plugin-specific setting or alternate preview renderer.
- Title navigation targets the note without a heading fragment. Use the existing navigation modifier convention: Ctrl or Cmd requests a new tab.
- Close the originating table of contents and its associated preview chain when navigating. Release the title's page preview when its owning popup closes.
- Preserve the existing title text and the behavior of individual headings and section previews.

## Testing Decisions

Confirmed testing boundaries:

- Use the existing table of contents UI with its fake host for behavioral unit tests: title targets its owning note, ordinary and modified clicks request the correct navigation, custom sticky-heading titles still target the entire note, and closing the popup releases its page preview.
- Use the existing real Obsidian Docker end-to-end harness as the highest integration boundary. Verify native hover preview, moving into and scrolling the preview, nested links and popup retention, delayed dismissal, navigation in the current or new tab, and cleanup after navigation.
- Include default Page Preview behavior, explicit modifier requirements, and disabled Page Preview in integration coverage. Click navigation remains available regardless of Page Preview settings.
- Exercise the title through the existing note, linked-note, nested-preview, and sticky-heading entry points. Include a note in a folder to detect incorrect note resolution.
- Follow existing tests for internal-link page previews, keeping the popup chain open, and ordinary versus modified heading navigation. Assert visible content, navigation destination, and popup lifetime rather than private implementation details or exact timing values.
- Follow the repository's test-first workflow and Docker verification commands during implementation. Introduce no new test boundary.

## Out of Scope

- Changes to hover behavior of ordinary note links outside the table of contents title.
- A custom renderer replacing Obsidian Page Preview.
- Bypassing native Page Preview settings or introducing a separate title-preview setting.
- Navigating to a section when the table of contents title is clicked.
- Changes to individual heading navigation, heading numbering, section previews, or sticky heading selection.
- Implementing the feature or publishing a release as part of writing this specification.

## Further Notes

The user confirmed the complete interaction behavior and testing boundaries. Both implementation tickets are complete. Docker lint, typecheck, 115 unit tests, build, and real Obsidian end-to-end checks passed on 2026-11-04. Independent reviews passed. The feature was recorded in a synthetic vault; the MP4 is available under artifacts/docker/toc-title-preview.mp4.
