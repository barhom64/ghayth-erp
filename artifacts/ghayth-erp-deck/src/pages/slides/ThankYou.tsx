const base = import.meta.env.BASE_URL;

export default function ThankYou() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary" dir="rtl">
      <img
        src={`${base}hero.png`}
        crossOrigin="anonymous"
        className="absolute inset-0 w-full h-full object-cover opacity-25"
        alt=""
      />
      <div className="absolute inset-0 bg-gradient-to-l from-[#0E3B43]/95 via-[#0E3B43]/85 to-[#0E3B43]/55" />

      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1vw]">
        <div className="w-[2.4vw] h-[2.4vw] rounded-full bg-accent" />
        <span className="font-display text-[1.5vw] font-bold text-white tracking-tight">
          غـيـث · Ghayth
        </span>
      </div>

      <div className="absolute top-[26vh] right-[6vw] max-w-[60vw]">
        <div className="text-accent font-display text-[1.4vw] font-semibold tracking-wider mb-[2vh]">
          شكراً لكم
        </div>
        <h1 className="font-display text-white font-black text-[7vw] leading-[0.95] tracking-tighter">
          نُسعد بخدمتكم
        </h1>
        <p className="font-body text-white/85 text-[1.6vw] mt-[3vh] leading-relaxed font-light max-w-[55vw]">
          فريق غيث جاهز للعرض الحيّ، جلسة تمكين، أو ورشة تخطيط لخارطة التبنّي والتشغيل.
        </p>
      </div>

      <div className="absolute bottom-[12vh] right-[6vw] left-[6vw] grid grid-cols-3 gap-[2vw]">
        <div className="border-r-2 border-accent pr-[1.5vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-[0.3em] mb-[0.8vh]">عرض حيّ</div>
          <div className="text-white font-display text-[1.6vw] font-bold leading-tight">جولة تفاعلية</div>
          <div className="text-white/65 font-body text-[1.05vw] mt-[0.5vh]">عبر بيئة الاختبار الكاملة</div>
        </div>
        <div className="border-r-2 border-accent pr-[1.5vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-[0.3em] mb-[0.8vh]">التواصل</div>
          <div className="text-white font-display text-[1.6vw] font-bold leading-tight">فريق المشروع</div>
          <div className="text-white/65 font-body text-[1.05vw] mt-[0.5vh]">عبر القنوات الرسمية للمؤسسة</div>
        </div>
        <div className="border-r-2 border-accent pr-[1.5vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-[0.3em] mb-[0.8vh]">الخطوة التالية</div>
          <div className="text-white font-display text-[1.6vw] font-bold leading-tight">جلسة تخطيط</div>
          <div className="text-white/65 font-body text-[1.05vw] mt-[0.5vh]">خارطة التبنّي ومؤشرات النجاح</div>
        </div>
      </div>

      <div className="absolute bottom-[5vh] right-[6vw] left-[6vw] flex items-center justify-between text-white/55 font-body text-[1vw] border-t border-white/15 pt-[2vh]">
        <span>غيث ERP · نظام تشغيل مؤسسي</span>
        <span>2026 · إصدار العرض الإداري</span>
      </div>
    </div>
  );
}
