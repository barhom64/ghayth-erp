import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp, mkdir, writeFile } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    // Two bundles: the server (dist/server.mjs) and the OpenTelemetry tracing
    // preload (dist/otel.mjs). The process entry dist/index.mjs is a generated
    // shim — see writeEntryShim() below.
    entryPoints: {
      server: path.resolve(artifactDir, "src/index.ts"),
      otel: path.resolve(artifactDir, "src/otel.ts"),
    },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      // express and pg are externalised so OpenTelemetry auto-instrumentation
      // can patch them when loaded — patching is impossible once a package is
      // inlined into the bundle. See src/otel.ts and lib/tracing.ts.
      "express",
      "pg",
      "pdfkit",
      "fontkit",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

async function copyAssets() {
  const src = path.resolve(artifactDir, "src/assets");
  const dst = path.resolve(artifactDir, "dist/assets");
  try {
    await mkdir(dst, { recursive: true });
    await cp(src, dst, { recursive: true });
  } catch {
    // assets directory may not exist; ignore
  }
}

async function copyMigrations() {
  const src = path.resolve(artifactDir, "src/migrations");
  const dst = path.resolve(artifactDir, "dist/migrations");
  try {
    await mkdir(dst, { recursive: true });
    await cp(src, dst, { recursive: true });
  } catch {
    // migrations directory may not exist; ignore
  }
}

// dist/index.mjs is the process entry point (Dockerfile CMD, e2e workflow,
// package.json start) and stays so — but it is now a thin generated shim. It
// imports the tracing preload (dist/otel.mjs) to completion FIRST so
// OpenTelemetry installs its require hooks, THEN dynamically imports the
// server bundle so the server's externalised express/pg imports resolve
// afterwards and get instrumented. A static import of the server would be
// hoisted above the preload and defeat this ordering.
async function writeEntryShim() {
  const distDir = path.resolve(artifactDir, "dist");
  const shim = `import "./otel.mjs";\nawait import("./server.mjs");\n`;
  await writeFile(path.resolve(distDir, "index.mjs"), shim, "utf8");
}

buildAll().then(writeEntryShim).then(copyAssets).then(copyMigrations).catch((err) => {
  console.error(err);
  process.exit(1);
});
