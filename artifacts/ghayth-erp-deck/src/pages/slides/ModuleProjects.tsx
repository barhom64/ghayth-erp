export default function ModuleProjects() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">PRJ</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 07 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          المشاريع
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          تخطيط وتنفيذ ومتابعة المشاريع بمراحل واضحة، موارد مخصّصة، وحساب تكلفة وربحية لكل مشروع لحظياً.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الخطط والمراحل</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">خطة مشروع، مراحل ومهام فرعية، اعتمادات وخط زمني تنفيذي.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الموارد والإسناد</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">إسناد فرق، معدّات، ومركبات، تتبّع ساعات عمل وحجوزات الموارد.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">التكاليف والربحية</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">موازنة مقابل الفعلي، التزامات مفتوحة، هامش ربح لحظي ومراكز تكلفة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">المتابعة والتقارير</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">لوحة تنفيذية للمشروع، نسب إنجاز، مخاطر مرصودة وتقارير لأصحاب المصلحة.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">11 / 19</div>
    </div>
  );
}
