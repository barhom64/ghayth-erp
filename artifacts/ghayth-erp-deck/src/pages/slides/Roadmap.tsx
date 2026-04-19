export default function Roadmap() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary px-[6vw] py-[7vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[20vw] h-[20vw] rounded-full bg-accent/15 -translate-y-1/3 translate-x-1/3" />

      <div className="text-accent font-body text-[1.1vw] font-semibold tracking-wider mb-[1.5vh]">
        الحالة والخارطة
      </div>
      <h2 className="font-display text-white font-black text-[3.8vw] leading-[1.05] tracking-tighter max-w-[60vw]">
        أين نحن اليوم · وإلى أين نتجه
      </h2>

      <div className="mt-[6vh] grid grid-cols-3 gap-[2vw]">
        <div className="bg-white/8 border border-white/15 rounded-2xl p-[2vw]">
          <div className="text-accent font-body text-[1vw] font-bold tracking-widest">المرحلة الحالية</div>
          <div className="font-display text-white text-[2.4vw] font-bold mt-[1vh] leading-tight">منصّة قيد التشغيل</div>
          <div className="font-body text-white/70 text-[1.1vw] mt-[2vh] leading-relaxed">الوحدات الأساسية تعمل، البوابات الثلاث منشورة، التكاملات الأولى مكتملة.</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-2xl p-[2vw]">
          <div className="text-accent font-body text-[1vw] font-bold tracking-widest">المرحلة القادمة</div>
          <div className="font-display text-white text-[2.4vw] font-bold mt-[1vh] leading-tight">توسعة وتعميق</div>
          <div className="font-body text-white/70 text-[1.1vw] mt-[2vh] leading-relaxed">تعزيز التقارير التنفيذية، تطوير وحدات القانونية والمشاريع، توسيع التكاملات الحكومية.</div>
        </div>

        <div className="bg-accent rounded-2xl p-[2vw]">
          <div className="text-primary font-body text-[1vw] font-bold tracking-widest">الأفق</div>
          <div className="font-display text-primary text-[2.4vw] font-bold mt-[1vh] leading-tight">ذكاء وقرار</div>
          <div className="font-body text-primary/85 text-[1.1vw] mt-[2vh] leading-relaxed">طبقة تحليلية متقدّمة، توصيات مدعومة بالذكاء الاصطناعي، وأتمتة شاملة لدورات الأعمال.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-white/50 font-body text-[1vw]">18 / 19</div>
    </div>
  );
}
