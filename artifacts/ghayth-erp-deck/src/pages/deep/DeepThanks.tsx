import { deepModuleEntries } from "../../data/deep-slides-data";

export default function DeepThanks() {
  const totalSlides = deepModuleEntries.length + 2;
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-white" dir="rtl">
      <div className="absolute top-[6vh] right-[6vw] text-accent font-display text-[1vw] tracking-[0.4em] font-bold">
        GHAYTH ERP · DEEP-DIVE
      </div>

      <div className="absolute top-[28vh] right-[6vw] w-[60vw]">
        <h1 className="font-display font-black text-[4.2vw] leading-[1] tracking-tighter">
          نهاية جلسة التعمّق
        </h1>
        <p className="font-body text-white/80 text-[1.15vw] mt-[2vh] leading-relaxed font-light max-w-[55vw]">
          استعرضنا {deepModuleEntries.length} وحدات تشغيلية بلقطات شاشة موسّعة وتعليقات تفصيلية.
          الخطوة التالية: جلسة عرض حيّ تفاعلية على بيئة الاختبار، أو ورشة تخطيط لخارطة التبنّي
          مع الإدارة المعنية.
        </p>
      </div>

      <div className="absolute bottom-[8vh] right-[6vw] grid grid-cols-3 gap-x-[2vw] gap-y-[1.5vh] w-[55vw]">
        {deepModuleEntries.map((e, i) => (
          <div key={e.key} className="flex items-center gap-[0.6vw]">
            <span className="text-accent font-display text-[0.85vw] font-black w-[2vw]">
              {String(i + 2).padStart(2, "0")}
            </span>
            <span className="text-white/85 font-body text-[0.9vw]">{e.title}</span>
          </div>
        ))}
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-white/50 font-body text-[0.85vw]">
        {String(totalSlides).padStart(2, "0")} / {String(totalSlides).padStart(2, "0")}
      </div>
    </div>
  );
}
