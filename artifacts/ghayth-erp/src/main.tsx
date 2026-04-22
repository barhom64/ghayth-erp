import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { ApiError } from "@/lib/api";
import App from "./App";
import "./index.css";
import "./styles/print.css";

// Configure API client to use the token from localStorage
setAuthTokenGetter(() => {
  return localStorage.getItem("erp_token");
});

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
}

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";

createRoot(document.getElementById("root")!).render(<App />);
