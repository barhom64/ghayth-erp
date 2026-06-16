/**
 * GAP_MATRIX P2 — Pure navigation page that renders the full service catalog
 * filtered by the user's allowed modules. Makes NO API calls directly;
 * consumes useFilteredNavSections() which reads cached sidebar state.
 * Intentional: a services directory / launchpad, not a data page.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { PageShell } from "@workspace/ui-core";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search, LayoutGrid } from "lucide-react";
import { useFilteredNavSections } from "@/components/layout/sidebar-layout";
import { cn } from "@/lib/utils";

interface FlatService {
  label: string;
  path: string;
  icon: any;
  section: string;
  parentLabel?: string;
}

/**
 * /services — صفحة "كل الخدمات".
 *
 * تعرض كل الصفحات/الخدمات في النظام كمربعات قابلة للنقر، مجمعة حسب
 * أقسام القائمة الجانبية. الفلترة هي نفسها التي تطبقها القائمة الجانبية
 * (role-level + module access + perms + feature flags) عبر hook مشترك
 * `useFilteredNavSections`، فلا يرى المستخدم خدمات لا يستطيع الوصول
 * إليها.
 *
 * استخدامها: المستخدمون يفضلون أحياناً visual grid على tree menu، خاصة
 * لـ onboarding أو البحث عن صفحة لا يتذكرون موقعها الدقيق في السايدبار.
 */
export default function ServicesPage() {
  const sections = useFilteredNavSections();
  const [query, setQuery] = useState("");

  // Flatten the nav tree into a single list of leaf services, preserving
  // the section + parent label for grouping and breadcrumb-style display.
  const allServices = useMemo<FlatService[]>(() => {
    const out: FlatService[] = [];
    for (const section of sections) {
      const walk = (items: typeof section.items, parentLabel?: string) => {
        for (const item of items) {
          if (item.children && item.children.length > 0) {
            walk(item.children, parentLabel ? `${parentLabel} / ${item.label}` : item.label);
          } else {
            out.push({
              label: item.label,
              path: item.path,
              icon: item.icon,
              section: section.title,
              parentLabel,
            });
          }
        }
      };
      walk(section.items);
    }
    return out;
  }, [sections]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allServices;
    const q = query.trim().toLowerCase();
    return allServices.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.section.toLowerCase().includes(q) ||
        (s.parentLabel?.toLowerCase().includes(q) ?? false) ||
        s.path.toLowerCase().includes(q),
    );
  }, [allServices, query]);

  // Group filtered list back by section so the grid keeps its visual
  // hierarchy when nothing is searched, and collapses to a flat
  // "نتائج البحث" section while typing.
  const groups = useMemo(() => {
    if (query.trim()) {
      return [{ title: `نتائج البحث (${filtered.length})`, items: filtered }];
    }
    const bySection = new Map<string, FlatService[]>();
    for (const s of filtered) {
      if (!bySection.has(s.section)) bySection.set(s.section, []);
      bySection.get(s.section)!.push(s);
    }
    return Array.from(bySection, ([title, items]) => ({ title, items }));
  }, [filtered, query]);

  const totalCount = allServices.length;

  return (
    <PageShell
      title="كل الخدمات"
      subtitle={`اعرض كل صفحات وخدمات النظام في مكان واحد (${totalCount} خدمة متاحة لك)`}
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "كل الخدمات" },
      ]}
    >
      <div className="mb-4 relative">
        <Search className="absolute end-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن خدمة بالاسم أو القسم أو المسار..."
          className="pe-10"
          autoFocus
        />
      </div>

      {groups.length === 0 || groups[0].items.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p>لا توجد خدمات مطابقة لـ "{query}"</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="text-sm font-bold text-muted-foreground mb-3 px-1 flex items-center gap-2">
                {group.title}
                <span className="text-xs font-normal text-muted-foreground/70">
                  ({group.items.length})
                </span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {group.items.map((service) => {
                  const Icon = service.icon;
                  return (
                    <Link key={service.path + service.label} href={service.path}>
                      <Card
                        className={cn(
                          "p-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/40 hover:bg-primary/5",
                          "flex flex-col items-center text-center gap-2 h-full",
                        )}
                        title={service.parentLabel ? `${service.parentLabel} / ${service.label}` : service.label}
                      >
                        {Icon && (
                          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                            <Icon className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 w-full">
                          <p className="text-sm font-medium leading-tight line-clamp-2">
                            {service.label}
                          </p>
                          {service.parentLabel && (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                              {service.parentLabel}
                            </p>
                          )}
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
