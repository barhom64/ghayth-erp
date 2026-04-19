export default function Benefits() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[7vh]" dir="rtl">
      <div className="absolute top-[6vh] right-[6vw] text-accent font-body text-[1.1vw] font-semibold tracking-wider">
        الفصل السادس · العائد
      </div>
      <h2 className="absolute top-[10vh] right-[6vw] font-display text-text font-black text-[4vw] leading-[1.05] tracking-tighter max-w-[60vw]">
        ماذا يكسب القرار التنفيذي؟
      </h2>

      <div className="absolute top-[28vh] right-[6vw] left-[6vw] grid grid-cols-4 gap-[1.5vw]">
        <div className="bg-primary rounded-2xl p-[2vw]">
          <div className="font-display text-accent text-[5vw] font-black leading-none tracking-tighter">−40٪</div>
          <div className="font-display text-white text-[1.4vw] font-bold mt-[1vh]">زمن الإجراءات</div>
          <div className="font-body text-white/65 text-[1vw] mt-[0.5vh] leading-snug">أتمتة الموافقات والإشعارات</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2vw] border border-line">
          <div className="font-display text-primary text-[5vw] font-black leading-none tracking-tighter">+3×</div>
          <div className="font-display text-text text-[1.4vw] font-bold mt-[1vh]">سرعة التقارير</div>
          <div className="font-body text-muted text-[1vw] mt-[0.5vh] leading-snug">من ساعات إلى ثوانٍ</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2vw] border border-line">
          <div className="font-display text-primary text-[5vw] font-black leading-none tracking-tighter">100٪</div>
          <div className="font-display text-text text-[1.4vw] font-bold mt-[1vh]">رؤية تنفيذية</div>
          <div className="font-body text-muted text-[1vw] mt-[0.5vh] leading-snug">لوحة موحّدة للمدير العام</div>
        </div>

        <div className="bg-accent rounded-2xl p-[2vw]">
          <div className="font-display text-primary text-[5vw] font-black leading-none tracking-tighter">1</div>
          <div className="font-display text-primary text-[1.4vw] font-bold mt-[1vh]">نظام واحد</div>
          <div className="font-body text-primary/80 text-[1vw] mt-[0.5vh] leading-snug">بدلاً من عشرة أنظمة منفصلة</div>
        </div>
      </div>

      <div className="absolute bottom-[8vh] right-[6vw] left-[6vw] flex items-center justify-between bg-surface rounded-xl px-[2.5vw] py-[2vh] border-r-4 border-accent">
        <div className="font-display text-primary text-[1.6vw] font-bold">حوكمة أوضح · بيانات موثوقة · قرارات أسرع</div>
        <div className="font-body text-muted text-[1.1vw]">مؤشرات تقديرية مبنية على المراحل المنفذة من المنصة</div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">17 / 19</div>
    </div>
  );
}
