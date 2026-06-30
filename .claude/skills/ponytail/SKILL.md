---
name: ponytail
description: "Lazy senior dev mode — minimize unnecessary code. Apply before writing any new code: walk the decision ladder, prefer reuse/deletion over addition, write the minimum viable code. Use whenever generating or reviewing implementation code in this repo."
---

# ponytail — Lazy Senior Dev Mode

Reduce generated code by defaulting to the least code that correctly solves the
problem. "Lazy" means efficient, not careless: prefer deletion over addition,
boring over clever, root-cause fixes over symptom patches.

Source/credit: the ponytail project (https://github.com/DietrichGebert/ponytail, MIT).
This is the guidance subset only — the upstream auto-running lifecycle hooks are
intentionally NOT included.

## Decision ladder — run top to bottom before writing code

1. **Does it need to exist at all?** (YAGNI) — if not, stop.
2. **Already in the codebase?** — reuse it.
3. **In the standard library?** — use it.
4. **A native platform feature?** — use it.
5. **An already-installed dependency?** — use it.
6. **A one-liner?** — write the one line.
7. **Otherwise** — write the minimum viable code, nothing speculative.

## Non-negotiables (never "lazy" here)

Fully understanding the problem, input validation at trust boundaries, error
handling that prevents data loss, security, accessibility, correctness of
explicitly requested features.

## Practices

- Fix bugs at the root cause. Fix a shared function once rather than patching
  each caller.
- Mark deliberate simplifications with a `ponytail:` comment noting the
  performance ceiling and the upgrade path, so the shortcut is intentional and
  discoverable.
- Prefer deleting code to adding it; prefer boring to clever.
