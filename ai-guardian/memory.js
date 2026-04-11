import fs from 'fs';
import path from 'path';

const memoryDir = path.resolve(process.cwd(), 'ai-guardian-data');
const memoryFile = path.join(memoryDir, 'memory.json');

function ensureMemory() {
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  if (!fs.existsSync(memoryFile)) {
    fs.writeFileSync(memoryFile, JSON.stringify({ history: [], patterns: [], lastUpdatedAt: null }, null, 2));
  }
}

export function loadMemory() {
  ensureMemory();
  try {
    return JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
  } catch {
    return { history: [], patterns: [], lastUpdatedAt: null };
  }
}

export function saveAuditResult(entry) {
  const memory = loadMemory();
  memory.history.unshift({
    ...entry,
    createdAt: new Date().toISOString(),
  });
  memory.history = memory.history.slice(0, 100);
  memory.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
  return memory;
}

export function savePatterns(patterns = []) {
  const memory = loadMemory();
  const merged = [...memory.patterns, ...patterns]
    .filter(Boolean)
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);

  memory.patterns = Array.from(new Set(merged)).slice(0, 200);
  memory.lastUpdatedAt = new Date().toISOString();
  fs.writeFileSync(memoryFile, JSON.stringify(memory, null, 2));
  return memory;
}
