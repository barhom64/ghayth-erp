import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Manual chunk splitting — keeps the initial JS payload small by pulling
    // big shared libraries into separate, long-cacheable chunks. Route-level
    // splitting still happens via React.lazy in src/App.tsx; this layer
    // handles vendor code only.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          // React core — stays warm for the entire SPA lifetime, isolate it
          // so router/query updates don't bust this cache entry.
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "vendor-react";
          }
          // Data layer — TanStack Query is on every page.
          if (id.includes("@tanstack/react-query")) return "vendor-query";
          // Routing — react-router-dom + history.
          if (id.includes("react-router") || id.includes("/history/")) {
            return "vendor-router";
          }
          // Radix UI primitives — large surface, ship as one chunk so the
          // browser fetches it once on first interaction.
          if (id.includes("@radix-ui/")) return "vendor-radix";
          // Charts — heavy, lazy-rendered. Split out so dashboards don't
          // pay the cost on first paint of HR/Finance lists.
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          // Form / validation stack.
          if (
            id.includes("react-hook-form") ||
            id.includes("@hookform/") ||
            id.includes("/zod/")
          ) {
            return "vendor-forms";
          }
          // Date / i18n.
          if (id.includes("date-fns") || id.includes("dayjs")) {
            return "vendor-dates";
          }
          // Everything else from node_modules drops into a single fallback
          // vendor chunk so the entry bundle stays lean.
          return "vendor-misc";
        },
      },
    },
    // Warn-only ceiling for the entry bundle. Anything bigger than ~500 KB
    // gzip belongs in a manual chunk above.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
