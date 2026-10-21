# Agent notes

- Work directly in the main repository; do not use git worktrees.
- Test first: write or extend a failing test (unit in `tests/unit/`, end-to-end in `scripts/test-obsidian-docker.mts`), run it and watch it fail, then write the code that fixes it.
- Run the tests in Docker: `npm run docker:test` for the quick loop, `npm run docker:check` before you finish. Never launch or control the host Obsidian app or mount a personal vault; the end-to-end run uses a synthetic vault inside the container.
- `src/ui/*` and `src/headings.ts` use plain DOM and do not import `obsidian`, so they run under jsdom. Everything that touches the Obsidian API goes through `TocHost` (implemented in `src/main.ts`) or `src/view-decoration.ts`.
- Keep user-facing text, docs and comments in English.
- Release artifacts: `main.js`, `manifest.json`, `styles.css`. Do not commit `main.js`.
