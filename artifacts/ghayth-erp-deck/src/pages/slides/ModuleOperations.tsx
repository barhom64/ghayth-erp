export default function ModuleOperations() {
  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg px-[6vw] py-[6vh]" dir="rtl">
      <div className="absolute top-0 right-0 w-[100vw] h-[12vh] bg-primary" />
      <div className="absolute top-[6vh] right-[6vw] flex items-center gap-[1.2vw]">
        <span className="text-accent font-display text-[1vw] font-bold tracking-[0.3em]">OPS</span>
        <span className="text-white/60 font-body text-[1vw]">وحدة 03 من 10</span>
      </div>
      <div className="absolute top-[18vh] right-[6vw] max-w-[88vw]">
        <h2 className="font-display text-text font-black text-[4.5vw] leading-[1.05] tracking-tighter">
          العمليات
        </h2>
        <p className="font-body text-muted text-[1.4vw] mt-[2vh] leading-relaxed font-light max-w-[75vw]">
          مركز التحكّم اليومي للأعمال: طلبات، مهام، سير عمل، وجداول تنفيذ — كلّها مدفوعة بقواعد قابلة للتخصيص.
        </p>
      </div>
      <div className="absolute top-[42vh] right-[6vw] left-[6vw] grid grid-cols-2 gap-x-[2vw] gap-y-[2vh]">
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">الطلبات والموافقات</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">نماذج موحّدة، سلاسل موافقات هرمية، تفويض ومناوبة المسؤوليات.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">المهام وسير العمل</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">إسناد تلقائي، مواعيد استحقاق، تذكيرات، لوحات Kanban وتقارير إنجاز.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-accent">
          <div className="font-display text-primary text-[1.6vw] font-bold">إدارة المخزون والتوريد</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">حركات مخزنية، طلبات شراء، عروض موردين، استلام واحتساب تكلفة.</div>
        </div>
        <div className="bg-surface rounded-xl p-[1.6vw] border-r-4 border-primary">
          <div className="font-display text-primary text-[1.6vw] font-bold">الجداول والمواعيد</div>
          <div className="font-body text-muted text-[1.05vw] mt-[0.6vh] leading-snug">تقويم موحّد عبر الفرق، حجوزات موارد، تكامل مع البريد والإشعارات.</div>
        </div>
      </div>
      <div className="absolute bottom-[3vh] left-[6vw] text-muted font-body text-[1vw]">07 / 19</div>
    </div>
  );
}
