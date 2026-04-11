import express from 'express';
import { runSystemAudit } from './claude.js';

const router = express.Router();

router.post('/system-audit', async (req, res) => {
  try {
    const body = req.body || {};
    const result = await runSystemAudit({
      issueDescription: body.issueDescription,
      codeSnippet: body.codeSnippet,
      logs: body.logs,
      context: body.context,
    });

    res.json({ ok: true, result });
  } catch (error) {
    console.error('AI Guardian Error:', error);
    res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
});

export default router;
