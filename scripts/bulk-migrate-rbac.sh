#!/bin/bash
# Bulk RBAC v2 migration: replaces requirePermission(...) with
# authorize({...}) across all route files.
#
# Generic mapping (preserves module → catalog feature, action → catalog
# action). Routes with finer-grained features (hr.payroll, finance.invoices,
# etc.) were already migrated in PRs #175-#195; this catches the remaining
# ~900+ endpoints that fall under the parent module feature.

set -e
cd "$(dirname "$0")/.."

ROUTES_DIR="artifacts/api-server/src/routes"

# Map (module:action) → (feature, action)
# Multiple permissions split by comma in requireAnyPermission are not
# handled here — those routes keep requireAnyPermission for now.

migrate_file() {
  local f="$1"
  # Add authorize import if missing and file uses requirePermission
  if grep -q "requirePermission" "$f" && ! grep -q "from \"../lib/rbac/authorize.js\"" "$f"; then
    # Insert after the requirePermission import line
    sed -i '0,/import.*requirePermission.*permissionMiddleware/{s|\(import.*requirePermission.*permissionMiddleware\.js";\)|\1\nimport { authorize } from "../lib/rbac/authorize.js";|}' "$f"
  fi

  # Module → feature mapping (action → action mapping)
  # Replace patterns like: requirePermission("MODULE:ACTION") → authorize({ feature: "MODULE", action: "X" })

  # Note: we only replace single-permission requirePermission calls.
  # requireAnyPermission and multi-arg requirePermission are left alone.

  # hr
  sed -i 's|requirePermission("hr:read")|authorize({ feature: "hr", action: "list" })|g' "$f"
  sed -i 's|requirePermission("hr:create")|authorize({ feature: "hr", action: "create" })|g' "$f"
  sed -i 's|requirePermission("hr:update")|authorize({ feature: "hr", action: "update" })|g' "$f"
  sed -i 's|requirePermission("hr:write")|authorize({ feature: "hr", action: "create" })|g' "$f"
  sed -i 's|requirePermission("hr:delete")|authorize({ feature: "hr", action: "delete" })|g' "$f"
  sed -i 's|requirePermission("hr:approve")|authorize({ feature: "hr", action: "approve" })|g' "$f"
  sed -i 's|requirePermission("hr:self")|authorize({ feature: "hr", action: "view" })|g' "$f"
  sed -i 's|requirePermission("hr:discipline:read")|authorize({ feature: "hr.discipline", action: "view" })|g' "$f"
  sed -i 's|requirePermission("hr:discipline:create")|authorize({ feature: "hr.discipline", action: "create" })|g' "$f"
  sed -i 's|requirePermission("hr:discipline:update")|authorize({ feature: "hr.discipline", action: "update" })|g' "$f"
  sed -i 's|requirePermission("hr:discipline:approve")|authorize({ feature: "hr.discipline", action: "approve" })|g' "$f"

  # finance
  sed -i 's|requirePermission("finance:read")|authorize({ feature: "finance", action: "list" })|g' "$f"
  sed -i 's|requirePermission("finance:create")|authorize({ feature: "finance", action: "create" })|g' "$f"
  sed -i 's|requirePermission("finance:update")|authorize({ feature: "finance", action: "update" })|g' "$f"
  sed -i 's|requirePermission("finance:write")|authorize({ feature: "finance", action: "create" })|g' "$f"
  sed -i 's|requirePermission("finance:delete")|authorize({ feature: "finance", action: "delete" })|g' "$f"
  sed -i 's|requirePermission("finance:approve")|authorize({ feature: "finance", action: "approve" })|g' "$f"

  # fleet
  sed -i 's|requirePermission("fleet:read")|authorize({ feature: "fleet", action: "list" })|g' "$f"
  sed -i 's|requirePermission("fleet:create")|authorize({ feature: "fleet", action: "create" })|g' "$f"
  sed -i 's|requirePermission("fleet:update")|authorize({ feature: "fleet", action: "update" })|g' "$f"
  sed -i 's|requirePermission("fleet:delete")|authorize({ feature: "fleet", action: "delete" })|g' "$f"

  # warehouse
  sed -i 's|requirePermission("warehouse:read")|authorize({ feature: "warehouse", action: "list" })|g' "$f"
  sed -i 's|requirePermission("warehouse:create")|authorize({ feature: "warehouse", action: "create" })|g' "$f"
  sed -i 's|requirePermission("warehouse:update")|authorize({ feature: "warehouse", action: "update" })|g' "$f"
  sed -i 's|requirePermission("warehouse:delete")|authorize({ feature: "warehouse", action: "delete" })|g' "$f"

  # property/properties
  sed -i 's|requirePermission("property:read")|authorize({ feature: "properties", action: "list" })|g' "$f"
  sed -i 's|requirePermission("property:create")|authorize({ feature: "properties", action: "create" })|g' "$f"
  sed -i 's|requirePermission("property:update")|authorize({ feature: "properties", action: "update" })|g' "$f"
  sed -i 's|requirePermission("property:delete")|authorize({ feature: "properties", action: "delete" })|g' "$f"
  sed -i 's|requirePermission("properties:read")|authorize({ feature: "properties", action: "list" })|g' "$f"

  # projects
  sed -i 's|requirePermission("projects:read")|authorize({ feature: "projects", action: "list" })|g' "$f"
  sed -i 's|requirePermission("projects:create")|authorize({ feature: "projects", action: "create" })|g' "$f"
  sed -i 's|requirePermission("projects:update")|authorize({ feature: "projects", action: "update" })|g' "$f"
  sed -i 's|requirePermission("projects:delete")|authorize({ feature: "projects", action: "delete" })|g' "$f"

  # operations (alias for projects in catalog)
  sed -i 's|requirePermission("operations:read")|authorize({ feature: "projects", action: "list" })|g' "$f"
  sed -i 's|requirePermission("operations:create")|authorize({ feature: "projects", action: "create" })|g' "$f"
  sed -i 's|requirePermission("operations:update")|authorize({ feature: "projects", action: "update" })|g' "$f"
  sed -i 's|requirePermission("operations:delete")|authorize({ feature: "projects", action: "delete" })|g' "$f"

  # legal
  sed -i 's|requirePermission("legal:read")|authorize({ feature: "legal", action: "list" })|g' "$f"
  sed -i 's|requirePermission("legal:create")|authorize({ feature: "legal", action: "create" })|g' "$f"
  sed -i 's|requirePermission("legal:update")|authorize({ feature: "legal", action: "update" })|g' "$f"
  sed -i 's|requirePermission("legal:write")|authorize({ feature: "legal", action: "create" })|g' "$f"
  sed -i 's|requirePermission("legal:delete")|authorize({ feature: "legal", action: "delete" })|g' "$f"

  # support
  sed -i 's|requirePermission("support:read")|authorize({ feature: "support", action: "list" })|g' "$f"
  sed -i 's|requirePermission("support:create")|authorize({ feature: "support", action: "create" })|g' "$f"
  sed -i 's|requirePermission("support:update")|authorize({ feature: "support", action: "update" })|g' "$f"
  sed -i 's|requirePermission("support:write")|authorize({ feature: "support", action: "create" })|g' "$f"
  sed -i 's|requirePermission("support:delete")|authorize({ feature: "support", action: "delete" })|g' "$f"

  # crm
  sed -i 's|requirePermission("crm:read")|authorize({ feature: "crm", action: "list" })|g' "$f"
  sed -i 's|requirePermission("crm:create")|authorize({ feature: "crm", action: "create" })|g' "$f"
  sed -i 's|requirePermission("crm:update")|authorize({ feature: "crm", action: "update" })|g' "$f"
  sed -i 's|requirePermission("crm:write")|authorize({ feature: "crm", action: "create" })|g' "$f"
  sed -i 's|requirePermission("crm:delete")|authorize({ feature: "crm", action: "delete" })|g' "$f"

  # marketing
  sed -i 's|requirePermission("marketing:read")|authorize({ feature: "marketing", action: "list" })|g' "$f"
  sed -i 's|requirePermission("marketing:create")|authorize({ feature: "marketing", action: "create" })|g' "$f"
  sed -i 's|requirePermission("marketing:update")|authorize({ feature: "marketing", action: "update" })|g' "$f"
  sed -i 's|requirePermission("marketing:delete")|authorize({ feature: "marketing", action: "delete" })|g' "$f"

  # documents
  sed -i 's|requirePermission("documents:read")|authorize({ feature: "documents", action: "list" })|g' "$f"
  sed -i 's|requirePermission("documents:create")|authorize({ feature: "documents", action: "create" })|g' "$f"
  sed -i 's|requirePermission("documents:update")|authorize({ feature: "documents", action: "update" })|g' "$f"
  sed -i 's|requirePermission("documents:write")|authorize({ feature: "documents", action: "create" })|g' "$f"
  sed -i 's|requirePermission("documents:delete")|authorize({ feature: "documents", action: "delete" })|g' "$f"
  sed -i 's|requirePermission("documents:download")|authorize({ feature: "documents", action: "export" })|g' "$f"

  # store
  sed -i 's|requirePermission("store:read")|authorize({ feature: "store", action: "list" })|g' "$f"
  sed -i 's|requirePermission("store:write")|authorize({ feature: "store", action: "create" })|g' "$f"

  # umrah
  sed -i 's|requirePermission("umrah:read")|authorize({ feature: "umrah", action: "list" })|g' "$f"
  sed -i 's|requirePermission("umrah:write")|authorize({ feature: "umrah", action: "create" })|g' "$f"

  # bi
  sed -i 's|requirePermission("bi:read")|authorize({ feature: "bi", action: "list" })|g' "$f"
  sed -i 's|requirePermission("bi:write")|authorize({ feature: "bi", action: "create" })|g' "$f"

  # reports
  sed -i 's|requirePermission("reports:read")|authorize({ feature: "reports", action: "list" })|g' "$f"
  sed -i 's|requirePermission("reports:write")|authorize({ feature: "reports", action: "create" })|g' "$f"

  # tasks (covered already in catalog)
  sed -i 's|requirePermission("tasks:read")|authorize({ feature: "tasks", action: "list" })|g' "$f"
  sed -i 's|requirePermission("tasks:write")|authorize({ feature: "tasks", action: "create" })|g' "$f"

  # requests
  sed -i 's|requirePermission("requests:read")|authorize({ feature: "requests", action: "list" })|g' "$f"
  sed -i 's|requirePermission("requests:write")|authorize({ feature: "requests", action: "create" })|g' "$f"

  # governance
  sed -i 's|requirePermission("governance:read")|authorize({ feature: "governance", action: "list" })|g' "$f"
  sed -i 's|requirePermission("governance:write")|authorize({ feature: "governance", action: "create" })|g' "$f"

  # admin
  sed -i 's|requirePermission("admin:read")|authorize({ feature: "admin", action: "list" })|g' "$f"
  sed -i 's|requirePermission("admin:write")|authorize({ feature: "admin", action: "update" })|g' "$f"

  # settings
  sed -i 's|requirePermission("settings:read")|authorize({ feature: "settings", action: "view" })|g' "$f"
  sed -i 's|requirePermission("settings:write")|authorize({ feature: "settings", action: "update" })|g' "$f"

  # audit
  sed -i 's|requirePermission("audit:read")|authorize({ feature: "admin.audit", action: "view" })|g' "$f"

  # notifications
  sed -i 's|requirePermission("notifications:read")|authorize({ feature: "notifications", action: "list" })|g' "$f"
  sed -i 's|requirePermission("notifications:write")|authorize({ feature: "notifications", action: "update" })|g' "$f"

  # communications
  sed -i 's|requirePermission("communications:read")|authorize({ feature: "communications", action: "list" })|g' "$f"
  sed -i 's|requirePermission("communications:write")|authorize({ feature: "communications", action: "create" })|g' "$f"

  # permissions module itself
  sed -i 's|requirePermission("permissions:read")|authorize({ feature: "admin.roles", action: "view" })|g' "$f"
  sed -i 's|requirePermission("permissions:write")|authorize({ feature: "admin.roles", action: "update" })|g' "$f"
}

count=0
for f in "$ROUTES_DIR"/*.ts; do
  if grep -q "requirePermission(" "$f"; then
    migrate_file "$f"
    count=$((count + 1))
  fi
done
echo "Migrated $count files"
