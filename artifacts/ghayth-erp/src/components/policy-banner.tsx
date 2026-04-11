import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { FileCheck, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Policy {
  id: number;
  title: string;
  description: string;
  category?: string;
  status: string;
}

const MODULE_LABELS: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  fleet: "الأسطول",
  property: "الأملاك",
  operations: "العمليات",
  warehouse: "المستودعات",
  governance: "الحوكمة",
  legal: "القانونية",
  crm: "المبيعات",
  support: "الدعم",
  comms: "التواصل",
  store: "المتجر",
  marketing: "التسويق",
};

function getModuleFromPath(path: string): string | null {
  if (path.startsWith("/hr") || path.startsWith("/employees")) return "hr";
  if (path.startsWith("/finance")) return "finance";
  if (path.startsWith("/fleet")) return "fleet";
  if (path.startsWith("/properties")) return "property";
  if (path.startsWith("/projects") || path.startsWith("/tasks")) return "operations";
  if (path.startsWith("/warehouse")) return "warehouse";
  if (path.startsWith("/governance")) return "governance";
  if (path.startsWith("/legal")) return "legal";
  if (path.startsWith("/crm") || path.startsWith("/clients")) return "crm";
  if (path.startsWith("/support")) return "support";
  if (path.startsWith("/communications")) return "comms";
  if (path.startsWith("/store")) return "store";
  if (path.startsWith("/marketing")) return "marketing";
  return null;
}

const dismissedKey = (module: string) => `erp_policy_dismissed_${module}`;

export function PolicyBanner({ currentPath }: { currentPath: string }) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const module = getModuleFromPath(currentPath);

  useEffect(() => {
    if (!module) {
      setPolicies([]);
      return;
    }

    setDismissed(false);
    setExpanded(false);

    const wasDismissed = sessionStorage.getItem(dismissedKey(module));
    if (wasDismissed) {
      setDismissed(true);
      return;
    }

    apiFetch<{ data: any[] }>(`/governance/module-policies/${module}`)
      .then((resp) => {
        const list = Array.isArray(resp) ? resp : resp?.data || [];
        setPolicies(list);
      })
      .catch(() => setPolicies([]));
  }, [module, currentPath]);

  if (!module || policies.length === 0 || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(dismissedKey(module), "1");
  };

  const first = policies[0];
  const hasMore = policies.length > 1;

  return (
    <div className="mx-4 lg:mx-8 mt-3">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileCheck className="h-4 w-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                سياسة {MODULE_LABELS[module] || module}
              </span>
            </div>
            <p className="text-sm font-medium text-blue-900">{first.title}</p>
            {first.description && (
              <p className="text-xs text-blue-700 mt-1 line-clamp-2">{first.description}</p>
            )}
            {hasMore && expanded && (
              <div className="mt-2 space-y-2 border-t border-blue-200 pt-2">
                {policies.slice(1).map((p) => (
                  <div key={p.id}>
                    <p className="text-sm font-medium text-blue-900">{p.title}</p>
                    {p.description && <p className="text-xs text-blue-700 mt-0.5">{p.description}</p>}
                  </div>
                ))}
              </div>
            )}
            {hasMore && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
              >
                {expanded ? (
                  <><ChevronUp className="h-3 w-3" />إخفاء</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />{policies.length - 1} سياسات أخرى</>
                )}
              </button>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-blue-400 hover:text-blue-600 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
