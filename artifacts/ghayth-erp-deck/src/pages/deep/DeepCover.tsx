import { deepModuleEntries } from "../../data/deep-slides-data";

export default function DeepCover() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary text-white" dir="rtl">
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, #C8A24C 0, transparent 40%), radial-gradient(circle at 80% 70%, #C8A24C 0, transparent 40%)",
      }} />
      <div className="absolute top-[6vh] right-[6vw] text-accent font-display text-[1vw] tracking-[0.4em] font-bold">
        GHAYTH ERP · DEEP-DIVE
      </div>
      <div className="absolute top-[6vh] left-[6vw] text-white/60 font-body text-[0.9vw] tracking-[0.25em]">
        نسخة موسّعة للمدير العام والفرق التشغيلية
      </div>

      <div className="absolute top-[34vh] right-[6vw] w-[60vw]">
        <h1 className="font-display font-black text-[5.2vw] leading-[1] tracking-tighter">
          غيث ERP
        </h1>
        <h2 className="font-display font-bold text-[2.4vw] mt-[1.5vh] text-accent leading-tight">
          جلسة تعمّق · {deepModuleEntries.length} وحدات بلقطات شاشة موسّعة
        </h2>
        <p className="font-body text-white/80 text-[1.1vw] mt-[2vh] leading-relaxed font-light max-w-[55vw]">
          هذه نسخة مرافقة للعرض التنفيذي القصير. كل شريحة تخصّص لقطة شاشة شبه كاملة لوحدة واحدة،
          مع 5–7 تعليقات تشغيلية تفصيلية. مخصّصة للجلسات الأطول وورش العمل التشغيلية.
        </p>
      </div>

      <div className="absolute bottom-[6vh] right-[6vw] flex items-center gap-[2vw] text-white/80 font-body text-[0.95vw]">
        <div>
          <div className="text-accent font-display font-bold">
            {deepModuleEntries.length}
          </div>
          <div className="text-white/60 text-[0.85vw]">وحدات تشغيلية</div>
        </div>
        <div className="w-px h-[3vh] bg-white/30" />
        <div>
          <div className="text-accent font-display font-bold">5–7</div>
          <div className="text-white/60 text-[0.85vw]">تعليقات لكل وحدة</div>
        </div>
        <div className="w-px h-[3vh] bg-white/30" />
        <div>
          <div className="text-accent font-display font-bold">PDF</div>
          <div className="text-white/60 text-[0.85vw]">تصدير منفصل</div>
        </div>
      </div>

      <div className="absolute bottom-[6vh] left-[6vw] text-white/50 font-body text-[0.85vw]">
        01 / {String(deepModuleEntries.length + 2).padStart(2, "0")}
      </div>
    </div>
  );
}
