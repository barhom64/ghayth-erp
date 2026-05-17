// scripts/_pr_push.mjs
//
// PR-flow pusher for the post-Branch-Protection era.
//
// The repo's `main-protection` ruleset (active 2026-05-12) requires every
// change to land via Pull Request with a green `guard` status check, blocks
// force-push, blocks deletion, and requires linear history. `current_user_can_bypass: never`,
// so even repo admins must use this flow — `_push2.mjs` (direct main push)
// no longer works.
//
// What this script does, end-to-end:
//   1. Reads a JSON state file (default: /tmp/_pr_push_state.json) containing:
//        { branch?: "chore/fix-x", title: "…", body: "…", files: ["rel/path", …] }
//      `branch` is optional — auto-generated as `agent/<timestamp>` if omitted.
//   2. Resolves origin/main HEAD SHA via /repos/.../branches/main.
//   3. Creates the feature branch via /repos/.../git/refs (POST refs/heads/<branch>).
//   4. PUTs each file to /repos/.../contents/<path>?ref=<branch> in sequence
//      (with the existing-file SHA fetched fresh so concurrent edits surface as 422).
//   5. Opens a PR via /repos/.../pulls (head=<branch>, base=main).
//   6. Polls the PR's check runs (`guard` context) every 30s, up to 25 minutes.
//      Exits non-zero if guard fails or times out.
//   7. On guard success: PUT /repos/.../pulls/<n>/merge with merge_method=squash
//      (the ruleset's allowed_merge_methods includes squash, and squash gives us
//      the linear history the ruleset requires).
//   8. DELETEs the branch ref to keep the branch list clean.
//
// State file is rewritten after each phase so a SIGKILL'd run can resume:
//   { phase: "branch-created" | "files-uploaded" | "pr-opened" | "merged",
//     prNumber?, branch, sha?, ... }
//
// Usage:
//   1. Write state file with files + title + body:
//        node -e 'require("fs").writeFileSync("/tmp/_pr_push_state.json",
//          JSON.stringify({ title: "fix: lockfile drift", body: "…",
//            files: ["pnpm-lock.yaml"] }))'
//   2. Run: node scripts/_pr_push.mjs
//   3. Watch: tail -f /tmp/_pr_push.log (or stdout)

import fs from "fs";
import path from "path";
// Claim the foreground priority lane on the shared rate-limit budget BEFORE
// importing the client (Task #369). Background workflows (Auto-Pull, Merge
// All, Rerun Failed CI, Self-Heal, Billing Monitor) yield while this
// process holds a fresh heartbeat in /tmp/_gh_priority.json so manual
// fixes don't get starved out by polling traffic on the 10 RPS proxy cap.
process.env.GH_CLIENT_PRIORITY = process.env.GH_CLIENT_PRIORITY || "1";
import { gh as ghClient } from "./src/lib/github-client.mjs";
import { validatePush } from "./_pr_push_baseline.mjs";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const STATE = process.env.PR_PUSH_STATE || "/tmp/_pr_push_state.json";
const POLL_MS = 30_000;
const MAX_POLL_MIN = 25;

// Thin adapter that preserves this script's legacy `gh(ep, method, body)` shape
// while delegating to the shared rate-limit-aware client (Task #362).
async function gh(ep, method = "GET", body = null) {
  const r = await ghClient(ep, { method, body: body ?? undefined });
  return { status: r.status, data: r.data };
}

