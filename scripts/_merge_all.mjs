#!/usr/bin/env node
import { ReplitConnectors } from '@replit/connectors-sdk';
import fs from 'fs';

const sdk = new ReplitConnectors();
const REPO = 'barhom64/ghayth-erp';
const STATE_FILE = '/tmp/_merge_all_state.json';

const log = (...a) => { const s = `[merge-all ${new Date().toISOString().slice(11,19)}] ${a.join(' ')}`; console.log(s); fs.appendFileSync('/tmp/_merge_all.log', s + '\n'); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gh(path, method = 'GET', body) {
  const opts = { method };
  if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers = { 'content-type': 'application/json' }; }
  for (let i = 0; i < 4; i++) {
    try {
      const r = await sdk.proxy('github', path, opts);
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: r.status, data };
    } catch (e) { if (i === 3) throw e; await sleep(2000); }
  }
}

async function listOpenPRs() {
  const { data } = await gh(`/repos/${REPO}/pulls?state=open&per_page=50`);
  return data.map(p => ({ number: p.number, title: p.title, head_ref: p.head.ref, head_sha: p.head.sha }));
}

async function getPR(num) {
  const { data } = await gh(`/repos/${REPO}/pulls/${num}`);
  return data;
}

async function getGuard(sha) {
  const { data } = await gh(`/repos/${REPO}/commits/${sha}/check-runs`);
  return (data.check_runs || []).find(c => c.name === 'guard');
}

async function updateBranch(num) {
  const { status, data } = await gh(`/repos/${REPO}/pulls/${num}/update-branch`, 'PUT', {});
  return { status, data };
}

async function squashMerge(num, sha, title) {
  const { status, data } = await gh(`/repos/${REPO}/pulls/${num}/merge`, 'PUT', {
    merge_method: 'squash',
    sha,
    commit_title: `${title} (#${num})`,
  });
  return { status, data };
}

async function deleteBranch(ref) {
  const { status } = await gh(`/repos/${REPO}/git/refs/heads/${ref}`, 'DELETE');
  return status;
}

// State for resumability
function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { done: [], failed: [], skipped: [] }; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// Wait for guard (max 25 min)
async function waitGuard(num, headSha, label) {
  const deadline = Date.now() + 25 * 60 * 1000;
  let lastSha = headSha;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const pr = await getPR(num);
    if (pr.head.sha !== lastSha) {
      log(`  #${num} head moved ${lastSha.slice(0,8)}→${pr.head.sha.slice(0,8)}`);
      lastSha = pr.head.sha;
    }
    const g = await getGuard(lastSha);
    const gs = g ? `${g.status}/${g.conclusion || '-'}` : '(no guard)';
    log(`  #${num} ${label} poll ${attempt}: head=${lastSha.slice(0,8)} guard=${gs}`);
    if (g && g.status === 'completed') return { sha: lastSha, conclusion: g.conclusion };
    await sleep(30 * 1000);
  }
  return { sha: lastSha, conclusion: 'timeout' };
}

