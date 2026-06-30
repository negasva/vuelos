---
name: ui-ux-pro-max
description: "Design intelligence for UI/UX work. Apply when building, designing, improving, or reviewing any interface in this repo: pick a coherent design system (palette, type, spacing, states) and validate against the pre-delivery checklist before finishing."
---

# ui-ux-pro-max — design guidance

Guidance subset of the ui-ux-pro-max project
(https://github.com/nextlevelbuilder/ui-ux-pro-max-skill, MIT). The upstream
auto-running scripts/CLI (`search.py`, hooks) are intentionally NOT included.

When asked to build/design/improve/fix UI, first decide a small, coherent design
system, then implement against it, then run the checklist.

## 1. Design system (decide before coding)

- **Palette**: one background scale, one surface scale, 1–2 accents, plus
  semantic colors (success / warning / danger / info). Keep contrast AA+.
- **Typography**: one display + one body pairing; a clear type scale; consistent
  line-height and max line length (~60–75ch for prose).
- **Spacing & radius**: a single spacing step (e.g. 4/8px) and a consistent
  radius scale. Reuse tokens (CSS variables), don't hardcode ad hoc values.
- **Elevation & motion**: subtle, consistent shadows; short, purposeful
  transitions; respect `prefers-reduced-motion`.

## 2. Every interactive surface needs all its states

Default, hover, focus-visible, active, disabled, loading, empty, error, and
success. A control without a visible focus state or a list without an empty
state is unfinished.

## 3. Usability defaults

- Validate at the input; show inline, specific errors; disable submit until
  valid. Never lose user input on error.
- Prefer non-blocking feedback (toasts) over native `alert`/`prompt`.
- Confirm destructive actions.
- Format numbers/dates/currency for the locale.
- Make primary actions obvious; secondary actions quieter.

## 4. Accessibility (non-negotiable)

- Real labels tied to inputs; `aria-*` only to fill gaps.
- Full keyboard operability and a visible focus ring.
- Sufficient color contrast; never rely on color alone to convey meaning.
- Honor `color-scheme` / theme and `prefers-reduced-motion`.

## 5. Responsive

Design mobile-first; verify at ~360px, ~768px, ~1200px. No horizontal scroll;
tap targets ≥ 40px.

## Pre-delivery checklist

- [ ] Tokens (colors/spacing/radius/type) are reused, not ad hoc.
- [ ] All interactive states present (incl. focus-visible, loading, empty, error).
- [ ] Forms validate inline and never drop input.
- [ ] Keyboard + screen-reader usable; contrast AA+.
- [ ] Looks right at mobile / tablet / desktop widths.
- [ ] Destructive actions confirmed; feedback is non-blocking.
