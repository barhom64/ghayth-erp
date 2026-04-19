export default function ModuleSupport() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">SUP</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 08 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          الدعم الفني
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          منظومة دعم متكاملة تربط بلاغات العملاء بالاستجابة الميدانية، مع اتفاقيات مستوى خدمة قابلة للقياس.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">التذاكر والبلاغات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">قنوات استقبال متعدّدة، تصنيف ذكي، إسناد تلقائي وحالات معتمدة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">اتفاقيات SLA</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">أوقات استجابة وحلّ، مستويات أولوية، تنبيهات قبل التجاوز ومعايير قياس.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">قاعدة المعرفة</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">مقالات، حلول معتمدة، أسئلة شائعة ودعم ذاتي عبر بوابة العملاء.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">قياس رضا العملاء</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">استبيانات بعد الإغلاق، مؤشرات رضا، اتجاهات وتنبيه على التذاكر الحرجة.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">12 / 19</div>
    </div>
  );
}
