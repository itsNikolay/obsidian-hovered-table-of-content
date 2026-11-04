# Triage labels

For local Markdown issues, record the role in a `Status:` line.

| Canonical role | Status | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Maintainer needs to evaluate the issue |
| needs-info | needs-info | Waiting for more information |
| ready-for-agent | ready-for-agent | Fully specified and ready for an agent |
| ready-for-human | ready-for-human | Requires human implementation |
| wontfix | wontfix | Will not be actioned |

When a skill asks to apply a triage label, update the issue's
`Status:` line with the corresponding string.

Wayfinding ticket lifecycle states are defined separately in
`issue-tracker.md`.
