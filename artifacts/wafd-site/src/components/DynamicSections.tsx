/**
 * DynamicSections — أقسام الصفحة الرئيسية المُدارة من لوحة تحكم غيث (الموقع الإلكتروني).
 * آراء العملاء + فريق العمل + معرض الصور. كل قسم يختفي تلقائياً عند غياب البيانات
 * (تدهور لطيف — لا محتوى وهمي). المصدر: SiteDataContext (GET /api/public/site/wafd).
 */
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useSiteData } from "@/contexts/SiteDataContext";

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <motion.div
      className="text-center mb-12"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="text-[oklch(0.72_0.09_75)] text-sm tracking-widest mb-2" style={{ fontFamily: "'Cairo', sans-serif" }}>
        ✦ {eyebrow} ✦
      </div>
      <h2 className="text-3xl md:text-4xl font-bold text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
        {title}
      </h2>
      {subtitle && (
        <p className="text-[oklch(0.50_0.005_0)] mt-2" style={{ fontFamily: "'Tajawal', sans-serif" }}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

function TestimonialsSection() {
  const { testimonials } = useSiteData();
  if (!testimonials.length) return null;
  return (
    <section className="py-20 bg-white" dir="rtl">
      <div className="container">
        <SectionHeading eyebrow="آراء عملائنا" title="ماذا قال ضيوف الرحمن عنّا" subtitle="ثقة معتمرينا هي أغلى ما نملك" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((tst, i) => (
            <motion.div
              key={tst.id}
              className="bg-[oklch(0.98_0.002_80)] rounded-2xl p-6 border border-[oklch(0.90_0.006_80)] flex flex-col"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              {typeof tst.rating === "number" && tst.rating > 0 && (
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, s) => (
                    <Star
                      key={s}
                      size={16}
                      className={s < (tst.rating ?? 0) ? "text-[oklch(0.72_0.09_75)]" : "text-[oklch(0.88_0.004_80)]"}
                      fill={s < (tst.rating ?? 0) ? "currentColor" : "none"}
                    />
                  ))}
                </div>
              )}
              <p className="text-[oklch(0.35_0.005_0)] leading-relaxed flex-1" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                {tst.body}
              </p>
              <div className="flex items-center gap-3 mt-5">
                {tst.avatarUrl ? (
                  <img src={tst.avatarUrl} alt={tst.authorName} className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
                  >
                    {tst.authorName.charAt(0)}
                  </div>
                )}
                <div>
                  <div className="font-bold text-[oklch(0.14_0.005_0)] text-sm" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {tst.authorName}
                  </div>
                  {tst.authorTitle && (
                    <div className="text-xs text-[oklch(0.55_0.005_0)]" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                      {tst.authorTitle}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSection() {
  const { team } = useSiteData();
  if (!team.length) return null;
  return (
    <section className="py-20 bg-[oklch(0.975_0.008_80)]" dir="rtl">
      <div className="container">
        <SectionHeading eyebrow="فريق العمل" title="من يخدمك في وفد" subtitle="نخبة من المختصين في خدمة ضيوف الرحمن" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {team.map((member, i) => (
            <motion.div
              key={member.id}
              className="bg-white rounded-2xl p-6 border border-[oklch(0.90_0.006_80)] text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              {member.photoUrl ? (
                <img src={member.photoUrl} alt={member.name} className="w-24 h-24 rounded-full object-cover mx-auto mb-4" />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4"
                  style={{ background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))", fontFamily: "'Cairo', sans-serif" }}
                >
                  {member.name.charAt(0)}
                </div>
              )}
              <h3 className="font-bold text-[oklch(0.14_0.005_0)]" style={{ fontFamily: "'Cairo', sans-serif" }}>
                {member.name}
              </h3>
              {member.role && (
                <div className="text-sm text-[oklch(0.52_0.12_185)] mt-1 font-medium" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {member.role}
                </div>
              )}
              {member.bio && (
                <p className="text-xs text-[oklch(0.55_0.005_0)] mt-2 leading-relaxed" style={{ fontFamily: "'Tajawal', sans-serif" }}>
                  {member.bio}
                </p>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GallerySection() {
  const { gallery } = useSiteData();
  if (!gallery.length) return null;
  return (
    <section className="py-20 bg-white" dir="rtl">
      <div className="container">
        <SectionHeading eyebrow="معرض الصور" title="لحظات من رحلات ضيوفنا" subtitle="صور من رحلات العمرة والخدمات التي نقدمها" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {gallery.map((item, i) => (
            <motion.div
              key={item.id}
              className="group relative rounded-2xl overflow-hidden aspect-square"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
            >
              <img
                src={item.imageUrl}
                alt={item.title ?? "صورة من معرض وفد"}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              {item.title && (
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-sm font-bold" style={{ fontFamily: "'Cairo', sans-serif" }}>
                    {item.title}
                  </span>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DynamicSections() {
  return (
    <>
      <TestimonialsSection />
      <TeamSection />
      <GallerySection />
    </>
  );
}
