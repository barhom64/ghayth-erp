import fs from 'fs';
import path from 'path';

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.md']);

function walk(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, results);
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
    componentFiles: [],
    configFiles: [],
    suspiciousFiles: [],
  };

  for (const file of files) {
    const normalized = file.replace(/\\/g, '/');
    const name = path.basename(file).toLowerCase();

    if (name.includes('server') || name.includes('app')) summary.serverFiles.push(normalized);
    if (normalized.includes('/route') || normalized.includes('/routes/')) summary.routeFiles.push(normalized);
    if (normalized.includes('/component') || normalized.includes('/components/')) summary.componentFiles.push(normalized);
    if (name === 'package.json' || name.includes('vite') || name.includes('tsconfig') || name.includes('.replit')) summary.configFiles.push(normalized);

    const content = safeRead(file);
    if (content.includes('TODO') || content.includes('FIXME') || content.includes('placeholder')) {
      summary.suspiciousFiles.push(normalized);
    }
  }

  return summary;
}
