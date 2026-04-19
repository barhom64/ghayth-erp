export default function Features() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[7vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[18vw] h-[18vw] rounded-full bg-accent/10 -translate-y-1/3 translate-x-1/3" />

      <div className="flex items-end justify-between mb-[5vh]">
        <div>
          <div className="text-accent font-body text-[1.1vw] font-semibold tracking-wider mb-[1.5vh]">
            الفصل الثاني · المميزات
          </div>
          <h2 className="font-display text-text font-black text-[4vw] leading-[1.05] tracking-tighter">
            ما الذي يجعل غيث مختلفاً
          </h2>
        </div>
        <div className="text-muted font-body text-[1vw] pb-[1vh]">
          ست ركائز تقنية تميّز المنصّة
        </div>
      </div>

      <div className="grid grid-cols-3 gap-[2vw] relative z-10">
        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">نظام موحّد</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">قاعدة بيانات واحدة وهوية مستخدم واحدة عبر كل الوحدات — لا تكرار ولا فجوات.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">عربي RTL أصيل</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">واجهة وتقارير وقوالب وطباعة PDF — كل شيء صُمّم بالعربية أولاً، لا ترجمة لاحقة.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">محرّك أحداث</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">أتمتة قواعد العمل والإشعارات والموافقات بمحرّك مرن قابل للتخصيص دون كود.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">صلاحيات وأدوار</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">نموذج صلاحيات دقيق على مستوى الحقل والإجراء، يدعم التفويض والمناوبات.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">لوحات وتقارير</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">مؤشرات أداء لحظية، تقارير قابلة للتصدير، ولوحات تنفيذية لكل إدارة.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2.2vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[2.4vw] font-bold leading-tight">DMS وتكاملات</div>
          <div className="font-body text-muted text-[1.1vw] mt-[1.5vh] leading-relaxed">إدارة وثائق وقوالب وطباعة PDF، وتكاملات حكومية وبنكية جاهزة للربط.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">03 / 19</div>
    </div>
  );
}
