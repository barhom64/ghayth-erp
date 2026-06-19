// Codemod: يلفّ كل <table> عارٍ (غير محاط بحاوية overflow) في
// <div className="overflow-x-auto"> كي يمرّر أفقيًا على شاشات الجوال بدل
// كسر التخطيط. آمن لكل الأنواع (قوائم + سطور مدمجة). idempotent: يتخطّى
// الجداول المُحاطة مسبقًا. الجداول لا تتداخل في هذه الصفحات فالمطابقة
// غير الجشعة كافية.
import { readFileSync, writeFileSync } from "node:fs";

const files = process.argv.slice(2);
let totalWrapped = 0;

for (const file of files) {
  let src = readFileSync(file, "utf8");
  let wrapped = 0;
  // طابق كل كتلة <table ...>...</table> (غير جشعة — لا تداخل).
  src = src.replace(/<table\b[\s\S]*?<\/table>/g, (match, offset) => {
    // مُحاط مسبقًا؟ افحص آخر ~80 حرفًا قبل الجدول.
    const before = src.slice(Math.max(0, offset - 80), offset);
    if (/overflow-(x-)?auto/.test(before)) return match;
    wrapped++;
    return `<div className="overflow-x-auto">${match}</div>`;
  });
  if (wrapped > 0) {
    writeFileSync(file, src, "utf8");
    console.log(`✓ ${file}: لُفّ ${wrapped} جدول`);
    totalWrapped += wrapped;
  } else {
    console.log(`· ${file}: لا تغيير (مُحاط مسبقًا)`);
  }
}
console.log(`\nالإجمالي: ${totalWrapped} جدول مُلِفّ.`);
