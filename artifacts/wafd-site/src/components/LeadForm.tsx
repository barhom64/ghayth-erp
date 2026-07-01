import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, CheckCircle, User, Phone, ChevronDown, Mail } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import type { LeadCampaign } from "@/contexts/LeadFormContext";

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  campaign?: LeadCampaign | null;
}

export default function LeadForm({ open, onClose, campaign }: LeadFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { t, dir } = useLanguage();

  const SERVICES = [
    { value: "visa", label: t.leadForm.serviceVisa },
    { value: "transport", label: t.leadForm.serviceTransport },
    { value: "hotel", label: t.leadForm.serviceHotel },
    { value: "package", label: t.leadForm.servicePackage },
    { value: "other", label: t.leadForm.serviceOther },
  ];

  const [, navigate] = useLocation();
  const [submitting, setSubmitting] = useState(false);

  // جسر التقاط الطلبات: يكتب مباشرة في نواة غيث (crm_opportunities) عبر
  // POST /api/public/leads مع site="wafd" — لا backend مكرر. المستأجر (شركة id=4)
  // يُحَل على الخادم من الـ slug، لا نرسل أي companyId من العميل.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !service) {
      toast.error(t.leadForm.requiredFields);
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error(t.leadForm.invalidEmail);
      return;
    }
    const serviceLabel = SERVICES.find((s) => s.value === service)?.label ?? service;
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "wafd",
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          subject: serviceLabel,
          message: notes.trim() || undefined,
          source: "website",
          // عزو الحملة: عند فتح النموذج من بطاقة حملة نرسل slug ليحلّه الخادم
          // إلى campaignId ويضبط المصدر باسم الحملة (لا نثق بأي معرّف من العميل).
          campaignSlug: campaign?.slug || undefined,
          website: "",
        }),
      });
      if (!res.ok) throw new Error("lead submit failed");
      setSubmitted(true);
      toast.success(t.leadForm.successToast);
      setTimeout(() => {
        onClose();
        navigate("/thank-you");
      }, 700);
    } catch {
      toast.error(t.leadForm.errorToast);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setName("");
    setPhone("");
    setEmail("");
    setService("");
    setNotes("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              dir={dir}
            >
              {/* Header */}
              <div
                className="px-6 py-5 flex items-center justify-between"
                style={{
                  background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                }}
              >
                <div>
                  <h2
                    className="text-white text-xl font-black"
                    style={{ fontFamily: "'Cairo', sans-serif" }}
                  >
                    {t.leadForm.title}
                  </h2>
                  <p
                    className="text-white/70 text-sm mt-0.5"
                    style={{ fontFamily: "'Tajawal', sans-serif" }}
                  >
                    {t.leadForm.subtitle}
                  </p>
                </div>
                <button
                  onClick={handleClose}
                  className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6">
                {submitted ? (
                  <motion.div
                    className="text-center py-8"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <CheckCircle
                      size={56}
                      className="mx-auto mb-4"
                      style={{ color: "oklch(0.52 0.12 185)" }}
                    />
                    <h3
                      className="text-xl font-black text-[oklch(0.14_0.005_0)] mb-2"
                      style={{ fontFamily: "'Cairo', sans-serif" }}
                    >
                      {t.leadForm.successTitle}
                    </h3>
                    <p
                      className="text-[oklch(0.62_0.005_0)] text-sm leading-relaxed"
                      style={{ fontFamily: "'Tajawal', sans-serif" }}
                    >
                      {t.leadForm.successDesc}
                    </p>
                    <button
                      onClick={handleClose}
                      className="mt-6 px-8 py-3 rounded-full text-white font-bold text-sm"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                        fontFamily: "'Cairo', sans-serif",
                      }}
                    >
                      {t.leadForm.okBtn}
                    </button>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                      <label
                        className="block text-sm font-bold text-[oklch(0.14_0.005_0)] mb-1.5"
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {t.leadForm.fullName} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User
                          size={16}
                          className={`absolute top-1/2 -translate-y-1/2 ${dir === "rtl" ? "right-3" : "left-3"} text-[oklch(0.62_0.005_0)]`}
                        />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t.leadForm.namePlaceholder}
                          className={`w-full ${dir === "rtl" ? "pr-9 pl-4" : "pl-9 pr-4"} py-3 rounded-xl border border-[oklch(0.88_0.006_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.52_0.12_185)] text-sm bg-[oklch(0.98_0.004_80)]`}
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label
                        className="block text-sm font-bold text-[oklch(0.14_0.005_0)] mb-1.5"
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {t.leadForm.emailLabel} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail
                          size={16}
                          className={`absolute top-1/2 -translate-y-1/2 ${dir === "rtl" ? "right-3" : "left-3"} text-[oklch(0.62_0.005_0)]`}
                        />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="example@email.com"
                          className={`w-full ${dir === "rtl" ? "pr-9 pl-4" : "pl-9 pr-4"} py-3 rounded-xl border border-[oklch(0.88_0.006_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.52_0.12_185)] text-sm bg-[oklch(0.98_0.004_80)]`}
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    <div>
                      <label
                        className="block text-sm font-bold text-[oklch(0.14_0.005_0)] mb-1.5"
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {t.leadForm.phoneLabel} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone
                          size={16}
                          className={`absolute top-1/2 -translate-y-1/2 ${dir === "rtl" ? "right-3" : "left-3"} text-[oklch(0.62_0.005_0)]`}
                        />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="05xxxxxxxx"
                          className={`w-full ${dir === "rtl" ? "pr-9 pl-4" : "pl-9 pr-4"} py-3 rounded-xl border border-[oklch(0.88_0.006_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.52_0.12_185)] text-sm bg-[oklch(0.98_0.004_80)]`}
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                          dir="ltr"
                        />
                      </div>
                    </div>

                    {/* Service */}
                    <div>
                      <label
                        className="block text-sm font-bold text-[oklch(0.14_0.005_0)] mb-1.5"
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {t.leadForm.serviceLabel} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <ChevronDown
                          size={16}
                          className={`absolute top-1/2 -translate-y-1/2 ${dir === "rtl" ? "left-3" : "right-3"} text-[oklch(0.62_0.005_0)] pointer-events-none`}
                        />
                        <select
                          value={service}
                          onChange={(e) => setService(e.target.value)}
                          className={`w-full ${dir === "rtl" ? "pr-4 pl-9" : "pl-4 pr-9"} py-3 rounded-xl border border-[oklch(0.88_0.006_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.52_0.12_185)] text-sm bg-[oklch(0.98_0.004_80)] appearance-none`}
                          style={{ fontFamily: "'Tajawal', sans-serif" }}
                        >
                          <option value="">{t.leadForm.serviceSelect}</option>
                          {SERVICES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <label
                        className="block text-sm font-bold text-[oklch(0.14_0.005_0)] mb-1.5"
                        style={{ fontFamily: "'Cairo', sans-serif" }}
                      >
                        {t.leadForm.notesLabel}{" "}
                        <span className="text-[oklch(0.62_0.005_0)] font-normal">{t.leadForm.notesOptional}</span>
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t.leadForm.notesPlaceholder}
                        rows={3}
                        className="w-full px-4 py-3 rounded-xl border border-[oklch(0.88_0.006_80)] focus:outline-none focus:ring-2 focus:ring-[oklch(0.52_0.12_185)] text-sm bg-[oklch(0.98_0.004_80)] resize-none"
                        style={{ fontFamily: "'Tajawal', sans-serif" }}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-sm transition-all disabled:opacity-60"
                      style={{
                        background: "linear-gradient(135deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
                        fontFamily: "'Cairo', sans-serif",
                        boxShadow: "0 4px 20px oklch(0.52 0.12 185 / 0.3)",
                      }}
                    >
                      {submitting ? (
                        <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                      ) : (
                        <>
                          <Send size={16} />
                          {t.leadForm.submitBtn}
                        </>
                      )}
                    </button>
                    <p className="text-center text-xs mt-3" style={{ fontFamily: "'Tajawal', sans-serif", color: "oklch(0.62 0.005 0)" }}>
                      {t.leadForm.privacyNote}{" "}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
                        style={{ color: "oklch(0.52 0.12 185)", textDecoration: "underline" }}>
                        {t.leadForm.privacyLink}
                      </a>
                    </p>
                  </form>
                )}
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
