#!/usr/bin/env node
//
// scripts/src/check-hooks-rules.mjs
//
// React "Rules of Hooks" guard. Catches the runtime crash class:
//
//     Error: Rendered more hooks than during the previous render.
//
// A React Hook (useState / useEffect / useMemo / a custom use*… ) MUST be
// called unconditionally, at the top level of a component or another hook, and
// BEFORE any early `return`. When a hook is called conditionally — after an
// early `return`, inside an `if`/loop/ternary, or in a plain helper function —
// the number of hooks differs between renders and React throws, blanking the
// whole page. typecheck / build pass; it only manifests at runtime (the
// expenses-create / exempt-pilgrims / org-model incidents — #hooks-rules).
//
// The project ships NO eslint, so this reuses the existing custom-scanner
// convention (a sibling of check-usememo-setstate) but parses a real AST via
// the bundled `typescript` compiler so detection is exact, not regex-guessed.
//
// Detected violations (the three real bug classes + general safety):
//   A. a hook called in a function that is NEITHER a component (Uppercase name)
//      NOR a custom hook (use*Name) — e.g. `function api(){ return useQuery() }`
//   B. a hook called AFTER an early `return`/`throw` at the component's top level
//   C. a hook called INSIDE a conditional/loop (if / for / while / switch /
//      ?: / && / ||) within the component
//
// Empty baseline: main is clean. Fails on ANY violation (allowlist exists for
// vetted exceptions only).
//
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_DIR = "artifacts/ghayth-erp/src";
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts", "hooks-rules-allowlist.txt");

const isHookName = (n) => /^use[A-Z0-9]/.test(n);
const isComponentName = (n) => /^[A-Z]/.test(n);
/** A hook callee: `useX(` or `React.useX(`. */
function hookCalleeName(expr) {
  if (ts.isIdentifier(expr.expression) && isHookName(expr.expression.text)) return expr.expression.text;
  if (
    ts.isPropertyAccessExpression(expr.expression) &&
    ts.isIdentifier(expr.expression.name) &&
    isHookName(expr.expression.name.text)
  ) return expr.expression.name.text;
  return null;
}

const FN_KINDS = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
]);
const isFn = (n) => FN_KINDS.has(n.kind);

/** Best-effort name for a function node (decl name, or the var/prop it's assigned
 *  to). Unwraps the standard component HOCs so `const X = forwardRef(() => …)` /
 *  `memo(() => …)` resolve to `X` (a component) rather than an anonymous fn. */
function fnName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  let p = node.parent;
  // unwrap forwardRef / memo / observer wrappers (possibly React.forwardRef)
  if (p && ts.isCallExpression(p)) {
    const callee = p.expression;
    const cn = ts.isIdentifier(callee) ? callee.text
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) ? callee.name.text : "";
    if (/^(forwardRef|memo|observer)$/.test(cn)) p = p.parent;
  }
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

/** Collect hook CallExpressions directly inside `fnNode` (NOT crossing into a
 *  nested function — those belong to their own scope). */
function directHookCalls(fnNode) {
  const out = [];
  const body = fnNode.body;
  if (!body) return out;
  const visit = (n) => {
    if (n !== body && isFn(n)) return; // stop at nested function boundary
    if (ts.isCallExpression(n)) {
      const name = hookCalleeName(n);
      if (name) out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return out;
}

const CONDITIONAL_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.ConditionalExpression,
]);
/** Is the hook call nested inside a conditional/loop, up to its function? */
function conditionalAncestor(callNode, fnNode) {
  let p = callNode.parent;
  while (p && p !== fnNode) {
    if (CONDITIONAL_KINDS.has(p.kind)) return ts.SyntaxKind[p.kind];
    // && / || short-circuit (but NOT the `??` nullish or a hook's own arg list)
    if (ts.isBinaryExpression(p) &&
        (p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
         p.operatorToken.kind === ts.SyntaxKind.BarBarToken)) return "&&/||";
    p = p.parent;
  }
  return null;
}

