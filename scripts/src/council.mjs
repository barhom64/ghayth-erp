#!/usr/bin/env node
//
// scripts/src/council.mjs
//
// المجلس متعدد النماذج — الطبقة 2 من بوابة مراجعة نظام غيث (ghayth-review).
//
// يأخذ diff (أو ملفًا أو commit) ويعرضه على أربعة نماذج مستقلة عبر OpenRouter
// (GPT + Gemini + Grok + Claude)، ثم:
//   • المرحلة 1 — تقييم مستقل: كل نموذج يقيّم محاور ghayth-review الستّ (1–5
//     مع سبب وملف مرجعي).
//   • المرحلة 2 — ترتيب الأقران: يُمرَّر تقييم الجميع (مجهول الهوية A/B/C/D)
//     لكل نموذج ليرتّب جودة التقييمات ويكشف الضعيف/المتحيّز.
//   • المرحلة 3 — Claude رئيسًا: يركّب حكمًا موحّدًا من المرتّبات، يبرز الإجماع
//     والخلاف، ويصدر القرار النهائي (يُعتمد / يُعتمد بشرط / يُرفض).
// المخرج: عربي منظّم مطابق لصيغة مخرج ghayth-review.
//
// ── تهيئة المفتاح (سرّ — لا يوضع في الكود إطلاقًا) ───────────────────────────
//   محليًا / في الجلسة:
//     export OPENROUTER_API_KEY="sk-or-..."   # من https://openrouter.ai/keys
//   في GitHub Actions (CI):
//     Settings → Secrets and variables → Actions → New repository secret
//     باسم OPENROUTER_API_KEY، ثم مرّره للخطوة:  env: { OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }} }
//   إن غاب المفتاح: يطبع السكربت خطأً واضحًا ويخرج بكود ≠ 0 — لا مجلس وهمي بصمت.
//
// ── الاستخدام ───────────────────────────────────────────────────────────────
//   node scripts/src/council.mjs --git <commit|ref>     # يراجع `git show <ref>`
//   node scripts/src/council.mjs --range <base>..<head> # يراجع `git diff base..head`
//   node scripts/src/council.mjs --file <path>          # يراجع محتوى ملف diff/كود
//   node scripts/src/council.mjs --stdin                # يقرأ الـ diff من stdin
//   إضافة --title "وصف العمل" لعنوان الحكم (اختياري).
//
// يعمل بـ Node ≥ 18 على fetch المدمج، بلا أي تبعية من node_modules.
//
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// ── معرّفات نماذج OpenRouter (ثابت قابل للتعديل) ─────────────────────────────
// ⚠️ تنبيه لإبراهيم: تحقّق من هذه المعرّفات من https://openrouter.ai/models —
// قد تتغيّر بمرور الوقت. كل معرّف قابل للتجاوز عبر متغيّر بيئة دون تعديل الكود:
//   COUNCIL_MODEL_GPT / COUNCIL_MODEL_GEMINI / COUNCIL_MODEL_GROK / COUNCIL_MODEL_CLAUDE
const COUNCIL_MODELS = {
  gpt: process.env.COUNCIL_MODEL_GPT || "openai/gpt-5.1",
  gemini: process.env.COUNCIL_MODEL_GEMINI || "google/gemini-2.5-pro",
  grok: process.env.COUNCIL_MODEL_GROK || "x-ai/grok-4",
  claude: process.env.COUNCIL_MODEL_CLAUDE || "anthropic/claude-opus-4.1",
};
// النموذج الرئيس الذي يركّب الحكم النهائي (المرحلة 3).
const CHAIR = "claude";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = Number(process.env.COUNCIL_TIMEOUT_MS || 120000);

// محاور ghayth-review للطبقة 2 (تُحقن في مطالبات النماذج).
const REVIEW_AXES = [
  "تجربة المستخدم: وضوح المسار، عدد النقرات، فهم الأخطاء، معالجة حالات التحميل/الفراغ/الخطأ.",
  "سهولة إتمام الإجراء من الواجهة: الوصول للنتيجة دون التواء أو شاشات زائدة.",
  "اكتشاف الخدمة وسهولة الوصول: ظهور الخدمة ووضوح آلية تفعيلها بلا شرح خارجي.",
  "اتساق المصطلحات العربية: عربية كاملة وموحّدة، لا خلط عربي/إنجليزي في واجهة المستخدم.",
  "السلامة المعمارية كقرار: احترام مبدأ المسار القائد/الخادم، استقلال المسار، لا نقل سياسة بين المسارات.",
  "قوة التشغيل: السلوك عند الفشل الجزئي أو غياب الصلاحية أو نقص البيانات — فشل آمن لا انهيار.",
];

