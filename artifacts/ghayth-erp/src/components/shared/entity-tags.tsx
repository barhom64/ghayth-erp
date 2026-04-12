import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Tag, X, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

const PRESET_TAGS = [
  { tag: "عاجل", color: "red" },
  { tag: "متأخر", color: "orange" },
  { tag: "مهم", color: "yellow" },
  { tag: "كبار العملاء", color: "purple" },
  { tag: "معلق", color: "gray" },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  red: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
  orange: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
  yellow: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-200" },
  purple: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  gray: { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200" },
  blue: { bg: "bg-blue-100", text: "text-blue-700", border: "border-blue-200" },
  green: { bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
};

interface EntityTagsProps {
  entityType: string;
  entityId: number | string;
  className?: string;
  inline?: boolean;
}

export function EntityTags({ entityType, entityId, className, inline }: EntityTagsProps) {
  const qc = useQueryClient();
  const qk = ["entity-tags", entityType, String(entityId)];
  const { data } = useApiQuery<any>(qk, `/entity-meta/tags/${entityType}/${entityId}`, !!entityId);
  const tags = data?.data || [];
  const [showPresets, setShowPresets] = useState(false);

  const addTag = async (tag: string, color: string) => {
    try {
      await apiFetch(`/entity-meta/tags/${entityType}/${entityId}`, {
        method: "POST",
        body: JSON.stringify({ tag, color }),
      });
      qc.invalidateQueries({ queryKey: qk });
      setShowPresets(false);
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في إضافة الوسم", description: err.message });
    }
  };

  const removeTag = async (id: number) => {
    try {
      await apiFetch(`/entity-meta/tags/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: qk });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في حذف الوسم", description: err.message });
    }
  };

  const existingNames = new Set(tags.map((t: any) => t.tag));
  const availablePresets = PRESET_TAGS.filter((p) => !existingNames.has(p.tag));

  if (inline) {
    return (
      <div className={cn("flex items-center gap-1 flex-wrap", className)}>
        {tags.map((t: any) => {
          const c = COLOR_MAP[t.color] || COLOR_MAP.blue;
          return (
            <span key={t.id} className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border", c.bg, c.text, c.border)}>
              {t.tag}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Tag className="h-4 w-4" />
        <span>الوسوم</span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {tags.map((t: any) => {
          const c = COLOR_MAP[t.color] || COLOR_MAP.blue;
          return (
            <span key={t.id} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border group", c.bg, c.text, c.border)}>
              {t.tag}
              <button onClick={() => removeTag(t.id)} className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600">
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}

        <button
          onClick={() => setShowPresets(!showPresets)}
          className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs text-gray-500 border border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          وسم
        </button>
      </div>

      {showPresets && availablePresets.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap p-2 bg-gray-50 rounded-lg">
          {availablePresets.map((p) => {
            const c = COLOR_MAP[p.color] || COLOR_MAP.blue;
            return (
              <button
                key={p.tag}
                onClick={() => addTag(p.tag, p.color)}
                className={cn("px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:shadow-sm transition-shadow", c.bg, c.text, c.border)}
              >
                + {p.tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function useTagFilter(entityType: string) {
  const { data: tagsListResp } = useApiQuery<any>(
    [`entity-tags-list-${entityType}`],
    `/entity-meta/tags-list/${entityType}`
  );
  const tagsList: Array<{ tag: string; color: string; count: number }> = tagsListResp?.data || [];

  const [selectedTag, setSelectedTag] = useState("");

  const { data: filteredIdsResp } = useApiQuery<any>(
    [`entity-tags-filter-${entityType}`, selectedTag],
    `/entity-meta/tags-filter/${entityType}?tag=${encodeURIComponent(selectedTag)}`,
    !!selectedTag
  );
  const filteredIds: Set<number> | null = selectedTag
    ? new Set((filteredIdsResp?.data || []).map(Number))
    : null;

  return { tagsList, selectedTag, setSelectedTag, filteredIds };
}

export function TagFilterSelect({
  tagsList,
  selectedTag,
  onSelect,
}: {
  tagsList: Array<{ tag: string; color: string; count: number }>;
  selectedTag: string;
  onSelect: (tag: string) => void;
}) {
  if (!tagsList || tagsList.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <Tag className="h-3.5 w-3.5 text-gray-400" />
      <select
        className="border rounded-md px-2 py-1 text-xs bg-white min-w-[120px]"
        value={selectedTag}
        onChange={(e) => onSelect(e.target.value)}
      >
        <option value="">كل الوسوم</option>
        {tagsList.map((t) => (
          <option key={t.tag} value={t.tag}>
            {t.tag} ({t.count})
          </option>
        ))}
      </select>
      {selectedTag && (
        <button onClick={() => onSelect("")} className="text-gray-400 hover:text-gray-600">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function TagBadges({ tags }: { tags: Array<{ tag: string; color: string }> }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {tags.map((t, i) => {
        const c = COLOR_MAP[t.color] || COLOR_MAP.blue;
        return (
          <span key={i} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border", c.bg, c.text, c.border)}>
            {t.tag}
          </span>
        );
      })}
    </div>
  );
}
