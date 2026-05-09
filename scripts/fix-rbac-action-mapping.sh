#!/bin/bash
# fix-action-mapping.sh
#
# Corrects action mapping introduced by bulk-migrate-rbac.sh, where
# `:write` permissions were uniformly mapped to `action: "create"`. The
# bulk script was HTTP-method-blind, so every PATCH route that the legacy
# code gated with `:write` ended up with `action: "create"` instead of
# the semantically correct `action: "update"`. Same for DELETE → delete.
#
# This script walks every route file and rewrites the action by HTTP
# method using a Python helper (perl regex with multiline lookahead is
# easier in Python). Only touches lines that combine `router.X(`
# directly with `authorize({ feature: "Y", action: "create" })` — i.e.
# the bulk-migrated lines. Custom routes that already passed the right
# action remain untouched.

set -e
cd "$(dirname "$0")/.."

python3 <<'PY'
import os, re

ROUTES = "artifacts/api-server/src/routes"

# Match a single-line route declaration where the HTTP method tells us
# the correct action. We only correct rows that came from the bulk pass.
patch_re  = re.compile(r'(router\.patch\(|invoicesRouter\.patch\(|journalRouter\.patch\(|vendorsRouter\.patch\(|budgetRouter\.patch\(|custodiesRouter\.patch\(|collectionRouter\.patch\(|recurringRouter\.patch\()([^)]*?authorize\(\{ feature: "[^"]+", action: ")create"')
delete_re = re.compile(r'(router\.delete\(|invoicesRouter\.delete\(|journalRouter\.delete\(|vendorsRouter\.delete\(|budgetRouter\.delete\(|custodiesRouter\.delete\(|recurringRouter\.delete\()([^)]*?authorize\(\{ feature: "[^"]+", action: ")create"')

# Also normalise the action when GET routes ended up with "list" but
# they look like single-record GETs (path contains `/:id`). list → view.
get_id_re = re.compile(r'(router\.get\(|invoicesRouter\.get\(|journalRouter\.get\(|vendorsRouter\.get\(|budgetRouter\.get\(|custodiesRouter\.get\(|collectionRouter\.get\()(\s*"[^"]*/:[a-zA-Z]+"[^)]*?authorize\(\{ feature: "[^"]+", action: ")list"')

fixed_patch = fixed_delete = fixed_view = 0
for fname in os.listdir(ROUTES):
    if not fname.endswith(".ts"):
        continue
    path = os.path.join(ROUTES, fname)
    with open(path, "r") as f:
        text = f.read()
    new = text
    new, n1 = patch_re.subn(lambda m: f'{m.group(1)}{m.group(2)}update"', new); fixed_patch += n1
    new, n2 = delete_re.subn(lambda m: f'{m.group(1)}{m.group(2)}delete"', new); fixed_delete += n2
    new, n3 = get_id_re.subn(lambda m: f'{m.group(1)}{m.group(2)}view"', new); fixed_view += n3
    if new != text:
        with open(path, "w") as f:
            f.write(new)

print(f"PATCH→update: {fixed_patch}")
print(f"DELETE→delete: {fixed_delete}")
print(f"GET /:id list→view: {fixed_view}")
PY
