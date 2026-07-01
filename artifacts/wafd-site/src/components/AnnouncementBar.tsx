import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toSafeHref } from "@/lib/wafd-constants";

interface AnnouncementBarProps {
  message: string;
  link?: { text: string; href?: string; onClick?: () => void };
  storageKey?: string;
}

export default function AnnouncementBar({
  message,
  link,
  storageKey = "wafd-announcement-dismissed",
}: AnnouncementBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(storageKey);
    if (!dismissed) setVisible(true);
  }, [storageKey]);

  const dismiss = () => {
    sessionStorage.setItem(storageKey, "true");
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full overflow-hidden"
          style={{
            background: "linear-gradient(90deg, oklch(0.52 0.12 185), oklch(0.38 0.10 185))",
          }}
          dir="rtl"
        >
          <div className="container flex items-center justify-between py-2.5 gap-3">
            <div className="flex-1" />
            <p
              className="text-white text-sm font-medium text-center flex items-center gap-2 flex-wrap justify-center"
              style={{ fontFamily: "'Cairo', sans-serif" }}
            >
              <span className="text-[oklch(0.72_0.09_75)]">✦</span>
              {message}
              {link && (
                link.onClick ? (
                  <button
                    onClick={link.onClick}
                    className="underline underline-offset-2 font-bold text-[oklch(0.90_0.06_75)] hover:text-white transition-colors cursor-pointer bg-transparent border-0 p-0"
                    style={{ fontFamily: "'Cairo', sans-serif" }}
                  >
                    {link.text}
                  </button>
                ) : (
                  <a
                    href={toSafeHref(link.href)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 font-bold text-[oklch(0.90_0.06_75)] hover:text-white transition-colors"
                  >
                    {link.text}
                  </a>
                )
              )}
              <span className="text-[oklch(0.72_0.09_75)]">✦</span>
            </p>
            <div className="flex-1 flex justify-end">
              <button
                onClick={dismiss}
                className="text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                aria-label="إغلاق الإعلان"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
