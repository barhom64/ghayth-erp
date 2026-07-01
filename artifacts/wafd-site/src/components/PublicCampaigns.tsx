/**
 * PublicCampaigns — يعرض الحملات التسويقية المنشورة علناً (isPublic) من نواة
 * غيث. عند الضغط على زر الحملة يُفتح نموذج الطلب مع تمرير slug الحملة لعزو
 * العميل المحتمل إليها في CRM. يُخفى القسم بالكامل عند عدم وجود حملات نشطة.
 */
import { motion } from "framer-motion";
import { Megaphone, ArrowLeft } from "lucide-react";
import { useSiteData } from "@/contexts/SiteDataContext";
import { useLeadForm } from "@/contexts/LeadFormContext";

export default function PublicCampaigns() {
  const { campaigns } = useSiteData();
  const { open } = useLeadForm();

  if (!campaigns || campaigns.length === 0) return null;

  return (
    <section className="py-20 bg-[oklch(0.975_0.008_80)]" dir="rtl">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
            style={{ background: "oklch(0.52 0.12 185 / 0.1)", color: "oklch(0.42 0.12 185)" }}
          >
            <Megaphone size={16} />
            <span className="text-sm font-bold" style={{ fontFamily: "'Cairo', sans-serif" }}>
              عروض وحملات وفد
            </span>
          </div>
          <h2
            className="text-3xl md:text-4xl font-black text-[oklch(0.14_0.005_0)]"
            style={{ fontFamily: "'Cairo', sans-serif" }}
          >
            عروضنا الحالية
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map((c, i) => (
            <motion.div
              key={c.id}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[oklch(0.92_0.005_80)] flex flex-col"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              {c.imageUrl && (
                <div className="h-44 overflow-hidden bg-[oklch(0.95_0.005_80)]">
                  <img
                    src={c.imageUrl}
                    alt={c.headline || c.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              <div className="p-6 flex flex-col flex-1">
                <h3
                  className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-2"
                  style={{ fontFamily: "'Cairo', sans-serif" }}
                >
                  {c.headline || c.name}
                </h3>
                {c.body && (
                  <p
                    className="text-[oklch(0.45_0.005_0)] text-sm leading-relaxed mb-5 flex-1"
                    style={{ fontFamily: "'Tajawal', sans-serif" }}
                  >
                    {c.body}
                  </p>
                )}
                <button
                  onClick={() => open({ slug: c.slug, label: c.headline || c.name })}
                  className="mt-auto inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-white font-bold text-sm transition-all hover:opacity-90"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                    fontFamily: "'Cairo', sans-serif",
                  }}
                >
                  {c.ctaLabel || "اطلب الآن"}
                  <ArrowLeft size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