function die(msg, code = 1) {
  console.error(`\n❌ [council] ${msg}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { title: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--git") args.git = argv[++i];
    else if (a === "--range") args.range = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--stdin") args.stdin = true;
    else if (a === "--title") args.title = argv[++i] || "";
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

async function loadDiff(args) {
  if (args.git) return execFileSync("git", ["show", args.git], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  if (args.range) {
    const [base, head] = args.range.split("..");
    return execFileSync("git", ["diff", `${base}..${head || "HEAD"}`], { maxBuffer: 64 * 1024 * 1024 }).toString("utf8");
  }
  if (args.file) return readFile(args.file, "utf8");
  if (args.stdin) return readStdin();
  return null;
}

// نداء نموذج واحد عبر OpenRouter. يرمي عند فشل الشبكة/الاعتماد.
async function callModel(apiKey, model, messages, { json = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // ترويسات OpenRouter الاختيارية لتمييز التطبيق (لا تحوي أي سرّ).
        "HTTP-Referer": "https://github.com/barhom64/ghayth-erp",
        "X-Title": "Ghayth ERP ghayth-review council",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("استجابة بلا محتوى (choices[0].message.content فارغ)");
    return content;
  } finally {
    clearTimeout(t);
  }
}

function extractJson(text) {
  // محاولة تحليل JSON متسامحة: نص خام، أو داخل ```json ... ```، أو أول كائن { ... }.
  try { return JSON.parse(text); } catch { /* تابع */ }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch { /* تابع */ } }
  const brace = text.match(/\{[\s\S]*\}/);
  if (brace) { try { return JSON.parse(brace[0]); } catch { /* تابع */ } }
  return null;
}

// ── المرحلة 1: تقييم مستقل لكل نموذج ─────────────────────────────────────────
function phase1Messages(diff, title) {
  const sys =
    "أنت عضو في مجلس مراجعة كود لنظام «غيث» (ERP عربي أولًا). راجع الـ diff التالي بصرامة وحياد، " +
    "مدقّقًا على الكود الفعلي لا على أي ملخّص. قيّم محاور المراجعة الستّ، كل محور من 1 إلى 5 مع سبب موجز وملف مرجعي. " +
    "أعد JSON فقط بالشكل: " +
    '{"axes":[{"axis":"<اسم المحور>","score":<1-5>,"reason":"<سبب>","file":"<ملف>"}],"decision":"<يُعتمد|يُعتمد بشرط|يُرفض>","stopShip":["..."],"summary":"<حكم موجز عربي>"}. ' +
    "المحاور بالترتيب:\n" + REVIEW_AXES.map((a, i) => `${i + 1}. ${a}`).join("\n");
  const user = `عنوان العمل: ${title || "(غير محدّد)"}\n\n=== الـ diff ===\n${diff}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// ── المرحلة 2: ترتيب الأقران ─────────────────────────────────────────────────
function phase2Messages(anonEvals) {
  const sys =
    "أنت محكّم في مجلس مراجعة. فيما يلي تقييمات مجهولة الهوية (A,B,C,D) لنفس الـ diff. " +
    "رتّبها من الأقوى إلى الأضعف من حيث الدقة والاستناد للكود وكشف المخاطر، واكشف أي تقييم متساهل/متحيّز/سطحي. " +
    'أعد JSON فقط: {"ranking":["A","B",...],"weak":["<معرّف>"],"biased":["<معرّف>"],"notes":"<ملاحظات موجزة>"}.';
  const user = "=== التقييمات ===\n" + anonEvals;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// ── المرحلة 3: Claude رئيسًا — تركيب الحكم ────────────────────────────────────
function phase3Messages(title, evalsBlock, rankingsBlock) {
  const sys =
    "أنت رئيس مجلس مراجعة نظام غيث. لديك تقييمات أربعة نماذج وترتيبات الأقران بينها. " +
    "ركّب حكمًا موحّدًا نهائيًا: أبرز نقاط الإجماع والخلاف، وزّن آراء النماذج بحسب ترتيب الأقران، " +
    "ثم أصدر القرار النهائي. الْتزم حرفيًا بصيغة مخرج ghayth-review العربية التالية بلا أي إضافة خارجها:\n\n" +
    "## حكم المجلس: " + (title || "[العمل]") + "\n\n" +
    "### الطبقة الثانية — حكم المجلس (1–5، موزّن)\n" +
    "- تجربة المستخدم: ⭐ — [سبب + إجماع/خلاف]\n" +
    "- سهولة الإجراء: ⭐ — ...\n" +
    "- اكتشاف الخدمة: ⭐ — ...\n" +
    "- اتساق المصطلحات العربية: ⭐ — ...\n" +
    "- السلامة المعمارية: ⭐ — ...\n" +
    "- قوة التشغيل: ⭐ — ...\n\n" +
    "### الإجماع والخلاف\n[أين اتفقت النماذج وأين اختلفت، ومن رجّحه ترتيب الأقران]\n\n" +
    "### القرار النهائي\n[ يُعتمد / يُعتمد بشرط / يُرفض ] + الأسباب الموقفة (stop-ship) إن وُجدت.";
  const user = `=== تقييمات المرحلة 1 ===\n${evalsBlock}\n\n=== ترتيبات الأقران (المرحلة 2) ===\n${rankingsBlock}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("الاستخدام: node scripts/src/council.mjs (--git <ref> | --range <a>..<b> | --file <path> | --stdin) [--title \"...\"]");
    process.exit(0);
  }

  // (2) المفتاح إلزامي — لا مجلس وهمي بصمت.
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    die(
      "متغيّر البيئة OPENROUTER_API_KEY غير مهيّأ.\n" +
      "   هيّئه محليًا:   export OPENROUTER_API_KEY=\"sk-or-...\"   (من https://openrouter.ai/keys)\n" +
      "   أو في CI:       أضف سرّ المستودع OPENROUTER_API_KEY في GitHub Actions.\n" +
      "   المجلس متعدد النماذج لا يعمل بدون مفتاح — لن يُشغَّل مجلس أحادي وهمي.",
    );
  }

  const diff = await loadDiff(args);
  if (!diff || !diff.trim()) {
    die("لا يوجد مُدخل للمراجعة. مرّر --git أو --range أو --file أو --stdin.");
  }

  const modelKeys = Object.keys(COUNCIL_MODELS); // gpt, gemini, grok, claude
  console.error(`ℹ️ [council] المرحلة 1 — تقييم مستقل عبر ${modelKeys.length} نماذج...`);

  // المرحلة 1 — تقييمات متوازية، فشل نموذج واحد لا يُسقط المجلس.
  const p1 = await Promise.allSettled(
    modelKeys.map((k) => callModel(apiKey, COUNCIL_MODELS[k], phase1Messages(diff, args.title), { json: true })),
  );
  const evals = {};
  const failed = [];
  modelKeys.forEach((k, i) => {
    if (p1[i].status === "fulfilled") {
      evals[k] = { raw: p1[i].value, parsed: extractJson(p1[i].value) };
    } else {
      failed.push(`${k} (${COUNCIL_MODELS[k]}): ${p1[i].reason?.message || p1[i].reason}`);
    }
  });

  const ok = Object.keys(evals);
  if (ok.length === 0) {
    die("فشلت كل نداءات النماذج. تحقّق من المفتاح والمعرّفات والشبكة:\n   - " + failed.join("\n   - "));
  }
  if (failed.length) {
    console.error(`⚠️ [council] نماذج أخفقت (المجلس يكمل بالباقي):\n   - ${failed.join("\n   - ")}`);
  }

  // كتلة تقييمات مجهولة الهوية للمرحلة 2 (A,B,C,D).
  const letters = ["A", "B", "C", "D", "E", "F"];
  const anonMap = {};
  const anonEvals = ok
    .map((k, i) => {
      anonMap[letters[i]] = k;
      return `--- المُقيّم ${letters[i]} ---\n${evals[k].raw}`;
    })
    .join("\n\n");

  console.error(`ℹ️ [council] المرحلة 2 — ترتيب الأقران...`);
  const p2 = await Promise.allSettled(
    ok.map((k) => callModel(apiKey, COUNCIL_MODELS[k], phase2Messages(anonEvals), { json: true })),
  );
  const rankings = ok
    .map((k, i) => `--- ترتيب ${k} ---\n${p2[i].status === "fulfilled" ? p2[i].value : "(أخفق هذا المرتّب)"}`)
    .join("\n\n");

  // المرحلة 3 — الرئيس يركّب. إن أخفق الرئيس، نستخدم أول نموذج متاح.
  const chairKey = evals[CHAIR] ? CHAIR : ok[0];
  console.error(`ℹ️ [council] المرحلة 3 — تركيب الحكم بواسطة الرئيس (${chairKey})...`);
  const evalsBlock = ok.map((k) => `--- ${k} ---\n${evals[k].raw}`).join("\n\n");
  let verdict;
  try {
    verdict = await callModel(apiKey, COUNCIL_MODELS[chairKey], phase3Messages(args.title, evalsBlock, rankings));
  } catch (e) {
    die(`فشل تركيب الحكم بواسطة الرئيس (${chairKey}): ${e.message}`);
  }

  // ── المخرج النهائي ─────────────────────────────────────────────────────────
  const completeness =
    ok.length === modelKeys.length
      ? `✅ مجلس كامل — ${ok.length} نماذج (${ok.join("، ")}).`
      : `⚠️ مجلس منقوص — ${ok.length} من ${modelKeys.length} نماذج (المتاح: ${ok.join("، ")}).`;

  console.log("\n" + "═".repeat(72));
  console.log(completeness);
  console.log("الرئيس المركِّب: " + chairKey + ` (${COUNCIL_MODELS[chairKey]})`);
  console.log("═".repeat(72) + "\n");
  console.log(verdict.trim());
  console.log("\n" + "═".repeat(72));
  console.log("ℹ️ مصدر الحكم: مجلس متعدد النماذج عبر OpenRouter — الطبقة 2 من ghayth-review.");
  process.exit(0);
}

main().catch((e) => die(`خطأ غير متوقّع: ${e?.stack || e?.message || e}`));
