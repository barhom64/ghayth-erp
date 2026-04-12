import { useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Building2, Home, Users2, Crown, FileText,
  Banknote, Wrench, ClipboardList, BarChart3, ChevronRight,
  Info, CheckCircle, AlertTriangle, Lightbulb, ArrowLeft,
  Menu, X, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Types ─────────────────────────────────── */
interface CalloutMarker {
  id: number;
  x: number; // percent
  y: number; // percent
  title: string;
  description: string;
  color?: string;
}

interface GuideStep {
  icon: string;
  text: string;
}

interface Section {
  id: string;
  title: string;
  icon: React.ElementType;
  color: string;
  overview: string;
  subsections: Subsection[];
}

interface Subsection {
  id: string;
  title: string;
  screenshot: React.ReactNode;
  callouts: CalloutMarker[];
  steps?: GuideStep[];
  tips?: string[];
  description: string;
}

/* ─── Callout Component ──────────────────────── */
function Callout({ marker, isActive, onClick }: {
  marker: CalloutMarker;
  isActive: boolean;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-600 border-blue-700",
    emerald: "bg-emerald-600 border-emerald-700",
    amber: "bg-amber-500 border-amber-600",
    red: "bg-red-600 border-red-700",
    violet: "bg-violet-600 border-violet-700",
    indigo: "bg-indigo-600 border-indigo-700",
    orange: "bg-orange-500 border-orange-600",
    teal: "bg-teal-600 border-teal-700",
  };
  const colorClass = colors[marker.color || "blue"];

  return (
    <button
      onClick={onClick}
      className={cn(
        "absolute z-10 w-7 h-7 rounded-full border-2 text-white text-xs font-bold flex items-center justify-center transition-all shadow-lg",
        colorClass,
        isActive ? "scale-125 shadow-xl ring-2 ring-white ring-offset-1" : "hover:scale-110"
      )}
      style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: "translate(-50%, -50%)" }}
      title={marker.title}
    >
      {marker.id}
    </button>
  );
}