/** Does a statement guarantee an early exit (return/throw), incl. `if (x) return`? */
function isEarlyExit(stmt) {
  if (ts.isReturnStatement(stmt) || ts.isThrowStatement(stmt)) return true;
  if (ts.isIfStatement(stmt)) {
    const branchExits = (b) =>
      !!b && (ts.isReturnStatement(b) || ts.isThrowStatement(b) ||
        (ts.isBlock(b) && b.statements.some((s) => ts.isReturnStatement(s) || ts.isThrowStatement(s))));
    // an early-return guard: the THEN branch returns (classic `if (loading) return <…>`)
    return branchExits(stmt.thenStatement);
  }
  return false;
}

/** Line number (1-based) for a node. */
const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

export function scanSource(fileName, text) {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations = [];

  const visit = (node) => {
    if (isFn(node) && node.body) {
      const calls = directHookCalls(node);
      if (calls.length > 0) {
        const name = fnName(node);
        const isReactFn = name && (isComponentName(name) || isHookName(name));
        if (!isReactFn) {
          // Rule A — hook in a non-component / non-hook function.
          for (const c of calls) {
            violations.push({ line: lineOf(sf, c), rule: "A",
              msg: `هوك (${hookCalleeName(c)}) داخل دالة «${name ?? "مجهولة"}» ليست مكوّنًا (يبدأ بحرف كبير) ولا هوكًا (use…)` });
          }
        } else {
          // Rule C — conditional/loop nesting.
          for (const c of calls) {
            const cond = conditionalAncestor(c, node);
            if (cond) violations.push({ line: lineOf(sf, c), rule: "C",
              msg: `هوك (${hookCalleeName(c)}) مُستدعى بشكل مشروط داخل ${cond} — يجب استدعاؤه دائمًا في المستوى الأعلى` });
          }
          // Rule B — hook after an early return at the body's top level.
          if (ts.isBlock(node.body)) {
            let sawExit = false;
            for (const stmt of node.body.statements) {
              if (sawExit) {
                // any direct hook call inside this post-exit statement?
                const here = [];
                const v2 = (n) => {
                  if (n !== stmt && isFn(n)) return;
                  if (ts.isCallExpression(n) && hookCalleeName(n)) here.push(n);
                  ts.forEachChild(n, v2);
                };
                ts.forEachChild(stmt, v2);
                // a VariableStatement/ExpressionStatement may itself BE the call
                if (ts.isCallExpression(stmt)) { /* unreachable */ }
                for (const c of here) violations.push({ line: lineOf(sf, c), rule: "B",
                  msg: `هوك (${hookCalleeName(c)}) مُستدعى بعد return مبكّر — انقله قبل الـreturns (Rules of Hooks)` });
              }
              if (isEarlyExit(stmt)) sawExit = true;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // de-dupe (a call can trip B and C) — keep one per (line, callee)
  const seen = new Set();
  return violations.filter((v) => {
    const k = `${v.line}:${v.msg.slice(0, 20)}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return new Set();
  return new Set(
    readFileSync(ALLOWLIST_FILE, "utf8").split("\n")
      .map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean),
  );
}

function main() {
  const allow = loadAllowlist();
  let files = [];
  try {
    files = execSync(`find ${SRC_DIR} -name '*.tsx' -o -name '*.ts'`, { cwd: REPO_ROOT, encoding: "utf8" })
      .trim().split("\n").filter((f) => f && !/\.(test|spec)\.(ts|tsx)$/.test(f));
  } catch { /* dir missing */ }

  const found = [];
  for (const f of files) {
    const abs = join(REPO_ROOT, f);
    let text; try { text = readFileSync(abs, "utf8"); } catch { continue; }
    if (!/\buse[A-Z]/.test(text)) continue; // fast skip — no hooks at all
    for (const v of scanSource(f, text)) {
      const key = `${f}:${v.line}`;
      if (!allow.has(key)) found.push(`${key}  [${v.rule}] ${v.msg}`);
    }
  }

  if (found.length > 0) {
    console.error(`[31m✗[0m check:hooks-rules — ${found.length} خرق لقواعد React Hooks:\n`);
    for (const f of found) console.error("   • " + f);
    console.error("\nأصلح بنقل الهوك قبل أي return مبكّر / خارج الشرط، أو سمِّ الدالة use… ، أو أضف الموضع للـallowlist بعد المراجعة.");
    process.exit(1);
  }
  console.log(`[32m✓[0m check:hooks-rules — ${files.length} ملف مفحوص · لا خرق لقواعد React Hooks.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