function loadState() {
  if (!fs.existsSync(STATE)) {
    console.error(`[pr-push] missing state file at ${STATE}`);
    console.error(`[pr-push] expected JSON: { title, body, files: [...], branch? }`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(STATE, "utf-8"));
}
function saveState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

const s = loadState();
if (!s.title || !s.files?.length) {
  console.error("[pr-push] state file must have `title` and non-empty `files` array");
  process.exit(2);
}
s.branch = s.branch || `agent/${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
s.body = s.body || "Automated PR via scripts/_pr_push.mjs";
s.phase = s.phase || "init";
saveState(s);

console.log(`[pr-push] branch=${s.branch} files=${s.files.length} title="${s.title}" phase=${s.phase}`);

// ── SOT-3 baseline guard ───────────────────────────────────────────────
// Refuses the push BEFORE any remote mutation if any file in state.files
// matches the FINDING-003 corrupt-path class, KEEP_LOCAL_NEVER_PUSH, or
// fails the remote-baseline check. See scripts/_pr_push_baseline.mjs.
// Skippable only with PR_PUSH_SKIP_BASELINE=1 (logged, not silent).
if (process.env.PR_PUSH_SKIP_BASELINE === "1") {
  console.warn(`[pr-push] ⚠ PR_PUSH_SKIP_BASELINE=1 → baseline guard bypassed (logged, not recommended)`);
} else {
  console.log(`[pr-push] baseline guard: checking ${s.files.length} file(s) against remote main…`);
  const baseline = await validatePush({ owner: OWNER, repo: REPO, files: s.files, gh });
  if (!baseline.ok) {
    console.error(`\n[pr-push] ✗ baseline guard REFUSED push (${baseline.violations.length} violation(s)):\n`);
    for (const v of baseline.violations) {
      console.error(`  ✗ ${v.file}`);
      console.error(`    category: ${v.category}`);
      console.error(`    reason:   ${v.reason}`);
      console.error(`    fix:      ${v.howToFix}\n`);
    }
    console.error(`[pr-push] no branch created, no files uploaded, no PR opened. State at ${STATE} unchanged.`);
    console.error(`[pr-push] to bypass (NOT recommended): export PR_PUSH_SKIP_BASELINE=1`);
    process.exit(5);
  }
  console.log(`[pr-push] ✓ baseline guard PASS`);
}

// Short-circuit: a previous run already completed.
if (s.phase === "done") {
  console.log(`[pr-push] state.phase=done — nothing to do. Delete ${STATE} to start a new run.`);
  process.exit(0);
}

// ── 1. Resolve main SHA ─────────────────────────────────────────────────
if (!s.mainSha) {
  const r = await gh(`/repos/${OWNER}/${REPO}/branches/main`);
  if (r.status !== 200) {
    console.error(`[pr-push] cannot read main: ${r.status} ${r.data?.message}`);
    process.exit(1);
  }
  s.mainSha = r.data.commit.sha;
  s.phase = "main-resolved";
  console.log(`[pr-push] main SHA: ${s.mainSha.slice(0,8)}`);
  saveState(s);
}

// ── 2. Create feature branch (idempotent) ──────────────────────────────
if (!s.branchCreated) {
  const exists = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${s.branch}`);
  if (exists.status === 200) {
    console.log(`[pr-push] branch ${s.branch} already exists — reusing`);
  } else {
    const cr = await gh(`/repos/${OWNER}/${REPO}/git/refs`, "POST", {
      ref: `refs/heads/${s.branch}`,
      sha: s.mainSha,
    });
    if (cr.status < 200 || cr.status >= 300) {
      console.error(`[pr-push] branch create failed: ${cr.status} ${cr.data?.message}`);
      process.exit(1);
    }
    console.log(`[pr-push] created branch ${s.branch}`);
  }
  s.branchCreated = true;
  s.phase = "branch-created";
  saveState(s);
}

// ── 3. Upload each file to the branch ──────────────────────────────────
s.uploaded = s.uploaded || [];
const remaining = s.files.filter(f => !s.uploaded.includes(f));
console.log(`[pr-push] uploading ${remaining.length}/${s.files.length} files…`);

// Detect the "Replit GitHub App is missing the Workflows permission" class:
// reads of `.github/workflows/*` come back as 403 (not 404) before we even
// attempt the PUT. Without this branch the user sees a generic
// `403 undefined` and has to guess whether it's rate-limit, auth, or scope.
function isWorkflowPath(rel) {
  return rel.startsWith(".github/workflows/");
}
function explainWorkflowScopeFailure(rel, status, message) {
  console.error("");
  console.error(`[pr-push] ✗ ${rel}: ${status} ${message || "(no message)"}`);
  console.error(`[pr-push] This path is under .github/workflows/ and the Replit GitHub App`);
  console.error(`[pr-push] does not currently have the "Workflows" permission on this repo.`);
  console.error(`[pr-push] Without it, GitHub returns 403 on BOTH read and write of workflow`);
  console.error(`[pr-push] files (this script just confirmed read also fails — same scope).`);
  console.error(`[pr-push]`);
  console.error(`[pr-push] To fix (one-time, ~30 seconds, has to be done by a repo admin in the`);
  console.error(`[pr-push] GitHub UI — no API can grant this):`);
  console.error(`[pr-push]   1. Open https://github.com/apps/replit/installations/new`);
  console.error(`[pr-push]      (or: github.com → Settings → Applications → Replit → Configure)`);
  console.error(`[pr-push]   2. Pick the barhom64/ghayth-erp repo.`);
  console.error(`[pr-push]   3. Under "Repository permissions" set "Workflows" to "Read and write".`);
  console.error(`[pr-push]   4. Save / Install. (No Replit-side reconnect needed — the SDK picks`);
  console.error(`[pr-push]      up the new scope on the next request.)`);
  console.error(`[pr-push]   5. Re-run this script — state at ${STATE} is resumable, so the`);
  console.error(`[pr-push]      already-uploaded files are skipped.`);
  console.error(`[pr-push]`);
  console.error(`[pr-push] If the toggle is already on and you still see this, drop the workflow`);
  console.error(`[pr-push] file from state.files and edit it directly on github.com as a one-off.`);
}

