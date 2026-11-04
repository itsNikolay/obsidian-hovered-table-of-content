# Stable height for text preview windows

Status: completed

## Problem Statement

When a reader moves from a section preview to the table of contents title inside a nested popup chain, the text window changes height. In the reproduced case, a short section preview measured approximately 131 pixels and the page preview of the entire note measured approximately 245 pixels. This makes the reading surface jump during navigation. The user confirmed that the affected window contains note text, rather than the table of contents itself.

## Solution

Keep the text preview window at a consistent height when switching between sections and the page preview opened from a table of contents title. Use the theme's popover height and cap it to the available window height. Short content leaves unused space; long content remains scrollable. Preserve the existing side placement and nested popup interactions.

## User Stories

1. As a reader, I want the text window to keep its height when I move from a nested section preview to the table of contents title, so that the reading surface does not jump.
2. As a reader, I want the same height when I move back from a title-triggered page preview to a section, so that navigation is visually stable in both directions.
3. As a reader, I want sections with different amounts of text to use the same window height, so that moving between headings does not resize the reading surface.
4. As a reader, I want short sections to retain the standard preview height, so that a small amount of text does not collapse the window.
5. As a reader, I want short notes opened from a table of contents title to retain that same height, so that switching to the whole note does not resize the window.
6. As a reader, I want long sections to scroll within the preview, so that stable height does not hide their content.
7. As a reader, I want the entire note to remain scrollable in its page preview, so that I can reach its final paragraph.
8. As a reader using a customized theme, I want preview height to follow the theme's popover height, so that the plugin remains consistent with my appearance settings.
9. As a reader in a small window, I want preview height limited by the window, so that the preview remains accessible.
10. As a reader, I want the text preview to remain beside its table of contents, so that stable height preserves the side-by-side reading layout.
11. As a reader near the right edge, I want the existing left-side fallback to continue working, so that the preview remains within the window.
12. As a reader, I want the parent preview and table of contents to stay open during nested navigation, so that I do not lose the popup chain.
13. As a reader, I want to move the pointer into the text preview without closing it, so that I can read and scroll normally.
14. As a reader, I want links inside previews to keep opening nested notes, so that the height fix does not interrupt navigation.
15. As a reader, I want Page Preview modifier, delay and enabled settings to remain effective, so that my existing hover preferences are respected.
16. As a reader, I want title clicks and Ctrl/Cmd-clicks to retain their existing navigation behavior, so that the height fix does not change how I open notes.
17. As a reader, I want ordinary native link previews to retain their existing appearance, so that this change remains limited to the plugin's section and title-triggered text previews.
18. As a reader, I want the table of contents to retain its own content-dependent size, so that stabilizing the text window does not unnecessarily enlarge the outline.
19. As a reader, I want text margins and typography preserved, so that a stable frame does not alter readability.
20. As a reader, I want closing the popup chain to release every associated preview, so that windows and temporary styling do not remain behind.

## Implementation Decisions

- Apply one shared sizing rule to section previews and native page previews triggered by table of contents titles.
- Use the theme's popover height as the preferred height, rather than a hard-coded pixel value. The observed default is 400 pixels, not a universal requirement.
- Use border-box sizing for both preview types so that their visible outer heights agree. Cap height to the viewport with an eight-pixel total vertical allowance.
- Preserve content scrolling, preview width conventions, margins, typography and the existing right-side placement with left-side fallback.
- Mark only title-triggered native previews for the shared sizing rule through the existing native preview integration. Remove this temporary marker during native preview teardown.
- Keep Obsidian-specific lifecycle work in the existing host integration. No new host interface or alternate renderer is needed.
- Keep table of contents sizing unchanged. Ordinary native link previews do not receive the title-preview sizing marker.
- Reuse the current popup-chain ownership and cleanup behavior. Add no new preference, dependency, persisted state or note modification.

## Testing Decisions

- Use one primary seam: the existing real Obsidian E2E harness with its synthetic vault inside Docker. The user explicitly approved this seam.
- Assert externally visible geometry and interactions, rather than CSS selectors or internal method calls as the proof of correctness. Selectors may locate the relevant windows.
- Reproduce a nested table of contents opened from a link inside a section preview. Open a short section, record the text window height, hover the table of contents title, and compare the resulting page preview height.
- Allow at most one pixel of rounding difference. Return to the section and switch to a section containing a different amount of text; both must preserve the same height.
- Keep this focused regression available as the preview-height scenario and include it in the full E2E suite. Unknown scenarios must still fail before a Docker build starts.
- Use the existing title-preview and full-suite checks as prior art for real pointer hovers, native Page Preview integration, scrolling, side placement, nested ownership and cleanup.
- Retain the full suite's checks for long content scrolling, final-paragraph visibility, navigation, modifier settings, disabled Page Preview, editor modes and sticky headings.
- Measure bottom text padding at the padded content wrapper. Empty space inside a fixed-height window is not padding and must not cause a false spacing failure. Retain the existing geometry and font checks.
- Run lint, typecheck, all unit tests, build and the full real Obsidian E2E suite before considering implementation verified. Never launch host Obsidian or use a personal vault.

## Out of Scope

- Changing the size of the table of contents itself.
- Changing ordinary native link preview sizing.
- Adding resizable windows, a height setting or remembered per-note dimensions.
- Changing preview placement rules, navigation semantics, Page Preview settings or the note renderer.
- Editing vault content, changing application-wide styling or installing global skills.
- Publishing a new release as part of this specification request.

## Further Notes

The diagnosis isolated different content-dependent sizing rules: section previews had a maximum height without a fixed height, while native whole-note previews sized themselves differently. A temporary shared-height rule removed the reproduced jump without changing rendering or placement.

Implementation already exists in the working tree. The focused regression was observed failing before the fix and passing afterward. Lint, typecheck, all 129 unit tests, build and the full real Obsidian E2E suite passed; independent review reported no actionable findings. This specification records the agreed behavior retrospectively. The completed status records that implementation and verification are finished; publication of a new release is separate.

## Comments

- 2026-11-04: User confirmed that the changing window contains note text.
- 2026-11-04: User approved the existing real Obsidian E2E scenario as the primary testing seam.
