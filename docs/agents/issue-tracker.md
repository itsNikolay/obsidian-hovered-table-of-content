# Issue tracker: Local Markdown

Issues and specs live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- Spec: `.scratch/<feature-slug>/spec.md`.
- One file per implementation ticket:
  `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`. Never combine tickets into one file.
- Record triage state in a `Status:` line near the top.
  Use the role strings from `triage-labels.md`.
- Append comments and conversation history under `## Comments`.

## Publishing and fetching

When a skill says "publish to the issue tracker", create the
appropriate file under `.scratch/<feature-slug>/`.

When a skill says "fetch the relevant ticket", read the referenced
file. Resolve ticket numbers within the relevant feature directory.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, with Notes,
  Decisions-so-far, and Fog sections.
- Child ticket: `.scratch/<effort>/issues/NN-<slug>.md`.
  Put the question in the body and record
  `Type: research|prototype|grilling|task`.
- Wayfinding tickets use their own lifecycle:
  `Status: open`, `Status: claimed`, or `Status: resolved`.
- Dependencies: `Blocked by: NN, NN`.
  A ticket is unblocked when all listed tickets are resolved.
- Frontier: choose the lowest-numbered open, unblocked,
  unclaimed ticket.
- Claim: save `Status: claimed` before starting work.
- Resolve: append the answer under `## Answer`, set
  `Status: resolved`, and append a summary and ticket link
  to Decisions-so-far in the map.
