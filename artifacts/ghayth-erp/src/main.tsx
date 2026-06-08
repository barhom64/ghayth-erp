import { createRoot } from "react-dom/client";
import { ApiError } from "@/lib/api";
import App from "./App";
import "./index.css";
import "./styles/print.css";

// Silence the Replit dev overlay for ApiError — the error is already handled
// downstream by PageStateWrapper (typed error UI), so letting the overlay
// intercept it on top of the in-page message is noisy and redundant. The
// handler runs BEFORE Replit's listener because it's attached here at bundle
// init, before any component mounts. Non-ApiError rejections still surface
// the overlay so real bugs remain visible in development.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason instanceof ApiError) {
      event.preventDefault();
    }
  });
  window.addEventListener("error", (event) => {
    if (event.error instanceof ApiError) {
      event.preventDefault();
    }
  });

  // Stale-deploy recovery. A new build purges the old hashed chunk files, so a
  // browser holding a stale index.html (or an open tab) 404s on dynamic imports
  // ("Failed to fetch dynamically imported module"). Vite fires
  // `vite:preloadError` in that case — force a one-time full reload to fetch the
  // fresh index.html + chunk graph. The timestamp guard prevents a reload loop
  // if a chunk is genuinely missing, while still recovering on each later deploy.
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    const KEY = "erp:chunk-reload-at";
    const last = Number(sessionStorage.getItem(KEY) || "0");
    if (Date.now() - last < 10000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    window.location.reload();
  });
}

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";

createRoot(document.getElementById("root")!).render(<App />);
