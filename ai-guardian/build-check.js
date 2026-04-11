import { execSync } from 'child_process';

function run(cmd, timeout = 60000) {
  try {
    const out = execSync(cmd, { stdio: 'pipe', timeout, cwd: process.cwd() }).toString();
    return { ok: true, output: out.slice(-2000) };
  } catch (e) {
    return { ok: false, output: (e.stdout?.toString() || e.message).slice(-2000) };
  }
}

export function runBuildChecks() {
  const results = {};

  results.nodeVersion = process.version;

  results.backendTypeCheck = run('pnpm --filter @workspace/api-server exec tsc --noEmit --skipLibCheck 2>&1 | tail -30', 90000);
  results.frontendTypeCheck = run('pnpm --filter @workspace/ghayth-erp exec tsc --noEmit --skipLibCheck 2>&1 | tail -30', 90000);

  return results;
}
