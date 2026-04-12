import { runSystemAudit } from './claude.js';
import { loadMemory, saveAuditResult } from './memory.js';

async function run() {
  console.log('AI Guardian running...');

  const memory = loadMemory();

  const context = JSON.stringify({
    pastIssues: memory.history.slice(0, 5),
    patterns: memory.patterns,
  });

  const result = await runSystemAudit({
    issueDescription: 'تحليل شامل للنظام واكتشاف الأخطاء والنواقص والتعارضات',
    context,
  });

  console.log('AI Guardian Result:', result);

  saveAuditResult({
    summary: result,
  });
}

run().catch(console.error);
