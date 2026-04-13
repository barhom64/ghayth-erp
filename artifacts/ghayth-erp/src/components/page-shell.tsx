import { type ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft, Home as HomeIcon } from "lucide-react";
import { PageErrorBoundary } from "@/components/page-error-boundary";
import { cn } from "@/lib/utils";

/**
 * PageShell — P1.1 of the unification plan (docs/UNIFICATION_PLAN.md).
 *
 * The one page template the entire app should reach for. Today only 57 of
 * 321 pages (17.7%) use any shared layout wrapper, and the remaining 82%
 * each assemble their own header / breadcrumbs / filters / body / error
 * handling. PageShell unifies those five concerns behind a single prop
 * surface so a new page looks like:
 *
 *   <PageShell
 *     title="الموظفون"
 *     subtitle="إدارة الموظفين وتعييناتهم"
 *     breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
 *     actions={<Button asChild><Link href="/create/hr/employee">موظف جديد</Link></Button>}
 *     filters={<EmployeeFilters />}
 *   >
 *     <DataTable data={rows} columns={columns} />
 *   </PageShell>
 *
 * Adoption is opt-in. Pages that already work continue to work untouched;
 * new pages and pages refactored in Phases 3-4 wrap their content with
 * PageShell and inherit:
 *
 *   1. Consistent header (title + subtitle + right-side actions)
 *   2. Consistent breadcrumbs with a home link
 *   3. Consistent filter bar (when `filters` is provided)
 *   4. PageErrorBoundary (P0.5) already wrapping the body — one page's
 *      error never crashes the sidebar
 *   5. Consistent spacing, RTL direction, loading overlay hook
 *
 * Notes on composition:
 *   - PageShell does NOT render the sidebar itself. The sidebar is already
 *     mounted by SidebarLayout at the router level (App.tsx). PageShell is
 *     a *content* wrapper that lives inside whatever the router renders.
 *   - `contentClassName` is escape-hatch for pages that need unusual
 *     spacing (e.g. dashboards with full-bleed cards). Prefer the default.
 */

export interface Breadcrumb {
  /** Display label (Arabic). */
  label: string;
  /** Target href — omit for the current page (rendered as plain text). */
  href?: string;
}

export interface PageShellProps {
  /** Page title shown as an h1. */
  title: string;

  /** Optional subtitle rendered under the title in a muted tone. */
  subtitle?: string;

  /**
   * Breadcrumbs rendered above the title. Home is always prepended
   * automatically so callers only pass the intermediate + current crumbs.
   */
  breadcrumbs?: Breadcrumb[];

  /**
   * Right-side action slot — buttons, filters, menus. Rendered on the
   * opposite edge of the title row.
   */
  actions?: ReactNode;

  /**
   * Optional filter row rendered between the header and the body. Intended
   * for search inputs, status selects, date pickers. Automatically styled
   * as a sticky toolbar on scrolling pages.
   */
  filters?: ReactNode;

  /**
   * Optional loading flag — when true, renders a subtle top bar and keeps
   * the body interactive. Full-page spinners are intentionally avoided.
   */
  loading?: boolean;

  /**
   * Reset key forwarded to PageErrorBoundary. Change this when the route
   * params change so the boundary clears on navigation.
   */
  resetKey?: string | number;

  /**
   * Extra className for the body container. Default spacing is `space-y-4`.
   */
  contentClassName?: string;

  /** Page body. */
  children: ReactNode;
}

/**
 * Render a standard breadcrumbs row. `crumbs` may include a current-page
 * entry without an href — that one renders as plain text and isn't wrapped
 * in a link.
 */
function BreadcrumbsRow({ crumbs }: { crumbs: Breadcrumb[] }) {
  const all: Breadcrumb[] = [{ label: "الرئيسية", href: "/" }, ...crumbs];
  return (
    <nav
      aria-label="مسار التنقل"
      className="flex items-center gap-1 text-xs text-muted-foreground"
    >
      {all.map((c, i) => {
        const isLast = i === all.length - 1;
        const content = c.href && !isLast ? (
          <Link
            href={c.href}
            className="hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            {i === 0 && <HomeIcon className="h-3 w-3" />}
            {c.label}
          </Link>
        ) : (
          <span className={isLast ? "text-foreground font-medium" : ""}>
            {i === 0 && <HomeIcon className="h-3 w-3 inline me-1" />}
            {c.label}
          </span>
        );
        return (
          <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
            {content}
            {!isLast && <ChevronLeft className="h-3 w-3 opacity-50" />}
          </span>
        );
      })}
    </nav>
  );
}

export function PageShell(props: PageShellProps) {
  const {
    title,
    subtitle,
    breadcrumbs,
    actions,
    filters,
    loading,
    resetKey,
    contentClassName,
    children,
  } = props;

  return (
    <div className="space-y-4 px-1 pb-10" dir="rtl">
      {loading && (
        <div
          role="progressbar"
          aria-label="جار التحميل"
          className="fixed top-0 start-0 end-0 h-0.5 bg-primary/20 z-50 overflow-hidden pointer-events-none"
        >
          <div className="h-full w-1/3 bg-primary animate-[loading-bar_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      {breadcrumbs && breadcrumbs.length > 0 && (
        <BreadcrumbsRow crumbs={breadcrumbs} />
      )}

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </header>

      {filters && (
        <div className="bg-muted/30 rounded-lg border p-3 flex items-center gap-2 flex-wrap">
          {filters}
        </div>
      )}

      <div className={cn("relative", contentClassName ?? "space-y-4")}>
        <PageErrorBoundary resetKey={resetKey}>{children}</PageErrorBoundary>
      </div>
    </div>
  );
}

/**
 * PageSection — an opinionated card wrapper for a labelled area within a
 * PageShell body. Useful for detail pages that split content into several
 * titled sections (e.g. "المعلومات الشخصية", "التعيين الوظيفي",
 * "المستندات").
 */
export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
