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

For routine pushes after Branch Protection (2026-05-12+), the canonical
flow is **PR-based**, since direct push to `main` is blocked by the
`main-protection` ruleset (`current_user_can_bypass: never`).

```bash
# 1. Write a state file describing the PR
node -e 'require("fs").writeFileSync("/tmp/_pr_push_state.json", JSON.stringify({
  title: "chore: short description",
  body: "Longer explanation of what changed and why",
  files: ["path/to/file1.ts", "path/to/file2.md"]
}))'

# 2. Run the PR pusher (creates branch, uploads, opens PR,
#    waits for guard CI to pass, squash-merges, deletes branch)
node scripts/_pr_push.mjs
```

The pre-Branch-Protection direct pusher (`scripts/_push2.mjs`) is kept
in the tree as a reference, but will fail with HTTP 422 against the
current ruleset. See `replit.md` "Gotchas" → "Pushing after Branch
Protection" for full details.

These templates are kept only as a copy-paste reference if you ever need to
build a one-shot pusher for a constrained file set (e.g. workflow-fast push
that bypasses the incremental state file).
