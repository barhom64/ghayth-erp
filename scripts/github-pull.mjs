#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ReplitConnectors } from '@replit/connectors-sdk';

const REPO = 'barhom64/ghayth-erp';
const BASE = '9833ed0c';
const HEAD = 'b4542717';
const ROOT = process.cwd();

const c = new ReplitConnectors();

async function gh(p) {
  const r = await c.proxy('github', p, { method: 'GET' });
  const t = await r.text();
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}: ${t.substring(0,200)}`);
  return JSON.parse(t);
}

async function ghRaw(sha) {
  const r = await c.proxy('github', `/repos/${REPO}/git/blobs/${sha}`, { method: 'GET' });
  if (!r.ok) throw new Error(`blob ${sha} -> ${r.status}`);
  const d = JSON.parse(await r.text());
  return Buffer.from(d.content, 'base64');
}

async function getDiff() {
  const all = [];
  let page = 1;
  while (true) {
    const d = await gh(`/repos/${REPO}/compare/${BASE}...${HEAD}?per_page=300&page=${page}`);
    if (!d.files || d.files.length === 0) break;
    all.push(...d.files);
    if (d.files.length < 300) break;
    page++;
  }
  return all;
}

const files = await getDiff();
console.log(`changed files: ${files.length}`);

const stats = { added: 0, modified: 0, removed: 0, renamed: 0, failed: [] };

for (const f of files) {
  const target = path.join(ROOT, f.filename);
  try {
    if (f.status === 'removed') {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      stats.removed++;
    } else if (f.status === 'renamed') {
      const prev = path.join(ROOT, f.previous_filename);
      if (fs.existsSync(prev)) fs.unlinkSync(prev);
      const buf = await ghRaw(f.sha);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      stats.renamed++;
    } else {
      const buf = await ghRaw(f.sha);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf);
      if (f.status === 'added') stats.added++; else stats.modified++;
    }
    process.stdout.write('.');
  } catch (e) {
    stats.failed.push({ file: f.filename, err: e.message });
    process.stdout.write('x');
  }
}
console.log('\n', stats);
if (stats.failed.length) console.log('failed:', stats.failed.slice(0,10));
