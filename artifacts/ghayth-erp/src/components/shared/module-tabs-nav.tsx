import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { MoreHorizontal, ChevronDown } from "lucide-react";
import { allNavSections, type NavItem } from "@/components/layout/navigation.registry";

// ──────────────────────────────────────────────────────────────────────────
// ModuleTabsNav — مرآة القائمة الجانبية، مشتقّة منها مباشرة (مصدر واحد).
//
// المستوى الأول (الشريط الرئيسي) = مجموعات القسم العليا في navigation.registry
// (نفس التسميات والترتيب والأيقونات). المستوى الثاني (الشريط الفرعي) = أبناء
// المجموعة النشطة. بهذا يستحيل أن ينحرف الأفقي عن الجانبي — لأنه نفس المصدر.
//
// - section: عنوان القسم في allNavSections (مثل "الموارد البشرية").
// - wrap: إن كان القسم مغلّفًا بمجموعة واحدة (مثل "إدارة الأسطول")، نشتقّ أبناءها.
// - primaryCount: عدد التبويبات الظاهرة قبل طيّ الباقي في «المزيد».
// ──────────────────────────────────────────────────────────────────────────

function basePath(p: string): string {
  return p.split(/[?#]/)[0];
}

/** كل المسارات تحت عنصر (هو + كل أحفاده). */
function pathsUnder(item: NavItem): string[] {
  const out = [basePath(item.path)];
  for (const c of item.children ?? []) out.push(...pathsUnder(c));
  return out;
}

/** أطول تطابق بين موقع المتصفّح ومسارات العنصر (-1 = لا تطابق). الأطول يفوز،
 *  حتى لا يبتلع جذرٌ عام (/hr) كل أبنائه التابعين لمجموعات أخرى. */
function matchLen(item: NavItem, loc: string): number {
  let best = -1;
  for (const p of pathsUnder(item)) {
    if (loc === p) best = Math.max(best, p.length + 1);
    else if (loc.startsWith(`${p}/`)) best = Math.max(best, p.length);
  }
  return best;
}

function activeIndex(items: NavItem[], loc: string): number {
  let idx = -1, bestLen = 0;
  items.forEach((it, i) => {
    const len = matchLen(it, loc);
    if (len > bestLen) { bestLen = len; idx = i; }
  });
  return idx;
}

function moduleGroups(section: string, wrap?: string): NavItem[] {
  const sec = allNavSections.find((s) => s.title === section);
  if (!sec) return [];
  if (wrap) {
    const w = sec.items.find((g) => g.label === wrap);
    return w?.children ?? [];
  }
  return sec.items;
}

function TabLink({ item, active, secondary, onClick }: {
  item: NavItem; active: boolean; secondary?: boolean; onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link href={item.path} asChild>
      <a
        onClick={onClick}
        data-testid={`module-tab-${basePath(item.path).replace(/\//g, "-").replace(/^-/, "")}`}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap border-b-2 transition-colors",
          secondary ? "px-3 py-2 text-sm" : "px-4 py-2.5 text-sm font-medium",
          active
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        {Icon ? <Icon className="h-4 w-4" /> : null}
        {item.label}
      </a>
    </Link>
  );
}

export function ModuleTabsNav({ section, wrap, primaryCount = 12 }: {
  section: string; wrap?: string; primaryCount?: number;
}) {
  const [loc] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const groups = moduleGroups(section, wrap);
  if (groups.length === 0) return null;

  const activeIdx = activeIndex(groups, loc);
  const primary = groups.slice(0, primaryCount);
  const overflow = groups.slice(primaryCount);
  const overflowActive = activeIdx >= primaryCount;
  const activeGroup = activeIdx >= 0 ? groups[activeIdx] : undefined;
  const subTabs = activeGroup?.children ?? [];
  const subActiveIdx = activeIndex(subTabs, loc);

  return (
    <div data-testid={`module-tabs-${section}`}>
      {/* الشريط الرئيسي — مجموعات الجانبية */}
      <div className="border-b mb-2 -mt-2 overflow-x-auto">
        <nav className="flex gap-1 min-w-max items-center" dir="rtl">
          {primary.map((g, i) => (
            <TabLink key={g.path + i} item={g} active={i === activeIdx} />
          ))}

          {overflow.length > 0 && (
            <div className="relative" onMouseLeave={() => setMoreOpen(false)}>
              <button
                type="button"
                data-testid="module-tab-more"
                onClick={() => setMoreOpen((v) => !v)}
                onMouseEnter={() => setMoreOpen(true)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  overflowActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
                المزيد
                <ChevronDown className="h-3 w-3" />
              </button>
              {moreOpen && (
                <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-md py-1 min-w-[220px] z-50">
                  {overflow.map((g, i) => {
                    const Icon = g.icon;
                    const active = primaryCount + i === activeIdx;
                    return (
                      <Link key={g.path + i} href={g.path} asChild>
                        <a
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted transition-colors",
                            active ? "text-primary font-medium" : "text-foreground"
                          )}
                        >
                          {Icon ? <Icon className="h-4 w-4" /> : null}
                          {g.label}
                        </a>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      {/* الشريط الفرعي — أبناء المجموعة النشطة */}
      {subTabs.length > 0 && (
        <div className="border-b mb-4 overflow-x-auto">
          <nav className="flex gap-1 min-w-max items-center" dir="rtl">
            {subTabs.map((c, i) => (
              <TabLink key={c.path + i} item={c} active={i === subActiveIdx} secondary />
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
