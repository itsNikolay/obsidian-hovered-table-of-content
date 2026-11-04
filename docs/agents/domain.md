# Domain docs

## Layout

This repository uses a single-context layout:

- `GLOSSARY.md` at the repository root.
- Architecture decision records in `docs/adr/`.

## Before exploring

Read the glossary and ADRs relevant to the area being investigated.

If these files do not exist, proceed silently. Do not flag their
absence or suggest creating them upfront. The domain-modeling
skill creates them lazily when terms or decisions are resolved.

## Vocabulary

Use the glossary's terms when naming domain concepts in issues,
proposals, hypotheses, tests, and documentation. Avoid synonyms
the glossary explicitly rejects.

If a needed concept is missing, reconsider whether the term fits
the project or note the gap for domain-modeling.

## ADR conflicts

Explicitly flag any proposal that contradicts an existing ADR.
Reference the ADR and explain why the decision should be reopened.
