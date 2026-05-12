#!/usr/bin/env node
import fs from 'node:fs';
import { ReplitConnectors } from '@replit/connectors-sdk';

const STATE = '/tmp/_merge_all_state.json';
const CLOSED_LOG = '/tmp/_bulk_close_log.json';
const c = new ReplitConnectors();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gh(ep, opts) {
  const r = await c.proxy('github', ep, opts || { method: 'GET' });
  const t = await r.text();
  return { status: r.status, body: t ? (() => { try { return JSON.parse(t); } catch { return t; } })() : null };
}

async function postComment(num, body) {
  return gh(`/repos/barhom64/ghayth-erp/issues/${num}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function closePR(num) {
  return gh(`/repos/barhom64/ghayth-erp/pulls/${num}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
    headers: { 'Content-Type': 'application/json' },
  });
}

async function deleteBranch(ref) {
  return gh(`/repos/barhom64/ghayth-erp/git/refs/heads/${ref}`, { method: 'DELETE' });
}

async function getPR(num) {
  const r = await gh(`/repos/barhom64/ghayth-erp/pulls/${num}`);
  return r.body;
}

function loadClosedLog() {
  try { return new Set(JSON.parse(fs.readFileSync(CLOSED_LOG, 'utf8'))); } catch { return new Set(); }
}
function saveClosedLog(s) {
  fs.writeFileSync(CLOSED_LOG, JSON.stringify([...s], null, 2));
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const failed = state.failed || [];
  const closed = loadClosedLog();
  console.log(`[bulk-close] failed list: ${failed.length} PRs, already-closed: ${closed.size}`);
  let done = 0, skipped = 0, errors = 0;
  for (const num of failed) {
    if (closed.has(num)) { skipped++; continue; }
    try {
      const pr = await getPR(num);
      if (!pr || pr.state !== 'open') {
        console.log(`#${num} already ${pr ? pr.state : 'gone'} — recording as closed`);
        closed.add(num); saveClosedLog(closed); skipped++; continue;
      }
      const reason = `**إغلاق تلقائي:** هذا PR لم ينجح في bulk-merge sweep (الفرع متعارض/guard فشل/الفرع متخلّف عن main). تم إغلاقه وحذف فرعه لتنظيف الـ backlog. لو التغيير لا يزال مطلوباً، أعد فتحه عبر فرع جديد من main الحالي.`;
      const cm = await postComment(num, reason);
      const cl = await closePR(num);
      let delStatus = 'n/a';
      const ref = pr.head?.ref;
      if (ref && ref !== 'main' && !ref.startsWith('release/')) {
        const dr = await deleteBranch(ref);
        delStatus = String(dr.status);
      }
      console.log(`#${num}: comment=${cm.status} close=${cl.status} delete-branch(${ref})=${delStatus}`);
      closed.add(num); saveClosedLog(closed); done++;
      await sleep(500); // gentle on API
    } catch (e) {
      console.log(`#${num} ERROR: ${e.message}`);
      errors++;
    }
  }
  console.log(`[bulk-close] DONE: closed=${done} already-closed=${skipped} errors=${errors}`);
}

async function watch() {
  const intervalMs = 90 * 1000;
  let consecutiveEmpty = 0;
  while (true) {
    try { await main(); } catch (e) { console.error('[bulk-close] pass error:', e.message); }
    // exit after 5 consecutive empty passes (queue drained)
    const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const closed = loadClosedLog();
    const remaining = (state.failed || []).filter((n) => !closed.has(n)).length;
    if (remaining === 0) consecutiveEmpty++;
    else consecutiveEmpty = 0;
    console.log(`[bulk-close] sleep 90s (remaining=${remaining}, empty-streak=${consecutiveEmpty}/5)`);
    if (consecutiveEmpty >= 5) {
      console.log('[bulk-close] queue stable & empty — exiting watch loop');
      break;
    }
    await sleep(intervalMs);
  }
}

const isWatch = process.argv.includes('--watch');
(isWatch ? watch() : main()).catch((e) => { console.error(e); process.exit(1); });