/* ─── Screenshot Wrapper ─────────────────────── */
function AnnotatedScreenshot({
  children,
  callouts,
  activeCallout,
  onCalloutClick,
}: {
  children: React.ReactNode;
  callouts: CalloutMarker[];
  activeCallout: number | null;
  onCalloutClick: (id: number) => void;
}) {
  return (
    <div className="relative rounded-xl border border-gray-200 overflow-hidden shadow-lg bg-white">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-amber-400" />
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 bg-white rounded text-xs text-gray-400 px-3 py-1 text-center max-w-xs mx-auto">
          غيث ERP — إدارة الأملاك
        </div>
      </div>
      <div className="relative">
        {children}
        {callouts.map((m) => (
          <Callout
            key={m.id}
            marker={m}
            isActive={activeCallout === m.id}
            onClick={() => onCalloutClick(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Callout Detail Panel ───────────────────── */
function CalloutDetails({ callouts, activeId }: { callouts: CalloutMarker[]; activeId: number | null }) {
  const colorBg: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    red: "bg-red-50 border-red-200 text-red-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
    orange: "bg-orange-50 border-orange-200 text-orange-800",
    teal: "bg-teal-50 border-teal-200 text-teal-800",
  };

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
      {callouts.map((m) => (
        <div
          key={m.id}
          className={cn(
            "border rounded-lg p-3 transition-all",
            colorBg[m.color || "blue"],
            activeId === m.id ? "ring-2 ring-offset-1 ring-blue-400 shadow-md" : ""
          )}
        >
          <div className="flex items-start gap-2">
            <span className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5",
              m.color === "blue" ? "bg-blue-600" :
              m.color === "emerald" ? "bg-emerald-600" :
              m.color === "amber" ? "bg-amber-500" :
              m.color === "red" ? "bg-red-600" :
              m.color === "violet" ? "bg-violet-600" :
              m.color === "indigo" ? "bg-indigo-600" :
              m.color === "orange" ? "bg-orange-500" :
              m.color === "teal" ? "bg-teal-600" : "bg-blue-600"
            )}>
              {m.id}
            </span>
            <div>
              <p className="font-semibold text-sm">{m.title}</p>
              <p className="text-xs mt-0.5 opacity-90">{m.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Step Arrow Component ───────────────────── */
function StepList({ steps }: { steps: GuideStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <span className="text-xs text-gray-700">{s.icon} {s.text}</span>
          </div>
          {i < steps.length - 1 && (
            <ArrowLeft className="h-4 w-4 text-gray-300 shrink-0 rotate-180" />
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Mock Screens ──────────────────────────── */

function DashboardMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[400px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">لوحة تحكم الأملاك</div>
          <div className="text-gray-400 text-[10px]">نظرة شاملة على أداء المحفظة العقارية</div>
        </div>
        <div className="flex gap-1.5">
          <div className="bg-white border rounded px-2 py-1 text-[10px] text-gray-600">+ مبنى جديد</div>
          <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ وحدة جديدة</div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-blue-600 text-white rounded-lg p-3">
          <div className="text-[10px] opacity-80">إجمالي الوحدات</div>
          <div className="text-2xl font-bold">48</div>
          <div className="text-[9px] opacity-70">3 مباني</div>
        </div>
        <div className="bg-emerald-500 text-white rounded-lg p-3">
          <div className="text-[10px] opacity-80">نسبة الإشغال</div>
          <div className="text-2xl font-bold">83%</div>
          <div className="text-[9px] opacity-70">40 مؤجرة · 8 شاغرة</div>
        </div>
        <div className="bg-violet-600 text-white rounded-lg p-3">
          <div className="text-[10px] opacity-80">تحصيل الشهر</div>
          <div className="text-xl font-bold">125,000</div>
          <div className="text-[9px] opacity-70">من 150,000 ر.س</div>
        </div>
        <div className="bg-red-500 text-white rounded-lg p-3">
          <div className="text-[10px] opacity-80">المتأخرات</div>
          <div className="text-xl font-bold">18,500</div>
          <div className="text-[9px] opacity-70">4 دفعات متأخرة</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-2">📅 الإيرادات السنوية</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="bg-indigo-50 rounded p-1.5">
              <div className="font-bold text-indigo-700 text-sm">940,000</div>
              <div className="text-[9px] text-gray-400">محصل</div>
            </div>
            <div className="bg-gray-50 rounded p-1.5">
              <div className="font-bold text-gray-700 text-sm">1,200,000</div>
              <div className="text-[9px] text-gray-400">متوقع</div>
            </div>
            <div className="bg-red-50 rounded p-1.5">
              <div className="font-bold text-red-500 text-sm">260,000</div>
              <div className="text-[9px] text-gray-400">متبقي</div>
            </div>
          </div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: "78%" }} />
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-2">⏰ عقود تنتهي قريباً</div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div className="bg-red-50 border border-red-100 rounded p-1.5">
              <div className="text-2xl font-bold text-red-600">2</div>
              <div className="text-[9px] text-gray-400">30 يوم</div>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded p-1.5">
              <div className="text-2xl font-bold text-orange-600">5</div>
              <div className="text-[9px] text-gray-400">60 يوم</div>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded p-1.5">
              <div className="text-2xl font-bold text-amber-600">8</div>
              <div className="text-[9px] text-gray-400">90 يوم</div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-1">🔧 طلبات الصيانة</div>
          <div className="text-3xl font-bold text-amber-600">7</div>
          <div className="text-[9px] text-gray-400">طلب مفتوح</div>
          <div className="mt-2 bg-gray-50 border rounded text-[9px] text-center py-1 text-gray-500">+ طلب صيانة جديد</div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-1">💰 إجمالي التحصيل</div>
          <div className="text-xl font-bold text-violet-700">4,820,000</div>
          <div className="text-[9px] text-gray-400">من 6,000,000 إجمالي</div>
          <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: "80%" }} />
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-1">🔗 روابط سريعة</div>
          <div className="space-y-1">
            <div className="text-[9px] text-gray-500 bg-gray-50 rounded px-1.5 py-1">+ إضافة مستأجر جديد</div>
            <div className="text-[9px] text-gray-500 bg-gray-50 rounded px-1.5 py-1">+ إنشاء عقد إيجار</div>
            <div className="text-[9px] text-gray-500 bg-gray-50 rounded px-1.5 py-1">💵 تسجيل دفعة</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BuildingsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[380px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">المباني والمجمعات</div>
          <div className="text-gray-400 text-[10px]">3 مباني مسجلة</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ إضافة مبنى</div>
      </div>
      <div className="bg-white border rounded mb-3 flex items-center gap-1.5 px-2 py-1.5">
        <span className="text-gray-300">🔍</span>
        <span className="text-[10px] text-gray-400">بحث بالاسم أو العنوان...</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { name: "برج النخيل", address: "الرياض، حي العليا", type: "سكني", total: 20, rented: 18, available: 2, occ: 90, rev: "180,000" },
          { name: "مجمع الواحة", address: "جدة، حي الروضة", type: "مختلط", total: 15, rented: 11, available: 4, occ: 73, rev: "110,000" },
          { name: "المركز التجاري", address: "الدمام، حي العزيزية", type: "تجاري", total: 13, rented: 11, available: 2, occ: 85, rev: "220,000" },
        ].map((b, i) => (
          <div key={i} className="bg-white border rounded-lg p-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="font-semibold text-gray-800 text-[11px]">{b.name}</div>
                <div className="text-[9px] text-gray-400">{b.address}</div>
              </div>
              <div className="text-[9px] border rounded px-1 text-gray-500">{b.type}</div>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center my-2">
              <div className="bg-gray-50 rounded p-1">
                <div className="font-bold">{b.total}</div>
                <div className="text-[8px] text-gray-400">إجمالي</div>
              </div>
              <div className="bg-blue-50 rounded p-1">
                <div className="font-bold text-blue-600">{b.rented}</div>
                <div className="text-[8px] text-gray-400">مؤجرة</div>
              </div>
              <div className="bg-emerald-50 rounded p-1">
                <div className="font-bold text-emerald-600">{b.available}</div>
                <div className="text-[8px] text-gray-400">شاغرة</div>
              </div>
            </div>
            <div className="mb-2">
              <div className="flex justify-between text-[8px] text-gray-400 mb-0.5">
                <span>الإشغال</span><span className="font-bold">{b.occ}%</span>
              </div>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${b.occ}%` }} />
              </div>
            </div>
            <div className="flex justify-between items-center text-[9px] mb-2">
              <span className="text-gray-400">الإيرادات</span>
              <span className="font-bold text-emerald-600">{b.rev} ر.س</span>
            </div>
            <div className="flex gap-1">
              <div className="flex-1 text-center bg-gray-50 border rounded py-1 text-[8px] text-gray-500">👁 عرض الوحدات</div>
              <div className="w-7 text-center bg-gray-50 border rounded py-1 text-[8px] text-gray-500">✏</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function UnitsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[380px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">الوحدات العقارية</div>
          <div className="text-gray-400 text-[10px]">إدارة وتتبع الوحدات العقارية</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ إضافة وحدة</div>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="bg-white border rounded p-2 text-center"><div className="text-lg font-bold">48</div><div className="text-[9px] text-gray-400">إجمالي الوحدات</div></div>
        <div className="bg-emerald-600 text-white rounded p-2 text-center"><div className="text-lg font-bold">8</div><div className="text-[9px] opacity-80">متاحة</div></div>
        <div className="bg-blue-600 text-white rounded p-2 text-center"><div className="text-lg font-bold">40</div><div className="text-[9px] opacity-80">مؤجرة</div></div>
        <div className="bg-violet-600 text-white rounded p-2 text-center"><div className="text-[11px] font-bold">4,820,000</div><div className="text-[9px] opacity-80">إجمالي التحصيل</div></div>
      </div>
      <div className="bg-white border rounded p-2 mb-3 flex items-center gap-2">
        <span className="text-gray-300 text-sm">🔍</span>
        <span className="text-[10px] text-gray-400 flex-1">بحث برقم الوحدة أو المبنى...</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5 text-gray-500">الحالة ▾</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5 text-emerald-600">تصدير CSV</span>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid grid-cols-6 bg-gray-50 border-b">
          {["رقم الوحدة", "المبنى", "النوع", "المساحة", "الإيجار", "الحالة"].map((h, i) => (
            <div key={i} className="px-2 py-1.5 text-[9px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { unit: "A-101", bld: "برج النخيل", type: "شقة", area: "120 م²", rent: "3,500 ر.س", status: "مؤجرة", color: "bg-blue-100 text-blue-700" },
          { unit: "A-102", bld: "برج النخيل", type: "شقة", area: "95 م²", rent: "2,800 ر.س", status: "متاحة", color: "bg-emerald-100 text-emerald-700" },
          { unit: "B-201", bld: "مجمع الواحة", type: "فيلا", area: "350 م²", rent: "8,000 ر.س", status: "مؤجرة", color: "bg-blue-100 text-blue-700" },
          { unit: "C-101", bld: "المركز التجاري", type: "محل", area: "80 م²", rent: "5,000 ر.س", status: "صيانة", color: "bg-orange-100 text-orange-700" },
        ].map((r, i) => (
          <div key={i} className="grid grid-cols-6 border-b hover:bg-gray-50">
            <div className="px-2 py-1.5 text-[9px] text-blue-600 font-medium">{r.unit}</div>
            <div className="px-2 py-1.5 text-[9px] text-gray-600">{r.bld}</div>
            <div className="px-2 py-1.5 text-[9px] text-gray-600">{r.type}</div>
            <div className="px-2 py-1.5 text-[9px] text-gray-600">{r.area}</div>
            <div className="px-2 py-1.5 text-[9px] font-bold text-gray-800">{r.rent}</div>
            <div className="px-2 py-1.5"><span className={cn("text-[8px] px-1 rounded", r.color)}>{r.status}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TenantsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[360px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">المستأجرون</div>
          <div className="text-gray-400 text-[10px]">سجل كامل لجميع المستأجرين الحاليين والسابقين</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ مستأجر جديد</div>
      </div>
      <div className="bg-white border rounded p-2 mb-3 flex items-center gap-2">
        <span className="text-gray-300 text-sm">🔍</span>
        <span className="text-[10px] text-gray-400 flex-1">بحث بالاسم أو الهاتف أو رقم الهوية...</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5 text-emerald-600">تصدير CSV</span>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 2fr 1fr" }}>
          {["الاسم", "الهاتف", "رقم الهوية", "العقود", "الوحدة الحالية", "إجمالي المدفوعات", "إجراءات"].map((h, i) => (
            <div key={i} className="px-2 py-1.5 text-[9px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { name: "أحمد محمد السعيد", phone: "0551234567", id: "1234567890", contracts: "2 نشط", unit: "A-101", paid: "42,000 ر.س" },
          { name: "سارة عبدالله الغامدي", phone: "0557654321", id: "0987654321", contracts: "1 نشط", unit: "B-201", paid: "96,000 ر.س" },
          { name: "خالد إبراهيم العمري", phone: "0501112233", id: "2345678901", contracts: "1 نشط", unit: "C-305", paid: "28,000 ر.س" },
        ].map((t, i) => (
          <div key={i} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 2fr 1fr" }}>
            <div className="px-2 py-2 flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center text-[9px] font-bold shrink-0">{t.name[0]}</div>
              <span className="text-[9px] font-medium">{t.name}</span>
            </div>
            <div className="px-2 py-2 text-[9px] text-blue-600">{t.phone}</div>
            <div className="px-2 py-2 text-[9px] font-mono">{t.id}</div>
            <div className="px-2 py-2"><span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded">{t.contracts}</span></div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{t.unit}</div>
            <div className="px-2 py-2 text-[9px] font-bold text-emerald-600">{t.paid}</div>
            <div className="px-2 py-2 flex gap-1">
              <span className="text-[8px] border rounded px-1 py-0.5 text-gray-500">ملف</span>
              <span className="text-[10px] text-gray-300">⌄</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OwnersMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[320px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">الملاك</div>
          <div className="text-gray-400 text-[10px]">سجل ملاك العقارات — للعقارات المُدارة لصالح الغير</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ إضافة مالك</div>
      </div>
      <div className="bg-white border rounded p-2 mb-3 flex gap-2 items-center">
        <span className="text-gray-300">🔍</span>
        <span className="text-[10px] text-gray-400">بحث بالاسم أو الهاتف أو رقم الهوية...</span>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
          {["الاسم", "النوع", "الهاتف", "المباني", "الوحدات", "العقود النشطة", "إجراءات"].map((h) => (
            <div key={h} className="px-2 py-1.5 text-[9px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { name: "عبدالرحمن الحربي", type: "فرد", phone: "0501234567", buildings: 2, units: 20, contracts: 18 },
          { name: "شركة العقارية المتحدة", type: "شركة", phone: "0112345678", buildings: 1, units: 15, contracts: 11 },
          { name: "فاطمة القحطاني", type: "فرد", phone: "0559876543", buildings: 1, units: 13, contracts: 13 },
        ].map((o, i) => (
          <div key={i} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
            <div className="px-2 py-2 flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-[9px] font-bold">{o.name[0]}</div>
              <span className="text-[9px] font-medium">{o.name}</span>
            </div>
            <div className="px-2 py-2"><span className="text-[8px] border rounded px-1">{o.type}</span></div>
            <div className="px-2 py-2 text-[9px] text-blue-600">{o.phone}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{o.buildings}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{o.units}</div>
            <div className="px-2 py-2"><span className="text-[8px] bg-emerald-100 text-emerald-700 px-1 rounded">{o.contracts} نشط</span></div>
            <div className="px-2 py-2 flex gap-1">
              <span className="text-[8px] border rounded px-1 py-0.5 text-gray-500">تعديل</span>
              <span className="text-[8px] text-red-400">🗑</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[360px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">عقود الإيجار</div>
          <div className="text-gray-400 text-[10px]">إدارة وتتبع جميع عقود الإيجار — متوافق مع إيجار</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ إضافة عقد</div>
      </div>
      <div className="bg-white border rounded p-2 mb-3 flex items-center gap-2">
        <span className="text-gray-300">🔍</span>
        <span className="text-[10px] text-gray-400 flex-1">بحث بالمستأجر أو الوحدة أو رقم إيجار...</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5">الحالة ▾</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5">التاريخ</span>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
          {["رقم إيجار", "الوحدة", "المستأجر", "من", "إلى", "الإيجار", "الدورة", "الحالة", "تفاصيل"].map((h) => (
            <div key={h} className="px-2 py-1.5 text-[8px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { ejar: "EJR-2024-001", unit: "A-101", tenant: "أحمد السعيد", from: "2024/01/01", to: "2024/12/31", rent: "3,500", freq: "شهري", status: "ساري", sColor: "bg-emerald-100 text-emerald-700" },
          { ejar: "EJR-2024-002", unit: "B-201", tenant: "سارة الغامدي", from: "2024/03/01", to: "2025/02/28", rent: "8,000", freq: "ربع سنوي", status: "ساري", sColor: "bg-emerald-100 text-emerald-700" },
          { ejar: "EJR-2023-045", unit: "C-305", tenant: "خالد العمري", from: "2023/06/01", to: "2024/05/31", rent: "2,800", freq: "شهري", status: "منتهي", sColor: "bg-gray-100 text-gray-600" },
        ].map((c, i) => (
          <div key={i} className={cn("grid border-b hover:bg-gray-50 cursor-pointer", i === 1 ? "bg-blue-50/40" : "")} style={{ gridTemplateColumns: "1fr 1fr 2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
            {[c.ejar, c.unit, c.tenant, c.from, c.to, c.rent + " ر.س", c.freq].map((v, j) => (
              <div key={j} className="px-2 py-2 text-[8px] text-gray-700">{v}</div>
            ))}
            <div className="px-2 py-2"><span className={cn("text-[8px] px-1 rounded", c.sColor)}>{c.status}</span></div>
            <div className="px-2 py-2 text-gray-300 text-center">⌄</div>
          </div>
        ))}
        <div className="border-t p-3 bg-blue-50/30 text-[9px]">
          <div className="font-semibold text-gray-600 mb-2">📋 تفاصيل العقد EJR-2024-002</div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white border rounded p-2"><div className="text-[8px] text-gray-400">نوع العقد</div><div className="font-medium">سكني</div></div>
            <div className="bg-white border rounded p-2"><div className="text-[8px] text-gray-400">الإيجار السنوي</div><div className="font-bold text-emerald-700">32,000 ر.س</div></div>
            <div className="bg-white border rounded p-2"><div className="text-[8px] text-gray-400">التأمين</div><div className="font-medium">5,000 ر.س</div></div>
            <div className="bg-white border rounded p-2"><div className="text-[8px] text-gray-400">التجديد التلقائي</div><div className="text-emerald-600">مفعّل</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[340px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">مدفوعات الإيجار</div>
          <div className="text-gray-400 text-[10px]">متابعة وتسجيل مدفوعات الإيجار</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">💵 تسجيل دفعة</div>
      </div>
      <div className="bg-white border rounded p-2 mb-3 flex items-center gap-2">
        <span className="text-gray-300">🔍</span>
        <span className="text-[10px] text-gray-400 flex-1">بحث بالمستأجر أو الوحدة...</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5">مدفوع</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5">معلق</span>
        <span className="text-[9px] border rounded px-1.5 py-0.5">متأخر</span>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
          {["المستأجر", "الوحدة", "تاريخ الاستحقاق", "المبلغ", "المدفوع", "الحالة", "إجراء"].map((h) => (
            <div key={h} className="px-2 py-1.5 text-[9px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { tenant: "أحمد السعيد", unit: "A-101", due: "2024/12/01", amount: "3,500", paid: "3,500", status: "مدفوع", sColor: "bg-emerald-100 text-emerald-700", action: null },
          { tenant: "سارة الغامدي", unit: "B-201", due: "2024/12/01", amount: "8,000", paid: "0", status: "معلق", sColor: "bg-gray-100 text-gray-500", action: "تسجيل" },
          { tenant: "خالد العمري", unit: "C-305", due: "2024/11/01", amount: "2,800", paid: "0", status: "متأخر", sColor: "bg-red-100 text-red-700", action: "تسجيل" },
        ].map((p, i) => (
          <div key={i} className={cn("grid border-b", p.status === "متأخر" ? "bg-rose-50" : "hover:bg-gray-50")} style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 1fr" }}>
            <div className="px-2 py-2 text-[9px] font-medium">{p.tenant}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{p.unit}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{p.due}</div>
            <div className="px-2 py-2 text-[9px] font-bold">{p.amount} ر.س</div>
            <div className="px-2 py-2 text-[9px] text-emerald-600">{p.paid} ر.س</div>
            <div className="px-2 py-2"><span className={cn("text-[8px] px-1 rounded", p.sColor)}>{p.status}</span></div>
            <div className="px-2 py-2">
              {p.action && <span className="text-[8px] text-emerald-600 border border-emerald-200 rounded px-1 py-0.5">{p.action}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MaintenanceMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[340px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">طلبات الصيانة</div>
          <div className="text-gray-400 text-[10px]">إدارة ومتابعة طلبات الصيانة</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ طلب صيانة جديد</div>
      </div>
      <div className="flex gap-2 mb-3">
        <div className="bg-white border rounded p-2 flex-1 flex items-center gap-1">
          <span className="text-gray-300">🔍</span>
          <span className="text-[10px] text-gray-400">بحث سريع...</span>
        </div>
      </div>
      <div className="flex gap-1 mb-3">
        {["الكل", "مفتوح", "جاري", "مكتمل", "مغلق"].map((s, i) => (
          <span key={i} className={cn("text-[9px] px-2 py-1 rounded border", i === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500")}>{s}</span>
        ))}
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 1fr 1fr 1fr" }}>
          {["الوحدة", "المبنى", "الفئة", "الوصف", "الأولوية", "الحالة", "إجراء"].map((h) => (
            <div key={h} className="px-2 py-1.5 text-[9px] text-gray-500 font-semibold">{h}</div>
          ))}
        </div>
        {[
          { unit: "A-101", bld: "برج النخيل", cat: "سباكة", desc: "تسرب مياه من الحمام", pri: "عالية", priColor: "bg-red-100 text-red-700", status: "مفتوح", stColor: "bg-blue-100 text-blue-700" },
          { unit: "B-205", bld: "مجمع الواحة", cat: "كهرباء", desc: "انقطاع الكهرباء في الغرفة", pri: "متوسطة", priColor: "bg-amber-100 text-amber-700", status: "جاري", stColor: "bg-indigo-100 text-indigo-700" },
          { unit: "C-102", bld: "المركز التجاري", cat: "تكييف", desc: "عطل في جهاز التكييف", pri: "منخفضة", priColor: "bg-gray-100 text-gray-600", status: "مفتوح", stColor: "bg-blue-100 text-blue-700" },
        ].map((r, i) => (
          <div key={i} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 1fr 1fr 1fr" }}>
            <div className="px-2 py-2 text-[9px] font-medium">{r.unit}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{r.bld}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600">{r.cat}</div>
            <div className="px-2 py-2 text-[9px] text-gray-600 truncate">{r.desc}</div>
            <div className="px-2 py-2"><span className={cn("text-[8px] px-1 rounded", r.priColor)}>{r.pri}</span></div>
            <div className="px-2 py-2"><span className={cn("text-[8px] px-1 rounded", r.stColor)}>{r.status}</span></div>
            <div className="px-2 py-2 flex gap-1">
              <span className="text-[8px] text-emerald-600 border border-emerald-200 rounded px-1">قبول</span>
              <span className="text-[8px] text-red-400 border border-red-200 rounded px-1">رفض</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InspectionsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[340px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">فحص الوحدات العقارية</div>
          <div className="text-gray-400 text-[10px]">جدولة وتتبع عمليات فحص الوحدات</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ جدولة فحص</div>
      </div>
      <div className="flex gap-1 mb-3">
        {["الكل", "مجدول", "مكتمل", "ملغى"].map((s, i) => (
          <span key={i} className={cn("text-[9px] px-2 py-1 rounded border", i === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500")}>{s}</span>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { unit: "A-101", bld: "برج النخيل", inspector: "محمد الزهراني", date: "2024/12/15", type: "دوري", status: "مجدول", rating: null, sColor: "bg-blue-100 text-blue-700" },
          { unit: "B-201", bld: "مجمع الواحة", inspector: "فهد العتيبي", date: "2024/11/20", type: "دخول مستأجر", status: "مكتمل", rating: 4, sColor: "bg-green-100 text-green-700" },
          { unit: "C-305", bld: "المركز التجاري", inspector: "سلمى البلوي", date: "2024/12/10", type: "خروج مستأجر", status: "مجدول", rating: null, sColor: "bg-blue-100 text-blue-700" },
        ].map((insp, i) => (
          <div key={i} className="bg-white border rounded-lg p-3 flex items-start justify-between hover:shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-[10px]">{insp.unit} — {insp.bld}</span>
                <span className={cn("text-[8px] px-1 rounded", insp.sColor)}>{insp.status}</span>
                <span className="text-[8px] bg-gray-100 text-gray-600 px-1 rounded">{insp.type}</span>
              </div>
              <div className="text-[9px] text-gray-500">
                <span>المفتش: {insp.inspector}</span>
                <span className="mx-2">·</span>
                <span>الموعد: {insp.date}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {insp.rating && <span className="text-[9px] text-yellow-500">⭐ {insp.rating}/5</span>}
              {insp.status === "مجدول" && (
                <span className="text-[8px] bg-blue-600 text-white rounded px-1.5 py-0.5">✓ إتمام</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DepositsMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[340px] text-xs" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-lg font-bold text-gray-800">ودائع الضمان</div>
          <div className="text-gray-400 text-[10px]">إدارة ودائع ضمان المستأجرين</div>
        </div>
        <div className="bg-blue-600 text-white rounded px-2 py-1 text-[10px]">+ تسجيل وديعة</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="border rounded-lg p-2 text-center">
          <div className="text-xl font-bold">5</div>
          <div className="text-[9px] text-gray-500">إجمالي الودائع</div>
        </div>
        <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-2 text-center">
          <div className="text-xl font-bold text-blue-600">47,500 ر.س</div>
          <div className="text-[9px] text-gray-500">ودائع محتجزة</div>
        </div>
        <div className="border border-green-200 bg-green-50/30 rounded-lg p-2 text-center">
          <div className="text-xl font-bold text-green-600">12,000 ر.س</div>
          <div className="text-[9px] text-gray-500">مُستردة</div>
        </div>
      </div>
      <div className="flex gap-1 mb-3">
        {["الكل", "محتجزة", "مستردة"].map((s, i) => (
          <span key={i} className={cn("text-[9px] px-2 py-1 rounded border", i === 0 ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500")}>{s}</span>
        ))}
      </div>
      <div className="space-y-2">
        {[
          { tenant: "أحمد السعيد", unit: "A-101", bld: "برج النخيل", amount: "8,500", received: "2024/01/10", status: "محتجزة", sColor: "bg-blue-100 text-blue-700", refund: null },
          { tenant: "خالد العمري", unit: "C-305", bld: "المركز التجاري", amount: "12,000", received: "2023/06/01", status: "مستردة", sColor: "bg-green-100 text-green-700", refund: "12,000" },
          { tenant: "سارة الغامدي", unit: "B-201", bld: "مجمع الواحة", amount: "6,000", received: "2024/03/15", status: "محتجزة", sColor: "bg-blue-100 text-blue-700", refund: null },
        ].map((d, i) => (
          <div key={i} className="bg-white border rounded-lg p-3 flex items-center justify-between hover:shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-[10px]">{d.tenant}</span>
                <span className="text-gray-500 text-[9px]">— {d.unit} ({d.bld})</span>
                <span className={cn("text-[8px] px-1 rounded", d.sColor)}>{d.status}</span>
              </div>
              <div className="text-[9px] text-gray-500">
                تاريخ الاستلام: {d.received}
                {d.refund && <span className="mr-2 text-green-600"> · مُسترد: {d.refund} ر.س</span>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="font-bold text-[11px]">{d.amount} ر.س</div>
              {d.status === "محتجزة" && (
                <span className="text-[8px] border border-gray-300 rounded px-1.5 py-0.5 text-gray-600">استرداد</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OccupancyMockScreen() {
  return (
    <div className="p-4 bg-gray-50 min-h-[360px] text-xs" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🏢</span>
        <div>
          <div className="text-lg font-bold text-gray-800">تقرير الإشغال العقاري</div>
          <div className="text-gray-400 text-[10px]">نظرة شاملة على حالة الوحدات العقارية</div>
        </div>
      </div>
      <div className="grid grid-cols-5 gap-2 mb-3">
        <div className="border-2 border-blue-200 rounded-lg p-2 text-center">
          <div className="text-2xl font-bold text-blue-600">83%</div>
          <div className="text-[9px] text-gray-500">معدل الإشغال</div>
        </div>
        <div className="border rounded-lg p-2 text-center">
          <div className="text-xl font-bold">48</div>
          <div className="text-[9px] text-gray-500">إجمالي الوحدات</div>
        </div>
        <div className="border border-green-200 bg-green-50/30 rounded-lg p-2 text-center">
          <div className="text-xl font-bold text-green-600">40</div>
          <div className="text-[9px] text-gray-500">مؤجرة</div>
        </div>
        <div className="border border-blue-200 bg-blue-50/30 rounded-lg p-2 text-center">
          <div className="text-xl font-bold text-blue-600">8</div>
          <div className="text-[9px] text-gray-500">متاحة</div>
        </div>
        <div className="border rounded-lg p-2 text-center">
          <div className="text-lg font-bold">150,000</div>
          <div className="text-[9px] text-gray-500">إيجار شهري (ر.س)</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-2">توزيع حالة الوحدات</div>
          <div className="flex items-center gap-3">
            <div className="w-20 h-20 rounded-full border-8 border-emerald-500 flex items-center justify-center relative">
              <div className="absolute inset-1 rounded-full border-4 border-transparent border-t-blue-500 border-r-blue-500" style={{ transform: "rotate(45deg)" }} />
              <span className="text-sm font-bold">83%</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-[9px]">مؤجرة: 40</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" /><span className="text-[9px]">متاحة: 8</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-orange-400" /><span className="text-[9px]">صيانة: 0</span></div>
            </div>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-[10px] font-semibold text-gray-600 mb-2">الإشغال حسب المبنى</div>
          <div className="space-y-2">
            {[
              { name: "برج النخيل", occ: 18, total: 20, rate: 90 },
              { name: "مجمع الواحة", occ: 11, total: 15, rate: 73 },
              { name: "المركز التجاري", occ: 11, total: 13, rate: 85 },
            ].map((b, i) => (
              <div key={i}>
                <div className="flex justify-between text-[9px] mb-0.5">
                  <span>{b.name}</span>
                  <span className="text-gray-400">{b.occ}/{b.total} ({b.rate}%)</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${b.rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white border rounded overflow-hidden">
        <div className="px-3 py-2 text-[10px] font-semibold text-gray-600 border-b bg-gray-50">قائمة الوحدات (48)</div>
        <div className="grid bg-gray-50 border-b" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 1fr 1fr" }}>
          {["الوحدة", "المبنى", "الحالة", "المستأجر", "الإيجار الشهري", "انتهاء العقد"].map((h) => (
            <div key={h} className="px-2 py-1 text-[8px] text-gray-500">{h}</div>
          ))}
        </div>
        {[
          { unit: "A-101", bld: "برج النخيل", status: "مؤجرة", sColor: "bg-green-100 text-green-600", tenant: "أحمد السعيد", rent: "3,500 ر.س", end: "2024/12/31" },
          { unit: "A-102", bld: "برج النخيل", status: "متاحة", sColor: "bg-blue-100 text-blue-600", tenant: "—", rent: "2,800 ر.س", end: "—" },
        ].map((u, i) => (
          <div key={i} className="grid border-b hover:bg-gray-50" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 1fr 1fr" }}>
            <div className="px-2 py-1.5 text-[9px] font-medium">{u.unit}</div>
            <div className="px-2 py-1.5 text-[9px] text-gray-500">{u.bld}</div>
            <div className="px-2 py-1.5"><span className={cn("text-[8px] px-1 rounded", u.sColor)}>{u.status}</span></div>
            <div className="px-2 py-1.5 text-[9px]">{u.tenant}</div>
            <div className="px-2 py-1.5 text-[9px]">{u.rent}</div>
            <div className="px-2 py-1.5 text-[9px] text-gray-400">{u.end}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Guide Sections Data ───────────────────── */

const sections: Section[] = [
  {
    id: "dashboard",
    title: "لوحة تحكم الأملاك",
    icon: LayoutDashboard,
    color: "text-blue-600",
    overview: "لوحة التحكم هي نقطة البداية لإدارة الأملاك. توفر نظرة شاملة ولحظية على أداء محفظتك العقارية بالكامل.",
    subsections: [
      {
        id: "dashboard-overview",
        title: "نظرة عامة على لوحة التحكم",
        screenshot: <DashboardMockScreen />,
        description: "تعرض لوحة التحكم أربع بطاقات إحصائية رئيسية في الأعلى، تليها أقسام تفصيلية للإيرادات والعقود المنتهية والطلبات المفتوحة.",
        callouts: [
          { id: 1, x: 12, y: 26, color: "blue", title: "بطاقة إجمالي الوحدات", description: "عدد جميع الوحدات العقارية المسجلة في النظام مع عدد المباني والمجمعات. انقر لعرض صفحة الوحدات." },
          { id: 2, x: 37, y: 26, color: "emerald", title: "نسبة الإشغال", description: "يتغير لون البطاقة تلقائياً: أخضر إذا تجاوز 80%، برتقالي بين 50-80%، أحمر إذا كان أقل من 50%. يعكس صحة المحفظة العقارية." },
          { id: 3, x: 62, y: 26, color: "violet", title: "تحصيل الشهر الحالي", description: "المبلغ المحصل هذا الشهر مقارنةً بالمبلغ المتوقع. يساعدك على متابعة التدفق النقدي الشهري." },
          { id: 4, x: 88, y: 26, color: "red", title: "المتأخرات", description: "إجمالي المبالغ المتأخرة مع عدد الدفعات المتأخرة. تظهر البطاقة باللون الأحمر عند وجود متأخرات." },
          { id: 5, x: 25, y: 50, color: "indigo", title: "الإيرادات السنوية", description: "مقارنة بين ما تم تحصيله والمبلغ المتوقع والمتبقي لهذا العام مع شريط تقدم مرئي لنسبة التحصيل." },
          { id: 6, x: 75, y: 50, color: "orange", title: "عقود تنتهي قريباً", description: "تنبيه بعدد العقود المنتهية خلال 30 و60 و90 يوماً لتتمكن من التجديد مسبقاً." },
          { id: 7, x: 15, y: 80, color: "amber", title: "طلبات الصيانة المفتوحة", description: "عدد طلبات الصيانة التي تنتظر المعالجة. الضغط على الرقم يأخذك مباشرة لصفحة طلبات الصيانة." },
          { id: 8, x: 85, y: 80, color: "teal", title: "الروابط السريعة", description: "اختصارات للعمليات الأكثر شيوعاً: إضافة مستأجر، إنشاء عقد، وتسجيل دفعة." },
        ],
        steps: [
          { icon: "🏠", text: "افتح لوحة التحكم" },
          { icon: "📊", text: "راجع البطاقات الإحصائية" },
          { icon: "⚠️", text: "تحقق من المتأخرات" },
          { icon: "⏰", text: "تابع العقود المنتهية" },
          { icon: "🔧", text: "راجع طلبات الصيانة" },
        ],
        tips: [
          "راجع لوحة التحكم يومياً في بداية يوم العمل",
          "إذا كانت نسبة الإشغال أقل من 70% فابدأ في البحث عن مستأجرين جدد",
          "العقود التي تنتهي خلال 30 يوماً تستحق اتصالاً فورياً للتجديد",
        ],
      },
    ],
  },
  {
    id: "buildings",
    title: "إدارة المباني",
    icon: Building2,
    color: "text-indigo-600",
    overview: "إدارة المباني والمجمعات العقارية: إضافة مباني جديدة، عرض تفاصيلها، وتتبع أداء كل مبنى على حدة.",
    subsections: [
      {
        id: "buildings-list",
        title: "قائمة المباني والمجمعات",
        screenshot: <BuildingsMockScreen />,
        description: "تعرض صفحة المباني كروت (بطاقات) لكل مبنى تحتوي على أهم المعلومات والإحصائيات.",
        callouts: [
          { id: 1, x: 88, y: 12, color: "blue", title: "زر إضافة مبنى", description: "انقر لفتح نموذج إضافة مبنى جديد. ستحتاج لإدخال: اسم المبنى، العنوان، المدينة، النوع (سكني/تجاري/مختلط)، ورقم الصك." },
          { id: 2, x: 25, y: 22, color: "amber", title: "حقل البحث", description: "ابحث بسرعة عن مبنى باسمه أو عنوانه. البحث فوري ولا يحتاج لضغط إدخال." },
          { id: 3, x: 22, y: 47, color: "indigo", title: "بطاقة المبنى", description: "تعرض كل بطاقة: اسم المبنى، العنوان، نوع المبنى كشارة، وإحصائيات الوحدات (إجمالي/مؤجرة/شاغرة)." },
          { id: 4, x: 22, y: 65, color: "emerald", title: "شريط نسبة الإشغال", description: "يتغير لون الشريط: أخضر (90%+)، برتقالي (50-90%)، أحمر (أقل من 50%). يعكس مدى استغلال المبنى." },
          { id: 5, x: 20, y: 82, color: "violet", title: "أزرار الإجراءات", description: "'عرض الوحدات' يأخذك لتفاصيل المبنى وقائمة وحداته. زر التعديل (قلم) يفتح نموذج التعديل." },
          { id: 6, x: 28, y: 75, color: "teal", title: "إيرادات المبنى", description: "إجمالي الإيرادات المحصلة من هذا المبنى. يساعدك على تقييم أداء كل مبنى مقارنةً بالآخرين." },
        ],
        steps: [
          { icon: "🏢", text: "اضغط إضافة مبنى" },
          { icon: "📝", text: "أدخل بيانات المبنى" },
          { icon: "💾", text: "احفظ البيانات" },
          { icon: "🏠", text: "أضف الوحدات لاحقاً" },
        ],
        tips: [
          "أضف رقم الصك (سند الملكية) للمبنى لضمان التوثيق القانوني",
          "يمكنك تعديل بيانات المبنى في أي وقت دون التأثير على الوحدات المرتبطة",
          "تابع نسبة الإشغال لكل مبنى لتحديد المباني التي تحتاج لجهد تسويقي إضافي",
        ],
      },
    ],
  },
  {
    id: "units",
    title: "إدارة الوحدات العقارية",
    icon: Home,
    color: "text-emerald-600",
    overview: "إدارة شاملة للوحدات العقارية: إضافة وتعديل وعرض تفاصيل كل وحدة، وتتبع حالتها (متاحة/مؤجرة/صيانة).",
    subsections: [
      {
        id: "units-list",
        title: "قائمة الوحدات العقارية",
        screenshot: <UnitsMockScreen />,
        description: "تعرض صفحة الوحدات جميع الوحدات في جدول منظم مع إحصائيات سريعة وأدوات بحث وتصفية متقدمة.",
        callouts: [
          { id: 1, x: 88, y: 10, color: "blue", title: "إضافة وحدة جديدة", description: "انقر لفتح نموذج إضافة وحدة. ستحتاج لإدخال: رقم الوحدة، المبنى، النوع (شقة/فيلا/مكتب/محل)، المساحة بالمتر المربع، والإيجار الشهري." },
          { id: 2, x: 12, y: 26, color: "indigo", title: "بطاقة إجمالي الوحدات", description: "العدد الكلي لجميع الوحدات المسجلة في النظام عبر جميع المباني." },
          { id: 3, x: 37, y: 26, color: "emerald", title: "عدد الوحدات المتاحة", description: "الوحدات الشاغرة الجاهزة للإيجار. انقر على البطاقة للتصفية وعرض المتاحة فقط." },
          { id: 4, x: 62, y: 26, color: "blue", title: "عدد الوحدات المؤجرة", description: "الوحدات المؤجرة حالياً. انقر للتصفية وعرض المؤجرة فقط." },
          { id: 5, x: 88, y: 26, color: "violet", title: "إجمالي التحصيل", description: "مجموع كل المبالغ المحصلة من إيجارات الوحدات تاريخياً." },
          { id: 6, x: 50, y: 43, color: "amber", title: "شريط البحث والتصفية", description: "ابحث برقم الوحدة أو اسم المبنى، صفّ حسب الحالة، وصدّر البيانات لملف Excel." },
          { id: 7, x: 10, y: 65, color: "teal", title: "رقم الوحدة (رابط)", description: "انقر على رقم الوحدة للذهاب لصفحة تفاصيل الوحدة الكاملة التي تعرض: العقد الحالي، المستأجر، وسجل المدفوعات." },
          { id: 8, x: 88, y: 65, color: "red", title: "حالة الوحدة", description: "متاحة (أخضر) - مؤجرة (أزرق) - تحت الصيانة (برتقالي). يمكن تغيير الحالة من زر 'تغيير الحالة' في صفحة التفاصيل." },
        ],
        steps: [
          { icon: "➕", text: "اضغط إضافة وحدة" },
          { icon: "🏠", text: "اختر المبنى" },
          { icon: "📋", text: "أدخل رقم الوحدة والنوع" },
          { icon: "💰", text: "حدد سعر الإيجار" },
          { icon: "✅", text: "احفظ الوحدة" },
        ],
        tips: [
          "استخدم رموز واضحة لأرقام الوحدات مثل: A-101 (مبنى A، الطابق 1، وحدة 1)",
          "المساحة بالمتر المربع مهمة لحساب الإيجار وللعرض على المستأجرين المحتملين",
          "يمكنك التعديل المباشر على الوحدة من القائمة دون الدخول لصفحة التفاصيل",
        ],
      },
    ],
  },
  {
    id: "tenants",
    title: "إدارة المستأجرين",
    icon: Users2,
    color: "text-violet-600",
    overview: "سجل شامل لجميع المستأجرين الحاليين والسابقين مع تفاصيل التواصل والعقود والمدفوعات.",
    subsections: [
      {
        id: "tenants-list",
        title: "قائمة المستأجرين",
        screenshot: <TenantsMockScreen />,
        description: "جدول شامل لجميع المستأجرين مع إمكانية توسيع كل مستأجر لعرض تفاصيله، وبحث وتصدير متقدمين.",
        callouts: [
          { id: 1, x: 90, y: 10, color: "violet", title: "إضافة مستأجر جديد", description: "انقر لفتح نموذج إضافة مستأجر. البيانات المطلوبة: الاسم الكامل، رقم الهوية/الإقامة، رقم الجوال، البريد الإلكتروني، الجنسية." },
          { id: 2, x: 50, y: 22, color: "amber", title: "شريط البحث", description: "ابحث بالاسم أو رقم الهاتف أو رقم الهوية. يعمل البحث فوراً أثناء الكتابة." },
          { id: 3, x: 5, y: 52, color: "violet", title: "أيقونة المستأجر", description: "الحرف الأول من اسم المستأجر داخل دائرة ملونة. عند وجود بريد إلكتروني يظهر أسفل الاسم." },
          { id: 4, x: 52, y: 52, color: "emerald", title: "شارة العقود النشطة", description: "عدد العقود الإجمالية مع شارة خضراء للعقود النشطة. تساعدك على تحديد المستأجرين متعددي الوحدات." },
          { id: 5, x: 75, y: 52, color: "teal", title: "إجمالي المدفوعات", description: "مجموع كل ما دفعه المستأجر تاريخياً. مؤشر مهم على مدى التزامه المالي." },
          { id: 6, x: 85, y: 52, color: "blue", title: "زر الملف الشخصي", description: "انقر 'ملف' لعرض الصفحة الكاملة للمستأجر: بياناته الشخصية، جميع عقوده، وسجل مدفوعاته." },
          { id: 7, x: 93, y: 52, color: "indigo", title: "زر التوسعة", description: "انقر السهم لعرض تفاصيل المستأجر مباشرة في الجدول: معلومات التواصل، العقود، والملخص المالي." },
        ],
        steps: [
          { icon: "👤", text: "اضغط مستأجر جديد" },
          { icon: "📋", text: "أدخل البيانات الشخصية" },
          { icon: "📱", text: "تحقق من رقم الجوال" },
          { icon: "💾", text: "احفظ المستأجر" },
          { icon: "📄", text: "أنشئ عقد إيجار" },
        ],
        tips: [
          "أدخل رقم الهوية بدقة — يُستخدم في عقود الإيجار الإلكترونية (إيجار)",
          "البريد الإلكتروني مهم لإرسال إشعارات الدفع والتذكيرات تلقائياً",
          "احتفظ بسجل المستأجرين السابقين لمراجعة سجلهم قبل التعاقد معهم مجدداً",
        ],
      },
    ],
  },
  {
    id: "owners",
    title: "إدارة الملاك",
    icon: Crown,
    color: "text-amber-600",
    overview: "سجل ملاك العقارات المُدارة — مخصص للعقارات التي تديرها النيابةً عن ملاكها.",
    subsections: [
      {
        id: "owners-list",
        title: "قائمة الملاك",
        screenshot: <OwnersMockScreen />,
        description: "جدول شامل لملاك العقارات مع عدد المباني والوحدات والعقود النشطة لكل مالك.",
        callouts: [
          { id: 1, x: 88, y: 10, color: "amber", title: "إضافة مالك جديد", description: "أضف مالك فرد أو شركة. البيانات المطلوبة: الاسم، نوع المالك (فرد/شركة)، رقم الهوية أو السجل التجاري، رقم الجوال." },
          { id: 2, x: 42, y: 40, color: "blue", title: "نوع المالك", description: "'فرد' للأشخاص الطبيعيين، 'شركة' للكيانات التجارية. يؤثر على المستندات القانونية المطلوبة." },
          { id: 3, x: 55, y: 40, color: "indigo", title: "عدد المباني والوحدات", description: "عدد المباني والوحدات المرتبطة بهذا المالك في النظام. للتحقق من توزيع الملكية." },
          { id: 4, x: 72, y: 40, color: "emerald", title: "العقود النشطة", description: "عدد عقود الإيجار النشطة على وحدات هذا المالك. مؤشر حيوي لأداء محفظته العقارية." },
          { id: 5, x: 88, y: 40, color: "red", title: "أزرار التعديل والحذف", description: "عدّل بيانات المالك في أي وقت. الحذف يتطلب تأكيداً ولا يمكن إجراؤه إذا كانت للمالك وحدات مرتبطة." },
        ],
        steps: [
          { icon: "👑", text: "اضغط إضافة مالك" },
          { icon: "📝", text: "حدد النوع (فرد/شركة)" },
          { icon: "🪪", text: "أدخل رقم الهوية/السجل" },
          { icon: "💾", text: "احفظ بيانات المالك" },
          { icon: "🏢", text: "اربط المباني بالمالك" },
        ],
        tips: [
          "استخدم هذه الميزة إذا كنت تدير عقارات لصالح الغير كشركة إدارة عقارية",
          "ربط المباني والوحدات بالمالك يسهل إعداد تقارير ملخص الأداء لكل مالك",
          "للشركات: أدخل رقم السجل التجاري بدلاً من رقم الهوية الوطنية",
        ],
      },
    ],
  },
  {
    id: "contracts",
    title: "إدارة العقود",
    icon: FileText,
    color: "text-blue-600",
    overview: "إنشاء ومتابعة عقود الإيجار كاملةً — من التوقيع إلى التجديد أو الإنهاء، مع جدول الدفعات التلقائي.",
    subsections: [
      {
        id: "contracts-list",
        title: "قائمة عقود الإيجار",
        screenshot: <ContractsMockScreen />,
        description: "جدول بجميع العقود مع إمكانية توسيع كل عقد لعرض تفاصيله وجدول الدفعات دون مغادرة الصفحة.",
        callouts: [
          { id: 1, x: 88, y: 10, color: "blue", title: "إضافة عقد جديد", description: "انقر لفتح نموذج إنشاء عقد. ستختار: المستأجر، الوحدة، تاريخ البداية والنهاية، مبلغ الإيجار، دورة السداد (شهري/ربع سنوي/سنوي)." },
          { id: 2, x: 5, y: 50, color: "indigo", title: "رقم إيجار الإلكتروني", description: "الرقم التسلسلي للعقد في منصة إيجار الإلكترونية. أدخله إذا كان العقد مسجلاً في إيجار." },
          { id: 3, x: 57, y: 50, color: "amber", title: "بيانات العقد الأساسية", description: "الوحدة، المستأجر، تواريخ العقد، مبلغ الإيجار، ودورة السداد. انقر على الصف للتنقل لصفحة تفاصيل العقد." },
          { id: 4, x: 79, y: 50, color: "emerald", title: "حالة العقد", description: "ساري (أخضر) — العقد نشط. منتهي (رمادي) — انتهت مدته. ملغي (أحمر) — تم إنهاؤه مبكراً." },
          { id: 5, x: 93, y: 50, color: "violet", title: "زر التوسعة", description: "انقر للكشف عن تفاصيل العقد وجدول الدفعات وخيارات الوسوم والتعليقات بدون مغادرة الصفحة." },
          { id: 6, x: 20, y: 78, color: "teal", title: "تفاصيل العقد الموسعة", description: "عند التوسعة تظهر: نوع العقد، الإيجار السنوي، التأمين، دورة السداد، مسؤولية الخدمات (كهرباء/ماء)، والتجديد التلقائي." },
        ],
        steps: [
          { icon: "📄", text: "اضغط إضافة عقد" },
          { icon: "👤", text: "اختر المستأجر" },
          { icon: "🏠", text: "اختر الوحدة" },
          { icon: "📅", text: "حدد مدة العقد" },
          { icon: "💰", text: "حدد مبلغ الإيجار والدورة" },
          { icon: "✅", text: "احفظ وانتظر جدول الدفعات" },
        ],
        tips: [
          "النظام يُنشئ جدول الدفعات تلقائياً بناءً على مدة العقد ودورة السداد",
          "فعّل 'التجديد التلقائي' للعقود المستقرة لتجنب الانقطاع",
          "أدخل مبلغ التأمين (الضمان) بشكل منفصل — سيُتابع في صفحة التأمينات",
          "دورة السداد 'ربع سنوي' تعني 4 دفعات سنوياً كل 3 أشهر",
        ],
      },
    ],
  },
  {
    id: "payments",
    title: "المدفوعات",
    icon: Banknote,
    color: "text-indigo-600",
    overview: "تسجيل ومتابعة دفعات الإيجار، تتبع المتأخرات، وتسجيل الدفعات بطرق دفع متعددة.",
    subsections: [
      {
        id: "payments-list",
        title: "متابعة مدفوعات الإيجار",
        screenshot: <PaymentsMockScreen />,
        description: "جدول بجميع الدفعات المستحقة والمدفوعة والمتأخرة مع إمكانية تسجيل الدفعات مباشرةً.",
        callouts: [
          { id: 1, x: 90, y: 10, color: "indigo", title: "تسجيل دفعة جديدة", description: "لتسجيل دفعة يدوية غير مرتبطة بجدول دفعات. مفيد للمدفوعات الاستثنائية." },
          { id: 2, x: 50, y: 22, color: "amber", title: "فلاتر الحالة", description: "صفّ الدفعات حسب: مدفوع ✓، معلق (لم يحن موعده)، متأخر (تجاوز موعد الاستحقاق)." },
          { id: 3, x: 30, y: 50, color: "blue", title: "تاريخ الاستحقاق", description: "الموعد المتفق عليه في العقد لدفع هذه الدفعة. الدفعات التي تجاوزت هذا التاريخ تُلوّن باللون الأحمر." },
          { id: 4, x: 50, y: 50, color: "violet", title: "المبلغ vs المدفوع", description: "يعرض العمود الأول المبلغ المستحق والثاني المبلغ المدفوع فعلياً. يمكن تسجيل دفع جزئي." },
          { id: 5, x: 79, y: 50, color: "emerald", title: "حالة الدفعة", description: "مدفوع (أخضر) — مكتمل. معلق (رمادي) — لم يحن وقته. متأخر (أحمر) — تجاوز الموعد." },
          { id: 6, x: 90, y: 72, color: "teal", title: "زر تسجيل الدفع", description: "انقر لتسجيل دفعة القسط. ستدخل: طريقة الدفع (نقدي/تحويل/شيك)، تاريخ الدفع، ورقم المرجع." },
        ],
        steps: [
          { icon: "💵", text: "ابحث عن المستأجر" },
          { icon: "📋", text: "حدد الدفعة المستحقة" },
          { icon: "✅", text: "اضغط تسجيل" },
          { icon: "💳", text: "اختر طريقة الدفع" },
          { icon: "🔢", text: "أدخل رقم المرجع" },
          { icon: "💾", text: "احفظ الدفعة" },
        ],
        tips: [
          "الدفعات المتأخرة تظهر بخلفية حمراء لتسهيل التمييز — تابعها أولاً",
          "سجّل رقم المرجع للشيك أو التحويل البنكي دائماً للمراجعة لاحقاً",
          "يمكنك تصدير كشف المدفوعات لملف Excel لمشاركته مع المحاسب",
        ],
      },
    ],
  },
  {
    id: "maintenance",
    title: "طلبات الصيانة",
    icon: Wrench,
    color: "text-orange-600",
    overview: "إنشاء ومتابعة طلبات الصيانة — من الإبلاغ إلى الإغلاق، مع نظام الأولويات والموافقات.",
    subsections: [
      {
        id: "maintenance-list",
        title: "إدارة طلبات الصيانة",
        screenshot: <MaintenanceMockScreen />,
        description: "جدول بجميع طلبات الصيانة مع فلاتر الحالة وإمكانية الموافقة أو الرفض مباشرةً.",
        callouts: [
          { id: 1, x: 88, y: 10, color: "orange", title: "طلب صيانة جديد", description: "أنشئ طلباً جديداً بتحديد: الوحدة، فئة الصيانة (سباكة/كهرباء/تكييف/دهانات)، الوصف التفصيلي، والأولوية." },
          { id: 2, x: 15, y: 35, color: "blue", title: "فلاتر الحالة", description: "الكل / مفتوح (يحتاج معالجة) / جاري (قيد التنفيذ) / مكتمل (تمت معالجته) / مغلق." },
          { id: 3, x: 42, y: 57, color: "red", title: "مستوى الأولوية", description: "عالية (أحمر) — طوارئ تحتاج تدخلاً فورياً. متوسطة (برتقالي) — خلال يومين. منخفضة (رمادي) — جدولها ضمن الأسبوع." },
          { id: 4, x: 57, y: 57, color: "indigo", title: "حالة الطلب", description: "مفتوح → جاري → مكتمل → مغلق. تتغير الحالة عند الموافقة والتنفيذ." },
          { id: 5, x: 78, y: 57, color: "emerald", title: "أزرار الموافقة والرفض", description: "للمستخدمين ذوي الصلاحيات: قبول الطلب يُحوّله لحالة 'جاري'. الرفض يتطلب إدخال سبب." },
        ],
        steps: [
          { icon: "🔧", text: "اضغط طلب صيانة جديد" },
          { icon: "🏠", text: "اختر الوحدة المتأثرة" },
          { icon: "📝", text: "اكتب وصفاً دقيقاً" },
          { icon: "⚡", text: "حدد مستوى الأولوية" },
          { icon: "✅", text: "قدّم الطلب" },
          { icon: "👁", text: "تابع الحالة يومياً" },
        ],
        tips: [
          "أولوية 'عالية' للمشاكل التي تؤثر على السلامة أو تجعل الوحدة غير صالحة للسكن",
          "صِف المشكلة بدقة: 'تسرب مياه من أسفل الحوض في المطبخ' أفضل من 'مشكلة سباكة'",
          "الطلبات المقبولة يمكن إرفاق فاتورة المقاول بها عند الإغلاق",
        ],
      },
    ],
  },
  {
    id: "inspections",
    title: "التفتيش والتأمينات",
    icon: ClipboardList,
    color: "text-teal-600",
    overview: "جدولة وتتبع عمليات فحص الوحدات العقارية عند دخول أو خروج المستأجرين، مع إدارة التأمينات.",
    subsections: [
      {
        id: "inspections-list",
        title: "جدولة فحص الوحدات",
        screenshot: <InspectionsMockScreen />,
        description: "جدولة عمليات فحص الوحدات وتسجيل نتائجها وتقييم حالة الوحدة بعد كل فحص.",
        callouts: [
          { id: 1, x: 90, y: 10, color: "teal", title: "جدولة فحص جديد", description: "انقر لفتح نموذج الجدولة. اختر: الوحدة، نوع الفحص، تاريخ الفحص، واسم المفتش." },
          { id: 2, x: 18, y: 35, color: "blue", title: "فلاتر حالة الفحص", description: "الكل / مجدول (موعد قادم) / مكتمل (تم التنفيذ) / ملغى." },
          { id: 3, x: 30, y: 62, color: "indigo", title: "نوع الفحص", description: "دخول مستأجر — عند استلام الوحدة. خروج مستأجر — عند التسليم. دوري — صيانة وقائية. صيانة — بعد إصلاح." },
          { id: 4, x: 60, y: 62, color: "amber", title: "تقييم النجوم", description: "تقييم حالة الوحدة من 1-5 نجوم بعد الفحص. 5 = ممتاز، 3 = مقبول، 1 = يحتاج إصلاح عاجل." },
          { id: 5, x: 88, y: 62, color: "emerald", title: "زر إتمام الفحص", description: "عند الضغط تُدخل التقييم والملاحظات لإغلاق الفحص المجدول وتسجيل نتائجه." },
        ],
        steps: [
          { icon: "📋", text: "اضغط جدولة فحص" },
          { icon: "🏠", text: "اختر الوحدة" },
          { icon: "📅", text: "حدد تاريخ الفحص" },
          { icon: "👷", text: "أدخل اسم المفتش" },
          { icon: "✅", text: "اضغط إتمام بعد الفحص" },
          { icon: "⭐", text: "سجّل التقييم والملاحظات" },
        ],
        tips: [
          "افحص الوحدة دائماً عند دخول وخروج كل مستأجر لتوثيق حالتها",
          "الفحص عند الخروج يحدد ما إذا كان يجب خصم جزء من التأمين",
          "الفحص الدوري كل 6 أشهر يكشف عن مشاكل الصيانة مبكراً",
        ],
      },
      {
        id: "deposits",
        title: "ودائع الضمان",
        screenshot: <DepositsMockScreen />,
        description: "تسجيل ودائع ضمان المستأجرين ومتابعة حالتها واسترداد المبالغ عند انتهاء العقد.",
        callouts: [
          { id: 1, x: 90, y: 10, color: "teal", title: "تسجيل وديعة جديدة", description: "انقر + تسجيل وديعة، اختر العقد النشط، أدخل مبلغ الوديعة وتاريخ الاستلام ثم احفظ." },
          { id: 2, x: 17, y: 35, color: "blue", title: "إجمالي الودائع", description: "عدد جميع الودائع المسجلة في النظام بغض النظر عن حالتها." },
          { id: 3, x: 50, y: 35, color: "indigo", title: "الودائع المحتجزة", description: "المبلغ الإجمالي لودائع الضمان التي لا تزال قيد الاحتجاز — ودائع عقود نشطة لم تُسترد بعد." },
          { id: 4, x: 83, y: 35, color: "emerald", title: "الودائع المستردة", description: "المبلغ الإجمالي للودائع التي تمت إعادتها للمستأجرين عند انتهاء عقودهم." },
          { id: 5, x: 18, y: 65, color: "amber", title: "فلاتر الحالة", description: "تصفية الودائع حسب: الكل / محتجزة (عقود نشطة) / مستردة (عقود منتهية)." },
          { id: 6, x: 88, y: 82, color: "rose", title: "زر استرداد الوديعة", description: "عند انتهاء العقد، اضغط استرداد وأدخل المبلغ المُسترد (قد يختلف عن الوديعة الأصلية في حالة وجود خصومات) وسبب الاسترداد." },
        ],
        steps: [
          { icon: "📄", text: "اختر عقداً نشطاً" },
          { icon: "💰", text: "سجّل مبلغ الوديعة" },
          { icon: "📅", text: "أدخل تاريخ الاستلام" },
          { icon: "🔒", text: "الوديعة تصبح محتجزة" },
          { icon: "✅", text: "عند الإنهاء: اضغط استرداد" },
          { icon: "💸", text: "أدخل المبلغ المُسترد وسبب الخصم" },
        ],
        tips: [
          "سجّل الوديعة عند توقيع العقد فوراً لضمان التوثيق الكامل",
          "مبلغ الاسترداد قد يقل عن الوديعة الأصلية في حال وجود أضرار تثبتها نتيجة فحص الخروج",
          "ربط ودائع الضمان بفحوصات الوحدة يحميك قانونياً عند النزاعات",
        ],
      },
    ],
  },
  {
    id: "occupancy",
    title: "تقرير الإشغال",
    icon: BarChart3,
    color: "text-blue-700",
    overview: "تقرير شامل لحالة إشغال جميع الوحدات العقارية مع رسوم بيانية ومقارنة أداء المباني.",
    subsections: [
      {
        id: "occupancy-report",
        title: "قراءة تقرير الإشغال",
        screenshot: <OccupancyMockScreen />,
        description: "تقرير مرئي شامل يعرض توزيع حالة الوحدات والمقارنة بين المباني وقائمة تفصيلية بجميع الوحدات.",
        callouts: [
          { id: 1, x: 10, y: 25, color: "blue", title: "معدل الإشغال الكلي", description: "النسبة المئوية الإجمالية للوحدات المؤجرة. ≥ 80% = أداء ممتاز، 60-80% = مقبول، < 60% = يحتاج اهتماماً." },
          { id: 2, x: 30, y: 25, color: "indigo", title: "إجمالي الوحدات", description: "مجموع كل الوحدات في جميع المباني. يشمل المؤجرة والمتاحة والتي تحت الصيانة." },
          { id: 3, x: 55, y: 25, color: "emerald", title: "عدد الوحدات المؤجرة", description: "الوحدات التي يوجد عليها عقد إيجار نشط حالياً." },
          { id: 4, x: 77, y: 25, color: "blue", title: "عدد الوحدات المتاحة", description: "الوحدات الشاغرة الجاهزة للإيجار — كلما زادت كلما انخفض الإشغال." },
          { id: 5, x: 95, y: 25, color: "violet", title: "الإيجار الشهري الكلي", description: "مجموع الإيجار الشهري لجميع الوحدات المؤجرة. يعكس الإيراد الشهري المتوقع." },
          { id: 6, x: 25, y: 56, color: "teal", title: "مخطط توزيع الوحدات", description: "رسم بياني دائري (Pie Chart) يعرض نسبة كل حالة: مؤجرة (أخضر) / متاحة (أزرق) / صيانة (برتقالي)." },
          { id: 7, x: 75, y: 56, color: "orange", title: "الإشغال حسب المبنى", description: "مقارنة نسبة إشغال كل مبنى مع شريط تقدم. يساعدك على تحديد المباني الأقل أداءً." },
          { id: 8, x: 50, y: 82, color: "amber", title: "القائمة التفصيلية", description: "كل الوحدات بحالتها والمستأجر الحالي وسعر الإيجار وتاريخ انتهاء العقد — مرجع شامل." },
        ],
        steps: [
          { icon: "📊", text: "افتح تقرير الإشغال" },
          { icon: "📈", text: "راجع معدل الإشغال الكلي" },
          { icon: "🏢", text: "قارن أداء المباني" },
          { icon: "🔍", text: "تحقق من الوحدات المتاحة" },
          { icon: "⚡", text: "اتخذ إجراء لزيادة الإشغال" },
        ],
        tips: [
          "استخدم هذا التقرير في الاجتماعات الشهرية لمراجعة أداء المحفظة",
          "المباني ذات الإشغال المنخفض تحتاج مراجعة لأسباب الشواغر وتحديث الأسعار",
          "تتبع تغيرات نسبة الإشغال شهرياً لقياس فاعلية جهود التسويق",
        ],
      },
    ],
  },
];

/* ─── Main Guide Page ───────────────────────── */

export default function PropertiesGuide() {
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [activeCallout, setActiveCallout] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const currentSection = sections.find((s) => s.id === activeSection) || sections[0];

  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
    setActiveCallout(null);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCalloutClick = (id: number) => {
    setActiveCallout((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden p-1.5 rounded hover:bg-gray-100"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <BookOpen className="h-5 w-5 text-blue-600" />
            <div>
              <h1 className="text-base font-bold text-gray-800">دليل إدارة الأملاك</h1>
              <p className="text-[10px] text-gray-400">دليل إرشادي مصور — نظام غيث ERP</p>
            </div>
          </div>
          <Link href="/properties/dashboard">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <ChevronRight className="h-3.5 w-3.5" />
              العودة للنظام
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "w-64 shrink-0 bg-white border-l min-h-screen sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto transition-all duration-200",
            "hidden md:block",
            sidebarOpen && "!block fixed inset-y-[57px] z-10 shadow-xl"
          )}
        >
          <div className="p-4">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-3">محتويات الدليل</p>
            <nav className="space-y-1">
              {sections.map((s) => {
                const Icon = s.icon;
                const isActive = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleSectionClick(s.id)}
                    className={cn(
                      "w-full text-right flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all",
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-white" : s.color)} />
                    <span className="font-medium text-xs">{s.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 md:p-6 max-w-5xl mx-auto">
          {/* Section Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className={cn("p-2 rounded-xl bg-white shadow-sm border")}>
                <currentSection.icon className={cn("h-6 w-6", currentSection.color)} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">{currentSection.title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{currentSection.overview}</p>
              </div>
            </div>
          </div>

          {/* Subsections */}
          {currentSection.subsections.map((sub) => (
            <div key={sub.id} className="space-y-4 mb-8">
              <h3 className="text-base font-semibold text-gray-700 border-b pb-2 flex items-center gap-2">
                <span className="w-1 h-5 bg-blue-600 rounded-full inline-block" />
                {sub.title}
              </h3>

              <p className="text-sm text-gray-600 leading-relaxed">{sub.description}</p>

              {/* Screenshot with Callouts */}
              <AnnotatedScreenshot
                callouts={sub.callouts}
                activeCallout={activeCallout}
                onCalloutClick={handleCalloutClick}
              >
                {sub.screenshot}
              </AnnotatedScreenshot>

              {/* Hint */}
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-blue-50 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span>انقر على الأرقام الملونة في الصورة لعرض شرح تفصيلي لكل عنصر</span>
              </div>

              {/* Callout Details */}
              <CalloutDetails callouts={sub.callouts} activeId={activeCallout} />

              {/* Steps */}
              {sub.steps && sub.steps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    خطوات العمل
                  </h4>
                  <StepList steps={sub.steps} />
                </div>
              )}

              {/* Tips */}
              {sub.tips && sub.tips.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    نصائح مهمة
                  </h4>
                  <ul className="space-y-1.5">
                    {sub.tips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {/* Navigation between sections */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t">
            {(() => {
              const idx = sections.findIndex((s) => s.id === activeSection);
              const prev = idx > 0 ? sections[idx - 1] : null;
              const next = idx < sections.length - 1 ? sections[idx + 1] : null;
              return (
                <>
                  {prev ? (
                    <button
                      onClick={() => handleSectionClick(prev.id)}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <ChevronRight className="h-4 w-4" />
                      {prev.title}
                    </button>
                  ) : <div />}
                  {next ? (
                    <button
                      onClick={() => handleSectionClick(next.id)}
                      className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {next.title}
                      <ChevronRight className="h-4 w-4 rotate-180" />
                    </button>
                  ) : (
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                      اكتملت جميع أقسام الدليل
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </main>
      </div>
    </div>
  );
}
