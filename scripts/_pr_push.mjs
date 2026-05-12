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

import { ReplitConnectors } from "@replit/connectors-sdk";
import fs from "fs";
import path from "path";

const OWNER = "barhom64";
const REPO = "ghayth-erp";
const BASE = "/home/runner/workspace";
const STATE = process.env.PR_PUSH_STATE || "/tmp/_pr_push_state.json";
const POLL_MS = 30_000;
const MAX_POLL_MIN = 25;

const c = new ReplitConnectors();

async function gh(ep, method = "GET", body = null) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  for (let r = 0; r < 5; r++) {
    try {
      const res = await c.proxy("github", ep, opts);
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = { _raw: text }; }
      if (res.status >= 200 && res.status < 300) return { status: res.status, data };
      if (res.status === 404 && method === "GET") return { status: 404, data };
      if (res.status === 422) return { status: 422, data };
      console.log(`  retry ${r+1}/5 ${method} ${ep.slice(0,80)}: ${res.status} ${(data?.message || "").slice(0,100)}`);
      await new Promise(s => setTimeout(s, 2000 * (r + 1)));
    } catch (e) {
      console.log(`  retry ${r+1}/5 err: ${e.message}`);
      await new Promise(s => setTimeout(s, 2000 * (r + 1)));
    }
  }
  return { status: 0, data: { message: "exhausted retries" } };
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
