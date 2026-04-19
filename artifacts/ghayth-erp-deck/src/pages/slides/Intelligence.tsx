export default function Intelligence() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg" dir="rtl">
      <div className="absolute top-0 left-0 w-[45vw] h-full bg-primary" />
      <div className="absolute top-0 left-[45vw] w-[6vw] h-full bg-accent" />

      <div className="absolute top-[8vh] left-[6vw] w-[33vw]">
        <div className="text-accent font-body text-[1.1vw] font-semibold tracking-wider mb-[1.5vh]">
          الذكاء والأتمتة
        </div>
        <h2 className="font-display text-white font-black text-[3.6vw] leading-[1.05] tracking-tighter">
          عقل تشغيلي يعمل خلف الكواليس
        </h2>
        <p className="font-body text-white/75 text-[1.3vw] mt-[3vh] leading-relaxed font-light">
          مهام مجدولة، مراقبة مستمرة، وقرارات مدعومة بالبيانات — يحرّر فريقك من العمل اليدوي ويرفع جودة التنفيذ.
        </p>
      </div>

      <div className="absolute top-[8vh] right-[6vw] w-[40vw] flex flex-col gap-[2vh]">
        <div className="bg-surface rounded-2xl p-[2vw] border-r-4 border-accent">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-primary text-[1.8vw] font-bold">مهام مجدولة (Cron)</div>
            <div className="font-display text-accent text-[1.2vw] font-bold">24/7</div>
          </div>
          <div className="font-body text-muted text-[1.05vw] mt-[1vh] leading-snug">احتساب الرواتب، تذكير العقود، إغلاق الفترات، تنبيهات الانتهاء.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2vw] border-r-4 border-primary">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-primary text-[1.8vw] font-bold">مؤشرات أداء KPIs</div>
            <div className="font-display text-accent text-[1.2vw] font-bold">Live</div>
          </div>
          <div className="font-body text-muted text-[1.05vw] mt-[1vh] leading-snug">لوحات لحظية لكل إدارة ومستوى إداري، مع مقارنات وأهداف.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2vw] border-r-4 border-accent">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-primary text-[1.8vw] font-bold">عميل 360°</div>
            <div className="font-display text-accent text-[1.2vw] font-bold">CRM+</div>
          </div>
          <div className="font-body text-muted text-[1.05vw] mt-[1vh] leading-snug">صورة واحدة شاملة: عقود · فواتير · تذاكر · أنشطة · رصيد.</div>
        </div>

        <div className="bg-surface rounded-2xl p-[2vw] border-r-4 border-primary">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-primary text-[1.8vw] font-bold">تنبيهات ذكية</div>
            <div className="font-display text-accent text-[1.2vw] font-bold">Push</div>
          </div>
          <div className="font-body text-muted text-[1.05vw] mt-[1vh] leading-snug">قواعد قابلة للتخصيص ترسل التنبيه للشخص الصحيح في الوقت الصحيح.</div>
        </div>
      </div>

      <div className="absolute bottom-[3vh] right-[6vw] text-muted font-body text-[1vw]">16 / 19</div>
    </div>
  );
}