for (const rel of remaining) {
  const full = path.join(BASE, rel);
  if (!fs.existsSync(full)) {
    console.error(`  ✗ ${rel}: local file missing — refusing to silently skip. ` +
      `Either remove it from state.files and re-run, or restore the file.`);
    process.exit(1);
  }
  const content = fs.readFileSync(full).toString("base64");
  // Get current sha on the branch (NOT main) for this path
  const ge = await gh(
    `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel).replace(/%2F/g, "/")}?ref=${s.branch}`,
  );
  // A 403 on a .github/workflows/* read is the unmistakable signature of the
  // missing-Workflows-scope class — bail out with the actionable message
  // BEFORE we try the PUT (which would just produce a second, identical 403).
  if (ge.status === 403 && isWorkflowPath(rel)) {
    explainWorkflowScopeFailure(rel, ge.status, ge.data?.message);
    process.exit(4);
  }
  const sha = ge.status === 200 ? ge.data.sha : undefined;
  const body = {
    message: `${s.title}: ${rel}`,
    content,
    branch: s.branch,
  };
  if (sha) body.sha = sha;
  const r = await gh(
    `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(rel).replace(/%2F/g, "/")}`,
    "PUT",
    body,
  );
  if (r.status >= 200 && r.status < 300) {
    console.log(`  ✓ ${rel}`);
    s.uploaded.push(rel);
    saveState(s);
  } else if (r.status === 403 && isWorkflowPath(rel)) {
    // Read might have succeeded (cached / different code path) but write
    // still hits the same scope wall — handle it the same way.
    explainWorkflowScopeFailure(rel, r.status, r.data?.message);
    process.exit(4);
  } else {
    console.error(`  ✗ ${rel}: ${r.status} ${r.data?.message}`);
    process.exit(1);
  }
  await new Promise(res => setTimeout(res, 250));
}
s.phase = "files-uploaded";
saveState(s);

// ── 4. Open PR (idempotent — handles open AND closed PRs on same head) ──
if (!s.prNumber) {
  // Search both open and closed (state=all) so a previously-closed PR on
  // the same head branch is reused (re-opening it) instead of producing
  // a 422 "A pull request already exists for …" on POST /pulls.
  const existing = await gh(`/repos/${OWNER}/${REPO}/pulls?head=${OWNER}:${s.branch}&state=all`);
  if (existing.status === 200 && Array.isArray(existing.data) && existing.data.length > 0) {
    const pr = existing.data[0];
    s.prNumber = pr.number;
    if (pr.state === "closed" && !pr.merged_at) {
      const reopen = await gh(`/repos/${OWNER}/${REPO}/pulls/${pr.number}`, "PATCH", { state: "open" });
      if (reopen.status >= 200 && reopen.status < 300) {
        console.log(`[pr-push] re-opened previously-closed PR #${pr.number}`);
      } else {
        console.error(`[pr-push] could not re-open closed PR #${pr.number}: ${reopen.status} ${reopen.data?.message}`);
        process.exit(1);
      }
    } else if (pr.merged_at) {
      console.error(`[pr-push] PR #${pr.number} on head ${s.branch} is already merged. ` +
        `Delete ${STATE} and start a new run with a different branch.`);
      process.exit(1);
    } else {
      console.log(`[pr-push] reusing open PR #${s.prNumber}`);
    }
  } else {
    const pr = await gh(`/repos/${OWNER}/${REPO}/pulls`, "POST", {
      title: s.title,
      head: s.branch,
      base: "main",
      body: s.body,
    });
    if (pr.status < 200 || pr.status >= 300) {
      console.error(`[pr-push] PR open failed: ${pr.status} ${pr.data?.message}`);
      process.exit(1);
    }
    s.prNumber = pr.data.number;
    console.log(`[pr-push] opened PR #${s.prNumber}: ${pr.data.html_url}`);
  }
  s.phase = "pr-opened";
  saveState(s);
}

// ── 5. Poll guard signal (check-runs + commit statuses) ────────────────
// The required status check is named "guard" in the ruleset, but GitHub
// can surface it as either:
//   (a) a check_run from Actions (preferred — `name === "guard"`),
//   (b) a check_run from a job-matrix variant (`name` like "guard / xyz"),
//   (c) a legacy commit status (`context === "guard"`).
// We accept ANY of those so a re-named workflow file or a status-API
// integration doesn't silently get treated as missing.
const GUARD_NAMES = new Set(["guard"]);
function matchesGuard(name) {
  if (!name) return false;
  if (GUARD_NAMES.has(name)) return true;
  // job-matrix variant: "guard / something"
  return name.split("/")[0].trim() === "guard";
}

