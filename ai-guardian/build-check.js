import { execSync } from 'child_process';

function run(cmd) {
  try {
    const out = execSync(cmd, { stdio: 'pipe' }).toString();
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: e.stdout?.toString() || e.message };
  }
}

export function runBuildChecks() {
  const results = {};

  results.nodeVersion = process.version;

  results.npmInstall = run('npm install --silent');

  results.lint = run('npm run lint');
  results.build = run('npm run build');
  results.test = run('npm test');

  return results;
}
