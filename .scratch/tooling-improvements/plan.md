# Development tooling improvements

Approved scope: implement the first three retrospective recommendations.

## Design

Use existing Node, Docker, Vitest, Playwright and ESLint dependencies. Add a DSH launcher that checks the inherited DEEPSEEK_API_KEY, the installed CLI and coordinator Docker access without printing credentials or calling a model. Force the official Flash route with a temporary launch-only overlay and assign Docker validation to the coordinator.

Forward unit test arguments as an array through the Docker entrypoint. Preserve the full default check. Expose one dependency-safe E2E scenario, title-preview, which exits after its shared setup and related tests; reject unknown scenarios before launching Docker.

Run an independent ESLint configuration for the E2E and recording scripts, since the main lint configuration excludes scripts. Reject synthetic click dispatches. Share a viewport-intersection helper between the E2E and recording scripts.

## Tasks

- [x] Add CLI contract tests for preflight, secret masking, exit propagation, Docker argument forwarding, invalid scenarios and the UI click guard. Run in Docker to confirm RED.
- [x] Implement the DSH launcher, Docker filters/scenario and UI guard/helper. Extend test coverage at these interfaces.
- [x] Document commands and ownership in README and docs/agents. Preserve the existing setup changes.
- [x] Verify focused unit tests, focused E2E and full Docker check; review the diff and commit locally. Do not publish a release.

## Verification

Completed on 2026-11-04. CLI contract tests initially failed; the offscreen viewport cases reproduced the isVisible limitation. Focused unit checks passed, the title-preview scenario passed in real Docker Obsidian, and the final docker:check passed lint (including UI guard), typecheck, 126 unit tests, build and the full real-app E2E suite. Actual preflight and a no-tools DSH Flash LAUNCH_OK smoke request passed. Independent review reported no findings.
