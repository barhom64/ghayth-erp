export default function ModuleFleet() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">FLT</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 04 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          الأسطول
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          تشغيل وصيانة المركبات والمعدّات بسجل تشغيلي كامل، يربط الاستهلاك والتكلفة والصيانة بالأرباح والمشاريع.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">المركبات والمعدّات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">سجل أصول، استمارات، تأمين، فحص دوري، إسناد للسائقين والمشاريع.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الصيانة الوقائية</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">خطط صيانة دورية، أوامر إصلاح، مخزون قطع غيار وتكلفة لكل مركبة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الوقود والاستهلاك</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">قسائم وقود، تتبّع كيلومترات، مؤشرات كفاءة وتنبيهات شاذّة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الرحلات والمهام الميدانية</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">جدولة رحلات، إذونات حركة، ربط بالعمليات والمشاريع وتقارير إنجاز.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">08 / 19</div>
    </div>
  );
}
