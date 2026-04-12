import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Link, useRoute } from "wouter";

function KBList() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const url = debouncedQ ? `/kb?q=${encodeURIComponent(debouncedQ)}` : "/kb";
  const { data, isLoading } = useApiQuery<any>(["portal-kb", debouncedQ], url);
  const articles: any[] = data?.data || [];

  const handleSearch = (val: string) => {
    setQ(val);
    clearTimeout((window as any)._kbTimeout);
    (window as any)._kbTimeout = setTimeout(() => setDebouncedQ(val), 400);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">مركز المساعدة</h1>
        <p className="text-sm text-gray-500 mt-1">ابحث في قاعدة المعرفة وتصفح المقالات</p>
      </div>

      <div className="relative">
        <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="ابحث عن مقالة..."
          value={q}
          onChange={e => handleSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : articles.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm">لا توجد مقالات مطابقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a: any) => (
            <Link key={a.id} href={`/kb/${a.id}`}>
              <a className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug">{a.title}</h3>
                    {a.category && <span className="text-xs text-blue-600 mt-1 inline-block">{a.category}</span>}
                    {a.tags && a.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(Array.isArray(a.tags) ? a.tags : []).slice(0, 3).map((t: string) => (
                          <span key={t} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap flex items-center gap-1 shrink-0">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {a.views || 0}
                  </div>
                </div>
              </a>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function KBArticle() {
  const [, params] = useRoute("/kb/:id");
  const id = params?.id || "";
  const { data: article, isLoading } = useApiQuery<any>(["portal-kb-article", id], `/kb/${id}`, !!id);
  const [feedback, setFeedback] = useState<"helpful" | "not_helpful" | null>(null);

  const sendFeedback = async (helpful: boolean) => {
    if (feedback) return;
    try {
      await apiFetch(`/kb/${id}/feedback`, { method: "POST", body: JSON.stringify({ helpful }) });
      setFeedback(helpful ? "helpful" : "not_helpful");
    } catch {}
  };

  if (isLoading) return <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />;
  if (!article) return (
    <div className="text-center py-12 text-gray-500">
      <p className="text-4xl mb-2">😕</p>
      <p>المقالة غير موجودة</p>
      <Link href="/kb"><a className="text-blue-600 text-sm hover:underline mt-2 block">العودة لمركز المساعدة</a></Link>
    </div>
  );

  return (
    <div className="space-y-5">
      <Link href="/kb">
        <a className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          مركز المساعدة
        </a>
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{article.title}</h1>
          {article.category && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">{article.category}</span>
              <span className="text-xs text-gray-400">{article.views || 0} مشاهدة</span>
            </div>
          )}
        </div>

        {article.content && (
          <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap">
            {article.content}
          </div>
        )}

        {article.tags && (Array.isArray(article.tags) ? article.tags : []).length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {(Array.isArray(article.tags) ? article.tags : []).map((t: string) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">هل كانت هذه المقالة مفيدة؟</p>
          {feedback ? (
            <p className="text-sm text-green-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              شكراً على تقييمك
            </p>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => sendFeedback(true)} className="flex items-center gap-2 px-4 py-2 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" /></svg>
                نعم، مفيدة ({article.helpful || 0})
              </button>
              <button onClick={() => sendFeedback(false)} className="flex items-center gap-2 px-4 py-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.095c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2m5-10h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" /></svg>
                لا، غير مفيدة ({article.notHelpful || 0})
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function KBPage() {
  return <KBList />;
}

export function KBArticlePage() {
  return <KBArticle />;
}
