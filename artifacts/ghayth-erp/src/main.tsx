import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import "./styles/print.css";

// Configure API client to use the token from localStorage
setAuthTokenGetter(() => {
  return localStorage.getItem("erp_token");
});

document.documentElement.dir = "rtl";
document.documentElement.lang = "ar";

createRoot(document.getElementById("root")!).render(<App />);
