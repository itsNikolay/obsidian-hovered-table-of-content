# Agent execution and focused checks

## DSH delegation

Launch from a shell with `DEEPSEEK_API_KEY` exported. If an interactive zsh configuration was just updated, reload that shell before running the commands. Keep the key out of prompts, logs and repository files.

```sh
npm run agent:preflight
npm run agent:dsh -- 'Implement the approved ticket at .scratch/<feature>/issues/01-<slug>.md'
# Or pipe a task on stdin:
printf '%s\n' 'Read the approved ticket and implement it.' | npm run agent:dsh -- -
```

The preflight checks the inherited key, DSH CLI and coordinator Docker access without making a model request. The launcher selects `deepseek-official/deepseek-flash` using a temporary overlay, preserves the worker's exit status and removes the overlay afterward. Model events go to stdout; launch diagnostics go to stderr.

The coordinator executes Docker validation. DSH workers write tests and code, report the needed commands and wait for controller RED/GREEN evidence between phases. A worker sandbox's Docker denial is an infrastructure failure; return it instead of trying alternative builders. The launcher does not change credentials or permission policies. It sends task content to the configured external provider, so use it for tasks authorized for that provider.

## Focused Docker checks

```sh
npm run docker:test -- tests/unit/toc.test.ts -t 'clicking the title'
npm run docker:e2e -- --scenario title-preview
npm run docker:e2e -- --scenario preview-height
npm run docker:check
```

Filtered unit runs invoke only the selected Vitest checks; they skip unrelated lint, typecheck and build steps. Unfiltered `docker:test` still runs the complete quick check. Every invocation builds from current source before running in a network-isolated container.

`title-preview` is a dependency-safe E2E scenario: it includes shared setup, preview scrolling and nested links, cleanup, modifier settings and disabled Page Preview. It does not replace the full suite's folder, sticky-heading and new-tab navigation coverage. Unknown scenarios fail before Docker starts. The default scenario is `full`.

Use focused checks while iterating and `docker:check` before completion. After a full pass, repeat checks only for subsequent changes or unresolved failures.

## UI evidence

`npm run lint:ui` rejects synthetic click dispatches in the E2E and recording scripts and runs as part of the regular lint command and CI. Use Playwright's real pointer clicks for user navigation.

For evidence that text is on screen inside a scrollable preview, use `isFullyInViewport` from `scripts/ui-visibility.mts`. `isVisible()` alone also accepts rendered content outside the viewport. Both the focused E2E scenario and the video recorder use the shared helper.

`preview-height` checks the nested text window across short section, whole-note title and section hovers. It runs after shared app setup and is also included in the full suite.
