# Stable nested text preview height

Symptom: hovering a nested TOC title changes the text window height.

Root cause: section previews had only a maximum height and shrank to their content; native whole-note previews used a different content-dependent height. Short section: 130.859375 px; whole note: 245.21875 px. Existing ancestor windows retained their sizes.

Hypotheses considered: different content sizing rules; available-space placement limits; asynchronous Markdown reflow. Applying one shared fixed-height CSS rule in the test environment made both windows exactly 400 px without changing placement or rendering. This isolated the sizing rules as the cause.

Regression command: `npm run docker:e2e -- --scenario preview-height`.
Executed locally using the equivalent existing-image Docker source mounts to avoid rebuilding dependencies on the full Docker disk: `bash /tmp/htoc-side-docker.sh e2e --scenario preview-height`.

Before fix: FAIL, `the nested text window keeps its height on title hover: 130.859375 -> 245.21875`.
After fix: PASS, `Real Obsidian end-to-end checks passed (preview-height)`.

Fix: section and title-triggered native previews share the theme's popover height and border-box sizing, capped to the window height. Ordinary native link previews retain their original styling. The title-preview class is removed during native teardown.

The focused regression also verifies returning to a section and changing section content length. It runs in the full suite too. Temporary probes and debug logs were removed. Independent review found no actionable issues.

Final verification: full Docker check passed (lint, typecheck, 129 unit tests, build, full real Obsidian E2E). The spacing check measures the bottom of the padded content wrapper rather than intentional extra window space; independent review confirmed it still catches padding changes. Current local main.js was built in Docker with the fix.
