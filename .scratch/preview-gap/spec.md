# Consistent adjoining text previews

Status: completed

## Problem Statement

A page preview opened from a table of contents title has a visible gap from the table of contents, unlike the nearly flush section previews. The difference makes the popup layout inconsistent.

## Agreed Behavior

- Text preview windows meet the outside edge of their table of contents without an external gap.
- Apply this consistently to title-triggered page previews and section previews, on either side and at every nesting level, including sticky-heading and linked-note tables of contents.
- Keep internal text padding, typography, stable preview height, scrolling, hover retention and navigation unchanged.
- Preserve right-side placement, left-side fallback and viewport bounds. When neither side can fit, viewport containment remains the existing fallback.
- Ordinary native link previews and spacing around a T icon that opens a table of contents are outside this change.

## Implementation Decisions

Title previews previously used the outer TOC as their anchor plus a six-pixel gap. Section previews used inset heading-row bounds plus the same gap, creating a slight overlap. Use outer TOC horizontal edges for both, with zero gap; keep section previews vertically aligned to the hovered row. Retain the default gap for other popup relationships.

## Verification

- Unit test: zero-gap placement on either side and automatic flipping; observed failing before implementation (420 expected, 426 actual).
- Real Obsidian E2E: adjoining title previews left and right, resized preview alignment, and adjoining nested section previews.
- Full Docker suite checks internal padding, popup lifetime, scrolling, navigation, nested previews, editor modes and sticky headings.

## Comments

- 2026-11-04: User confirmed removal of external spacing for all TOCs and both preview types; internal text padding is preserved.

Final validation: lint, typecheck, all 130 unit tests, build and full real Obsidian E2E passed. Independent review found no actionable issues. Updated title demo video recorded successfully.
