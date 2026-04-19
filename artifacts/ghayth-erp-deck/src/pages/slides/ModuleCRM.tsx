export default function ModuleCRM() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">CRM</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 09 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          إدارة علاقات العملاء
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          صورة موحّدة لكل عميل عبر العقود والفواتير والتذاكر والأنشطة — أساس قرارات بيع وخدمة أكثر ذكاءً.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">العملاء وقاعدة الاتصال</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">عميل واحد بهوية موحّدة، فروع وأشخاص اتصال وتاريخ تفاعل كامل.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الفرص ومسارات البيع</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">قمع مبيعات بمراحل، احتمالية، توقعات إيراد ومتابعة المهام.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الأنشطة والتواصل</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">مكالمات، اجتماعات، بريد، تذكيرات تلقائية وقوالب رسائل موحّدة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">عميل 360°</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">عرض موحّد: عقود، فواتير، تذاكر، أرصدة، عقارات، تنبيهات سلوك.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">13 / 19</div>
    </div>
  );
}
