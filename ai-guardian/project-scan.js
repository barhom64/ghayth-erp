import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.cache', '.local', '.config', '.upm', 'ai-guardian-data']);
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, results = [], depth = 0) {
  if (!fs.existsSync(dir) || depth > 6) return results;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, results, depth + 1);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) {
      results.push(fullPath);
    }
  }

  return results;
}

function safeRead(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

export function scanProjectStructure(rootDir = process.cwd()) {
  const files = walk(rootDir, []);

  const summary = {
    totalFiles: files.length,
    serverFiles: [],
    routeFiles: [],
    pageFiles: [],
    componentFiles: [],
    configFiles: [],
    suspiciousFiles: [],
  };

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    const name = path.basename(file).toLowerCase();
    const rel = path.relative(rootDir, file);

    if (normalized.includes('/routes/') || name.includes('router')) summary.routeFiles.push(rel);
    else if (normalized.includes('/pages/')) summary.pageFiles.push(rel);
    else if (normalized.includes('/components/')) summary.componentFiles.push(rel);
    else if (normalized.includes('server') || normalized.includes('/src/index')) summary.serverFiles.push(rel);

    const content = safeRead(file);
    if (content.includes('TODO') || content.includes('FIXME') || content.includes('HACK')) {
      summary.suspiciousFiles.push(rel);
    }
  }

  return summary;
}