async function processPR(p, state) {
  if (state.done.includes(p.number) || state.failed.includes(p.number) || state.skipped.includes(p.number)) {
    log(`SKIP #${p.number} already processed`); return;
  }
  log(`\n========== #${p.number}: ${p.title.slice(0,80)} ==========`);
  let pr = await getPR(p.number);
  if (pr.merged) { log(`  already merged`); state.done.push(p.number); saveState(state); return; }
  if (pr.state !== 'open') { log(`  state=${pr.state}, skipping`); state.skipped.push(p.number); saveState(state); return; }

  // Step 1: ensure branch is up-to-date with main
  if (pr.mergeable_state === 'behind' || pr.mergeable_state === 'unknown') {
    log(`  state=${pr.mergeable_state} → updating branch from main…`);
    const { status, data } = await updateBranch(p.number);
    if (status >= 200 && status < 300) {
      log(`  ✓ update-branch ok`);
      await sleep(5000);
    } else if (status === 422 && /up to date|no commits|conflict/i.test(JSON.stringify(data))) {
      log(`  update-branch: ${status} (likely already up-to-date or conflict): ${JSON.stringify(data).slice(0,200)}`);
    } else {
      log(`  ✗ update-branch failed ${status}: ${JSON.stringify(data).slice(0,300)}`);
      state.failed.push(p.number); saveState(state); return;
    }
    pr = await getPR(p.number);
    if (pr.mergeable === false) {
      log(`  ✗ MERGE CONFLICT after update — manual resolution needed`);
      state.failed.push(p.number); saveState(state); return;
    }
  }

  // Step 2: wait for guard
  log(`  waiting for guard… (head=${pr.head.sha.slice(0,8)})`);
  const { sha, conclusion } = await waitGuard(p.number, pr.head.sha, 'guard');
  if (conclusion !== 'success') {
    log(`  ✗ guard ${conclusion} — skipping merge`);
    state.failed.push(p.number); saveState(state); return;
  }
  log(`  ✓ guard success`);

  // Step 3: merge
  pr = await getPR(p.number);
  if (!pr.mergeable) {
    log(`  ✗ not mergeable (mergeable=${pr.mergeable} state=${pr.mergeable_state})`);
    state.failed.push(p.number); saveState(state); return;
  }
  const { status, data } = await squashMerge(p.number, sha, pr.title);
  if (status >= 200 && status < 300) {
    log(`  ✓ MERGED as ${data.sha?.slice(0,8)}`);
    state.done.push(p.number); saveState(state);
    try { await deleteBranch(p.head.ref); log(`  ✓ deleted branch ${p.head.ref}`); } catch (e) { log(`  branch delete: ${e.message}`); }
  } else {
    log(`  ✗ merge failed ${status}: ${JSON.stringify(data).slice(0,300)}`);
    state.failed.push(p.number); saveState(state);
  }
}

async function runOnce() {
  const state = loadState();
  // Process every actually-open PR, oldest first (safest: gives older PRs a chance to land before newer rebases churn the tree)
  const open = await listOpenPRs();
  const ordered = [...open].sort((a, b) => a.number - b.number);
  log(`found ${open.length} open PRs: ${ordered.map(p => p.number).join(',') || '(none)'}`);

  if (open.length === 0) return { merged: 0, failed: 0 };

  let merged = 0, failed = 0;
  for (const p of ordered) {
    if (state.done.includes(p.number) || state.failed.includes(p.number)) continue;
    try {
      const beforeDone = state.done.length, beforeFailed = state.failed.length;
      await processPR(p, state);
      if (state.done.length > beforeDone) merged++;
      if (state.failed.length > beforeFailed) failed++;
    } catch (e) {
      log(`#${p.number} ERROR: ${e.message}`);
      state.failed.push(p.number); saveState(state);
      failed++;
    }
  }
  return { merged, failed };
}

async function main() {
  fs.writeFileSync('/tmp/_merge_all.log', '');
  const watch = process.argv.includes('--watch');
  const intervalMs = 120 * 1000; // poll every 2 minutes in watch mode
  log(`starting merge orchestrator${watch ? ' (watch mode, interval=120s)' : ''}`);
  const state = loadState();
  log(`resumed state: done=[${state.done}] failed=[${state.failed}] skipped=[${state.skipped}]`);

  do {
    try {
      const { merged, failed } = await runOnce();
      log(`pass complete: +${merged} merged, +${failed} failed this pass`);
    } catch (e) {
      log(`pass ERROR: ${e.message}`);
    }
    if (watch) {
      // Reset transient failed list each pass so flaky PRs get retried
      const s = loadState(); s.failed = []; saveState(s);
      await sleep(intervalMs);
    }
  } while (watch);

  const final = loadState();
  log('\n=========== FINAL ===========');
  log(`✓ merged: ${final.done.join(',') || '(none)'}`);
  log(`✗ failed: ${final.failed.join(',') || '(none)'}`);
  log(`⊘ skipped: ${final.skipped.join(',') || '(none)'}`);
  log('done.');
}

main().catch(e => { log(`FATAL: ${e.stack || e.message}`); process.exit(1); });
