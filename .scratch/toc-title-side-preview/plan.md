# Side placement for TOC title previews

Approved behavior: open the whole-note native Page Preview to the right of the TOC card, flip left when the right side has insufficient space, and clamp within the window. Keep native settings, scrolling, links and cleanup.

Implementation: reuse `computePosition`; customize only the positioning of title-triggered native popovers, with cleanup on unload. Anchor to the entire TOC card.

- [x] Add a real Obsidian regression assertion; observe failure.
- [x] Implement positioning through the native preview lifecycle, including size changes.
- [x] Verify both sides, resizing and existing behavior in Docker; record a new title demo.

Verification: regression failed on the original below-title layout; focused and full real Obsidian E2E passed, as did lint, typecheck, all 129 unit tests and the Docker build. Independent review found no actionable issues. Updated video: `artifacts/docker/toc-title-preview.mp4` (21.4 seconds), inspected at 7 seconds.