console.log(`[pr-push] polling guard signal every ${POLL_MS/1000}s (max ${MAX_POLL_MIN} min)…`);
const deadline = Date.now() + MAX_POLL_MIN * 60_000;
let guardConclusion = null;
let lastHeadSha = null;
let pollCount = 0;

while (Date.now() < deadline) {
  pollCount++;
  // Refresh PR to pick up the latest head SHA
  const pr = await gh(`/repos/${OWNER}/${REPO}/pulls/${s.prNumber}`);
  if (pr.status !== 200) {
    console.error(`  poll ${pollCount}: PR fetch failed: ${pr.status} — retrying`);
    await new Promise(r => setTimeout(r, POLL_MS));
    continue;
  }
  const headSha = pr.data.head.sha;
  if (headSha !== lastHeadSha) {
    console.log(`  poll ${pollCount}: head=${headSha.slice(0,8)}`);
    lastHeadSha = headSha;
  }

  // Source 1: check-runs (Actions)
  const checks = await gh(`/repos/${OWNER}/${REPO}/commits/${headSha}/check-runs`);
  let signal = null;
  if (checks.status === 200) {
    const runs = checks.data.check_runs || [];
    const guard = runs.find(r => matchesGuard(r.name));
    if (guard) {
      signal = { source: "check-run", name: guard.name, status: guard.status, conclusion: guard.conclusion };
    }
  }
  // Source 2: legacy commit statuses (e.g. third-party CI)
  if (!signal) {
    const sts = await gh(`/repos/${OWNER}/${REPO}/commits/${headSha}/statuses`);
    if (sts.status === 200 && Array.isArray(sts.data)) {
      const guard = sts.data.find(s => matchesGuard(s.context));
      if (guard) {
        // commit status `state` is one of: pending|success|failure|error
        const status = guard.state === "pending" ? "in_progress" : "completed";
        const conclusion = guard.state === "pending" ? null
          : (guard.state === "success" ? "success" : "failure");
        signal = { source: "status", name: guard.context, status, conclusion };
      }
    }
  }

  if (!signal) {
    if (pollCount % 4 === 0) console.log(`  poll ${pollCount}: no guard signal yet`);
  } else {
    console.log(`  poll ${pollCount}: guard via ${signal.source}: status=${signal.status} conclusion=${signal.conclusion || "(pending)"}`);
    if (signal.status === "completed") {
      guardConclusion = signal.conclusion;
      break;
    }
  }
  await new Promise(r => setTimeout(r, POLL_MS));
}

if (guardConclusion !== "success") {
  const reason = guardConclusion === null
    ? "no guard signal arrived within the polling window — check that .github/workflows/guard.yml is present on the PR head and Actions is enabled"
    : `conclusion=${guardConclusion}`;
  console.error(`[pr-push] guard did not succeed: ${reason}. Aborting merge.`);
  console.error(`[pr-push] inspect PR: https://github.com/${OWNER}/${REPO}/pull/${s.prNumber}`);
  process.exit(1);
}
console.log(`[pr-push] ✅ guard passed — merging…`);
s.phase = "guard-passed";
saveState(s);

// ── 6. Squash-merge (with optimistic-lock SHA to avoid race) ───────────
if (!s.merged) {
  // Re-fetch the PR head SHA right before merging so a concurrent push
  // surfaces as a 405/409 instead of silently merging the wrong commit.
  const prFresh = await gh(`/repos/${OWNER}/${REPO}/pulls/${s.prNumber}`);
  const headSha = prFresh.data?.head?.sha;
  const m = await gh(`/repos/${OWNER}/${REPO}/pulls/${s.prNumber}/merge`, "PUT", {
    merge_method: "squash",
    commit_title: s.title,
    commit_message: s.body,
    sha: headSha, // optimistic lock — GitHub rejects merge if head moved
  });
  if (m.status < 200 || m.status >= 300) {
    console.error(`[pr-push] merge failed: ${m.status} ${m.data?.message}`);
    process.exit(1);
  }
  s.merged = true;
  s.mergeSha = m.data.sha;
  s.phase = "merged";
  saveState(s);
  console.log(`[pr-push] ✅ merged as ${m.data.sha?.slice(0,8)}`);
}

// ── 7. Delete branch ───────────────────────────────────────────────────
const del = await gh(`/repos/${OWNER}/${REPO}/git/refs/heads/${s.branch}`, "DELETE");
if (del.status >= 200 && del.status < 300) {
  console.log(`[pr-push] deleted branch ${s.branch}`);
} else {
  console.log(`[pr-push] branch delete returned ${del.status} (non-fatal)`);
}

s.phase = "done";
saveState(s);
console.log(`[pr-push] DONE.`);
