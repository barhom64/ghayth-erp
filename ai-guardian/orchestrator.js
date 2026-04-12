import { scanProjectStructure } from './project-scan.js';
import { runBuildChecks } from './build-check.js';
import { runSystemAudit } from './claude.js';
import { saveAuditResult, loadMemory } from './memory.js';

async function run() {
  console.log('AI Guardian proactive scan starting...');

  const structure = scanProjectStructure();
  const build = runBuildChecks();
  const memory = loadMemory();

  const context = JSON.stringify({
    structure,
    build,
    history: memory.history.slice(0, 5),
  });

  const result = await runSystemAudit({
    issueDescription: 'تحليل استباقي كامل للنظام واكتشاف الأخطاء والنواقص والتعارضات',
    context,
  });

  console.log('=== AI GUARDIAN REPORT ===');
  console.log(result);

  saveAuditResult({
    summary: result,
    structure,
    build,
  });
}

run().catch(console.error);
