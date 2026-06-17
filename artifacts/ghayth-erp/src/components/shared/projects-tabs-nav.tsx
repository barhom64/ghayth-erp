import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { FolderKanban, BarChart2, ShieldAlert } from "lucide-react";

// NOTE: project tasks (project_tasks) are managed inside the project detail page,
// not as a top-level tab. The old "/projects/tasks" tab pointed at the GENERAL
// operations Tasks page (the `tasks` table), which mislabelled operations work as
// project tasks. Operations tasks live at /tasks; per-project tasks live in the
// project detail. See docs/PROJECTS_BLUEPRINT.md §4 (task-ownership contract).
const TABS = [
  { href: "/projects", label: "المشاريع", icon: FolderKanban, match: ["/projects"], exact: true },
  { href: "/projects/gantt", label: "غانت", icon: BarChart2, match: ["/projects/gantt"] },
  { href: "/projects/risks", label: "المخاطر", icon: ShieldAlert, match: ["/projects/risks"] },
];

export function ProjectsTabsNav() {
  const [location] = useLocation();
  return (
    <div className="border-b mb-4 -mt-2 overflow-x-auto">
      <nav className="flex gap-1 min-w-max" dir="rtl">
        {TABS.map((tab) => {
          const isActive = tab.exact
            ? location === tab.href
            : tab.match.some((m) => location === m || location.startsWith(`${m}/`));
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} asChild>
              <a
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </a>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
