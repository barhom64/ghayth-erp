#!/usr/bin/env node
//
// scripts/src/check-ghost-rows.test.mjs
//
// Focused unit fixtures for the ghost-row scanner predicate logic.
// Exercises the IS NULL / IS NOT NULL / projection / multi-join /
// allowlist branches without needing a live DB. Imports the predicate
// helpers directly from check-ghost-rows.mjs.
//
// Run:  node scripts/src/check-ghost-rows.test.mjs
//
// Exits 0 on pass, 1 on any assertion failure.
//

import {
  statementHasAliasedDeletedAtIsNull,
  statementHasUnqualifiedDeletedAtIsNull,
  findFromJoinReferences,
  splitStatements,
  stripCommentsAndStrings,
  findDrizzleSelectChains,
  extractTableVarFromArgs,
  extractJoinOnArg,
  predicateFiltersDeletedAt,
} from "./check-ghost-rows.mjs";

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

console.log("statementHasAliasedDeletedAtIsNull");
assert(
  statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees e WHERE e."companyId" = $1 AND e."deletedAt" IS NULL`,
    "e",
  ),
  `accepts: e."deletedAt" IS NULL`,
);
assert(
  statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees e WHERE e."deletedAt"   IS    NULL`,
    "e",
  ),
  `accepts: extra whitespace between IS and NULL`,
);
assert(
  !statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees e WHERE e."deletedAt" IS NOT NULL`,
    "e",
  ),
  `rejects: e."deletedAt" IS NOT NULL (deleted-only listing)`,
);
assert(
  !statementHasAliasedDeletedAtIsNull(
    `SELECT e."deletedAt", e.name FROM employees e`,
    "e",
  ),
  `rejects: bare projection of "deletedAt" without IS NULL`,
);
assert(
  !statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees e JOIN clients c ON c.id = e."clientId" AND c."deletedAt" IS NULL`,
    "e",
  ),
  `rejects: only the OTHER alias filters IS NULL`,
);
assert(
  statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees e JOIN clients c ON c.id = e."clientId" AND c."deletedAt" IS NULL WHERE e."deletedAt" IS NULL`,
    "c",
  ),
  `accepts: predicate inside a JOIN ... ON clause for alias c`,
);
assert(
  statementHasAliasedDeletedAtIsNull(
    `SELECT * FROM employees "Emp" WHERE "Emp"."deletedAt" IS NULL`,
    "Emp",
  ),
  `accepts: quoted alias`,
);

console.log("statementHasUnqualifiedDeletedAtIsNull");
assert(
  statementHasUnqualifiedDeletedAtIsNull(
    `SELECT * FROM employees WHERE "deletedAt" IS NULL`,
  ),
  `accepts: unqualified "deletedAt" IS NULL`,
);
assert(
  !statementHasUnqualifiedDeletedAtIsNull(
    `SELECT * FROM employees WHERE "deletedAt" IS NOT NULL`,
  ),
  `rejects: unqualified IS NOT NULL`,
);
assert(
  !statementHasUnqualifiedDeletedAtIsNull(
    `SELECT * FROM employees WHERE e."deletedAt" IS NULL`,
  ),
  `rejects: predicate is qualified by an alias (not unqualified)`,
);

console.log("findFromJoinReferences");
{
  const refs = findFromJoinReferences(
    `SELECT * FROM employees e LEFT JOIN clients AS c ON c.id = e."clientId" JOIN suppliers s ON s.id = $1`,
  );
  assert(refs.length === 3, `finds 3 references`);
  assert(refs[0].table === "employees" && refs[0].alias === "e", `employees e`);
  assert(refs[1].table === "clients" && refs[1].alias === "c", `clients AS c`);
  assert(refs[2].table === "suppliers" && refs[2].alias === "s", `suppliers s`);
}
{
  // No alias → alias defaults to table name.
  const refs = findFromJoinReferences(`SELECT * FROM employees WHERE id = $1`);
  assert(
    refs.length === 1 && refs[0].table === "employees" && refs[0].alias === "employees",
    `defaults alias to table name when none given`,
  );
}
{
  // Subquery start → ignored.
  const refs = findFromJoinReferences(`SELECT * FROM (SELECT 1) sub`);
  assert(refs.length === 0, `ignores subquery start (FROM (SELECT …))`);
}
{
  // Reserved word after table is not an alias.
  const refs = findFromJoinReferences(
    `SELECT * FROM employees WHERE id = $1 ORDER BY name`,
  );
  assert(refs[0].alias === "employees", `does not treat WHERE as an alias`);
}

console.log("splitStatements / stripCommentsAndStrings");
{
  const sql = stripCommentsAndStrings(
    `-- comment\nSELECT 1; SELECT 2; /* block */ INSERT INTO t (a) VALUES ('x; y');`,
  );
  const stmts = splitStatements(sql);
  assert(stmts.length === 3, `splits 3 top-level statements (got ${stmts.length})`);
}
{
  // Semicolons inside parens / strings must NOT split.
  const sql = stripCommentsAndStrings(
    `SELECT (CASE WHEN x THEN 1 ELSE 2 END) FROM t WHERE name = 'a;b'`,
  );
  const stmts = splitStatements(sql);
  assert(stmts.length === 1, `does not split on ; inside string literal or parens`);
}

// End-to-end-ish: the scanner SHOULD flag this fixture (no IS NULL).
console.log("end-to-end: required-fail fixture");
{
  const stmt = `SELECT * FROM employees e WHERE e."companyId" = $1`;
  const refs = findFromJoinReferences(stmt);
  const flagged =
    refs.length === 1 &&
    !statementHasAliasedDeletedAtIsNull(stmt, refs[0].alias) &&
    !statementHasUnqualifiedDeletedAtIsNull(stmt);
  assert(flagged, `bare SELECT without IS NULL → would be flagged`);
}
console.log("end-to-end: required-pass fixture");
{
  const stmt = `SELECT * FROM employees e WHERE e."companyId" = $1 AND e."deletedAt" IS NULL`;
  const refs = findFromJoinReferences(stmt);
  const flagged =
    refs.length === 1 &&
    !statementHasAliasedDeletedAtIsNull(stmt, refs[0].alias) &&
    !statementHasUnqualifiedDeletedAtIsNull(stmt);
  assert(!flagged, `SELECT with IS NULL → would NOT be flagged`);
}
console.log("end-to-end: IS NOT NULL must still be flagged");
{
  const stmt = `SELECT * FROM employees e WHERE e."deletedAt" IS NOT NULL`;
  const refs = findFromJoinReferences(stmt);
  const flagged =
    refs.length === 1 &&
    !statementHasAliasedDeletedAtIsNull(stmt, refs[0].alias) &&
    !statementHasUnqualifiedDeletedAtIsNull(stmt);
  assert(flagged, `IS NOT NULL is a deleted-only listing, must still be flagged`);
}

console.log("Drizzle: extractTableVarFromArgs");
assert(extractTableVarFromArgs("employees") === "employees", "bare ident");
assert(
  extractTableVarFromArgs("schema.employees") === "employees",
  "strips schema. prefix",
);
assert(
  extractTableVarFromArgs("employees, eq(employees.id, 1)") === "employees",
  "first arg only",
);
assert(extractTableVarFromArgs("(x) => x") === null, "rejects non-ident");

console.log("Drizzle: extractJoinOnArg");
assert(
  extractJoinOnArg("clients, eq(clients.id, employees.clientId)").trim() ===
    "eq(clients.id, employees.clientId)",
  "splits on first top-level comma",
);
assert(
  extractJoinOnArg("clients, and(eq(a, b), isNull(c.deletedAt))").includes(
    "isNull(c.deletedAt)",
  ),
  "preserves nested comma inside and(...)",
);

console.log("Drizzle: predicateFiltersDeletedAt");
assert(
  predicateFiltersDeletedAt("eq(employees.id, 1), isNull(employees.deletedAt)", "employees"),
  "accepts isNull(employees.deletedAt)",
);
assert(
  predicateFiltersDeletedAt("eq( employees . deletedAt , null )", "employees"),
  "accepts whitespace-tolerant eq(t.deletedAt, null)",
);
assert(
  !predicateFiltersDeletedAt("eq(employees.id, 1)", "employees"),
  "rejects: no deletedAt predicate at all",
);
assert(
  !predicateFiltersDeletedAt("isNull(clients.deletedAt)", "employees"),
  "rejects: predicate is for the OTHER table",
);

console.log("Drizzle: findDrizzleSelectChains");
{
  const src = `
    const rows = await db.select().from(employees)
      .leftJoin(clients, eq(clients.id, employees.clientId))
      .where(and(eq(employees.id, 1), isNull(employees.deletedAt)));
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 1, `1 chain (got ${chains.length})`);
  const methods = chains[0].links.map((l) => l.method);
  assert(
    methods.join(",") === "from,leftJoin,where",
    `chain methods (got ${methods.join(",")})`,
  );
}
{
  // Two separate chains in one source.
  const src = `
    await db.select().from(a).where(isNull(a.deletedAt));
    await db.select({ id: b.id }).from(b);
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 2, `2 chains (got ${chains.length})`);
}
{
  // Chain ends at the next non-method token.
  const src = `await db.select().from(employees).where(eq(employees.id, 1)); doSomethingElse();`;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 1, "single chain");
  const methods = chains[0].links.map((l) => l.method);
  assert(methods.join(",") === "from,where", `methods=${methods.join(",")}`);
}

console.log("Drizzle: end-to-end fail/pass fixtures");
{
  // FAIL: select from soft-delete table without isNull predicate.
  const src = `await db.select().from(employees).where(eq(employees.id, 1));`;
  const [chain] = findDrizzleSelectChains(src);
  const fromLink = chain.links.find((l) => l.method === "from");
  const whereLink = chain.links.find((l) => l.method === "where");
  const tv = extractTableVarFromArgs(fromLink.args);
  const flagged = !predicateFiltersDeletedAt(whereLink.args, tv);
  assert(flagged, "missing isNull → would be flagged");
}
{
  // PASS: same chain with isNull added.
  const src = `await db.select().from(employees).where(and(eq(employees.id, 1), isNull(employees.deletedAt)));`;
  const [chain] = findDrizzleSelectChains(src);
  const fromLink = chain.links.find((l) => l.method === "from");
  const whereLink = chain.links.find((l) => l.method === "where");
  const tv = extractTableVarFromArgs(fromLink.args);
  const flagged = !predicateFiltersDeletedAt(whereLink.args, tv);
  assert(!flagged, "isNull(t.deletedAt) → would NOT be flagged");
}
{
  // PASS: predicate sitting in a join's ON clause (right side of an
  // outer join — must filter there, not in WHERE).
  const src = `
    await db.select().from(parents)
      .leftJoin(children, and(eq(children.parentId, parents.id), isNull(children.deletedAt)))
      .where(isNull(parents.deletedAt));
  `;
  const [chain] = findDrizzleSelectChains(src);
  const joinLink = chain.links.find((l) => l.method === "leftJoin");
  const whereLink = chain.links.find((l) => l.method === "where");
  const onArg = extractJoinOnArg(joinLink.args);
  // For "children" the predicate should be found in ON, not WHERE.
  const combined = `${onArg}\n${whereLink.args}`;
  assert(
    predicateFiltersDeletedAt(combined, "children"),
    "join ON predicate counts for the joined table",
  );
  assert(
    predicateFiltersDeletedAt(combined, "parents"),
    "WHERE predicate counts for the from() table",
  );
}

console.log("Drizzle: split-statement builder (Task #173)");
{
  // Split form: `const q = db.select().from(t); await q.where(...)`.
  // Was a documented false negative pre-#173 — must now stitch back
  // into one chain so the missing isNull predicate is detected.
  const src = `
    const q = db.select().from(employees);
    const rows = await q.where(eq(employees.id, 1));
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 1, `1 chain (got ${chains.length})`);
  const methods = chains[0].links.map((l) => l.method);
  assert(
    methods.join(",") === "from,where",
    `merged methods: from,where (got ${methods.join(",")})`,
  );
  const fromLink = chains[0].links.find((l) => l.method === "from");
  const whereLink = chains[0].links.find((l) => l.method === "where");
  const tv = extractTableVarFromArgs(fromLink.args);
  const flagged = !predicateFiltersDeletedAt(whereLink.args, tv);
  assert(flagged, "split form without isNull → would be flagged");
}
{
  // Split form WITH the isNull predicate added on the followup line.
  const src = `
    const q = db.select().from(employees);
    const rows = await q.where(and(eq(employees.id, 1), isNull(employees.deletedAt)));
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 1, `1 chain (got ${chains.length})`);
  const fromLink = chains[0].links.find((l) => l.method === "from");
  const whereLink = chains[0].links.find((l) => l.method === "where");
  const tv = extractTableVarFromArgs(fromLink.args);
  const flagged = !predicateFiltersDeletedAt(whereLink.args, tv);
  assert(!flagged, "split form WITH isNull → would NOT be flagged");
}
{
  // Multiple followup calls (leftJoin + where on subsequent lines).
  const src = `
    let q = db.select().from(parents);
    q = q.leftJoin(children, and(eq(children.parentId, parents.id), isNull(children.deletedAt)));
    const rows = await q.where(isNull(parents.deletedAt));
  `;
  const chains = findDrizzleSelectChains(src);
  // The middle line is `q = q.leftJoin(...)` — `q = q...` is a
  // reassignment, but the RHS isn't a `.select()` chain so it does
  // NOT create a new chain. The reassignment must therefore truncate
  // the original chain's followup window — meaning q.where on line 3
  // is no longer attributed to the original from(parents) chain.
  // That's the conservative, correct behaviour: we don't know what
  // q now points to.
  assert(chains.length === 1, `1 chain (got ${chains.length})`);
  const methods = chains[0].links.map((l) => l.method);
  assert(
    methods[0] === "from",
    `chain still anchored at from(parents) (got ${methods.join(",")})`,
  );
}
{
  // Reassignment to a NEW select chain — only the latest assignment
  // counts. The followup `q.where(...)` belongs to the second chain.
  const src = `
    let q = db.select().from(employees);
    q = db.select().from(suppliers);
    const rows = await q.where(isNull(suppliers.deletedAt));
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 2, `2 chains (got ${chains.length})`);
  // First chain: only its own `from(employees)`, NO stitched .where.
  const c1 = chains.find((c) =>
    c.links.some((l) => l.method === "from" && l.args.includes("employees")),
  );
  const c2 = chains.find((c) =>
    c.links.some((l) => l.method === "from" && l.args.includes("suppliers")),
  );
  assert(c1 && !c1.links.some((l) => l.method === "where"),
    "old chain (employees) does NOT pick up the post-reassignment where");
  assert(c2 && c2.links.some((l) => l.method === "where"),
    "new chain (suppliers) DOES pick up the followup where");
}
{
  // Property access lookalike: `obj.q.where(...)` must NOT be merged
  // into the chain assigned to local `q`.
  const src = `
    const q = db.select().from(employees);
    obj.q.where(eq(obj.q.id, 1));
    const rows = await q.where(isNull(employees.deletedAt));
  `;
  const chains = findDrizzleSelectChains(src);
  assert(chains.length === 1, `1 chain`);
  const wheres = chains[0].links.filter((l) => l.method === "where");
  assert(wheres.length === 1, `exactly 1 stitched .where (got ${wheres.length})`);
  assert(
    wheres[0].args.includes("isNull(employees.deletedAt)"),
    "stitched .where is the local-q one, not obj.q's",
  );
}

if (failed) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log(`\nAll predicate fixtures passed.`);
