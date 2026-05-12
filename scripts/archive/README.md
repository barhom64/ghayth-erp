# scripts/archive/

**Historical one-shot push scripts.** Kept as reference templates only.

These scripts were used once each to push specific files to GitHub when the
canonical incremental pusher (`scripts/_push2.mjs`) wasn't yet wired up for
that change. They are not part of the regular workflow.

| Script | Purpose | Used on |
|---|---|---|
| `_push_dashboard_fix.mjs` | Push moduleDashboards.ts SQL fixes + replit.md Gotchas | 2026-05-12 |
| `_push_contributing.mjs` | Push initial CONTRIBUTING.md | 2026-05-12 |

## ⚠️ Don't use these for new work

For routine pushes, use:

```bash
node scripts/_push2.mjs
```

These templates are kept only as a copy-paste reference if you ever need to
build a one-shot pusher for a constrained file set (e.g. workflow-fast push
that bypasses the incremental state file).
