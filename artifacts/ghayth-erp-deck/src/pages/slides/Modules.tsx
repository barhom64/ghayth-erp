export default function Modules() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-primary px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-full h-[8vh] bg-gradient-to-b from-black/30 to-transparent" />

      <div className="flex items-end justify-between mb-[4vh]">
        <div>
          <div className="text-accent font-body text-[1.1vw] font-semibold tracking-wider mb-[1.5vh]">
            الفصل الثالث · الوحدات
          </div>
          <h2 className="font-display text-white font-black text-[4vw] leading-[1.05] tracking-tighter">
            منظومة وحدات متكاملة
          </h2>
        </div>
        <div className="text-white/60 font-body text-[1vw] pb-[1vh]">كل وحدة مستقلّة · تعمل مع شقيقاتها بسلاسة</div>
      </div>

      <div className="grid grid-cols-4 grid-rows-3 gap-[1.2vw]">
        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">HR</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">الموارد البشرية</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">رواتب · حضور · إجازات · أداء</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">FIN</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">المالية والمحاسبة</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">قيود · ميزانيات · ضرائب · بنوك</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">OPS</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">العمليات</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">طلبات · مهام · سير عمل · جداول</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">FLT</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">الأسطول</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">مركبات · صيانة · وقود · سائقون</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">RE</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">الأملاك</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">عقود · إيجارات · صيانة · مستأجرون</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">LGL</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">القانونية</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">قضايا · عقود · مواعيد · مرفقات</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">PRJ</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">المشاريع</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">خطط · مراحل · موارد · تكاليف</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">SUP</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">الدعم الفني</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">تذاكر · SLA · قاعدة معرفة</div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">CRM</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">إدارة العملاء</div>
          <div className="text-white/60 font-body text-[0.95vw] mt-[0.6vh]">عملاء · فرص · أنشطة · 360°</div>
        </div>

        <div className="bg-accent/15 border border-accent/40 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">PRT-1</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">بوابة الموظف</div>
          <div className="text-white/70 font-body text-[0.95vw] mt-[0.6vh]">خدمات ذاتية وإشعارات</div>
        </div>

        <div className="bg-accent/15 border border-accent/40 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">PRT-2</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">بوابة العملاء</div>
          <div className="text-white/70 font-body text-[0.95vw] mt-[0.6vh]">عقود · فواتير · طلبات</div>
        </div>

        <div className="bg-accent/15 border border-accent/40 rounded-xl p-[1.4vw]">
          <div className="text-accent font-display text-[1vw] font-bold tracking-widest">PRT-3</div>
          <div className="text-white font-display text-[1.6vw] font-bold mt-[0.8vh] leading-tight">بوابة التوظيف</div>
          <div className="text-white/70 font-body text-[0.95vw] mt-[0.6vh]">إعلانات · سيرة · تقييم</div>
        </div>
      </div>

      <div className="absolute bottom-[2.5vh] left-[6vw] text-white/50 font-body text-[1vw]">04 / 19</div>
    </div>
  );
}
