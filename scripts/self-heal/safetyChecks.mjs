// Validates a proposed patch against allow/block lists and rate limits.

export function validateProposal({ proposal, config, fixesLastDay, fixesLastHour }) {
  const errors = [];
  const warnings = [];

  if (fixesLastDay >= config.rateLimit.maxFixesPerDay) {
    errors.push(`rate-limit: ${fixesLastDay} fixes in last 24h ≥ max ${config.rateLimit.maxFixesPerDay}`);
  }
  if (fixesLastHour >= config.rateLimit.maxFixesPerHour) {
    errors.push(`rate-limit: ${fixesLastHour} fixes in last 1h ≥ max ${config.rateLimit.maxFixesPerHour}`);
  }

  if (!Array.isArray(proposal.files) || proposal.files.length === 0) {
    errors.push("proposal.files is empty");
  }

  const allowRe = (config.allowList.filePathPatterns || []).map((s) => new RegExp(s));
  const blockPathRe = (config.blockList.filePathPatterns || []).map((s) => new RegExp(s));
  const blockContentRe = (config.blockList.patchContentPatterns || []).map((s) => new RegExp(s, "i"));

  for (const f of proposal.files || []) {
    if (typeof f.path !== "string" || typeof f.content !== "string") {
      errors.push(`file entry malformed: ${JSON.stringify(f).slice(0, 120)}`);
      continue;
    }
    if (!allowRe.some((re) => re.test(f.path))) {
      errors.push(`path not in allow-list: ${f.path}`);
    }
    if (blockPathRe.some((re) => re.test(f.path))) {
      errors.push(`path matches block-list: ${f.path}`);
    }
    for (const re of blockContentRe) {
      if (re.test(f.content)) {
        errors.push(`content matches block-list pattern ${re.source} in ${f.path}`);
      }
    }
    if (f.content.length > 200_000) {
      errors.push(`file too large (${f.content.length} bytes): ${f.path}`);
    }
  }

  if (proposal.riskLevel && !["low", "medium", "high"].includes(proposal.riskLevel)) {
    warnings.push(`unknown riskLevel: ${proposal.riskLevel}`);
  }
  if (proposal.riskLevel === "high") {
    errors.push("riskLevel=high — refusing to auto-apply");
  }

  return { ok: errors.length === 0, errors, warnings };
}
