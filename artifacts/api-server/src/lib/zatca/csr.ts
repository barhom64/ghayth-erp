/**
 * Certificate Signing Request (CSR) generation for ZATCA onboarding.
 *
 * The seller submits a CSR + a one-time OTP (generated from the ZATCA
 * Fatoora portal) to `POST /compliance` to receive a compliance CSID,
 * then later promotes that CSID to production after passing the
 * 6-invoice test pack.
 *
 * Spec reference: ZATCA E-Invoicing Detailed Technical Guideline §5
 * (Onboarding) and §5.3 (CSR Subject Requirements).
 *
 * The CSR Subject MUST include these custom OIDs:
 *   - 2.5.4.4   surname
 *   - 2.5.4.42  givenName            (set to TIN)
 *   - 2.5.4.97  organizationIdentifier (CR number)
 *   - 2.5.4.10  organizationName     (legal name, AR)
 *   - 2.5.4.11  organizationalUnit   (branch / unit name)
 *   - 2.5.4.6   countryName          ("SA")
 * Plus a custom **Subject Alternative Name** with:
 *   - VAT number (TIN)
 *   - CRN
 *   - Invoice type (`1100` Standard + Simplified, `1000` Standard, `0100` Simplified)
 *   - Location (Riyadh, Jeddah, ...)
 *   - Industry (Retail, Healthcare, ...)
 *
 * **STATUS: SKELETON.** Building a CSR from scratch in pure Node
 * means hand-writing ASN.1 DER encoders for the custom OIDs and the
 * SAN extension — too much surface area to land in this PR safely.
 * Two practical paths once it's time to wire this up:
 *
 *   A) Shell out to `openssl req -new -newkey ec:<params> ...` with
 *      a config file generated per company. Pros: zero npm deps,
 *      battle-tested. Cons: requires openssl on the deployment host
 *      (already true today in db/bootstrap.sh).
 *
 *   B) Use `@peculiar/x509` (npm) — pure TypeScript X.509 / PKCS-10
 *      builder. Pros: no shell dep, runs in-process. Cons: adds a
 *      transitive dep on the WebCrypto polyfill.
 *
 * Recommendation: option A on the server (sandbox) so onboarding works
 * day one, option B for the test pack runner so CI doesn't need
 * openssl.
 *
 * Shape of inputs the eventual implementation will accept (locked
 * here so the route handler can be written against it in parallel):
 */
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../config.js";

export interface CsrInput {
  /** Company legal name in Arabic — mapped to organizationName (2.5.4.10). */
  organizationName: string;
  /** Branch / unit name — mapped to organizationalUnit (2.5.4.11). */
  organizationalUnit: string;
  /** Common name — usually the company name + branch suffix. */
  commonName: string;
  /** Saudi VAT registration number (15 digits). */
  vatRegistrationNumber: string;
  /** Saudi commercial registration (CRN, 10 digits). */
  crNumber: string;
  /**
   * `1100` = both Standard + Simplified
   * `1000` = Standard only (B2B)
   * `0100` = Simplified only (B2C, POS)
   */
  invoiceType: "1100" | "1000" | "0100";
  /** City of operation — used in the SAN extension. */
  location: string;
  /** Industry category — used in the SAN extension. */
  industry: string;
  /** Whether to target sandbox or production CSID issuance. */
  environment: "sandbox" | "production";
}

export interface GeneratedCsr {
  /** PEM-encoded P-256 private key. MUST be encrypted at rest. */
  privateKeyPem: string;
  /** PEM-encoded CSR. Submitted with the OTP to ZATCA. */
  csrPem: string;
  /** Base64-encoded CSR (handier for direct use in API payloads). */
  csrBase64: string;
}

/**
 * Generate a P-256 keypair + CSR for ZATCA onboarding.
 *
 * Implementation today: shells out to `openssl req` with a templated
 * config that includes the ZATCA-specific OIDs and SAN extension.
 * The ECDSA private key never leaves the temp dir except as a return
 * value — caller is responsible for encrypting it before storage.
 *
 * **NOT YET WIRED into a route.** The settings PUT endpoint will be
 * extended in week 3 of the rollout to call this helper, store the
 * encrypted private key + CSR in `zatca_settings`, and return the
 * Base64 CSR so the user can paste it into the ZATCA portal alongside
 * their OTP.
 */
export async function generateCsr(input: CsrInput): Promise<GeneratedCsr> {
  if (config.isProduction && !config.zatca.allowCsrGen) {
    // Belt and braces — CSR generation in production should be a
    // deliberate, audited action, not something the onboarding screen
    // does silently. The route handler can flip the env var after
    // requiring an extra confirmation step from the user.
    throw new Error(
      "ZATCA CSR generation is gated in production. Set ZATCA_ALLOW_CSR_GEN=1 after operator confirmation.",
    );
  }

  const tmp = await mkdtemp(join(tmpdir(), "zatca-csr-"));
  const keyPath = join(tmp, "key.pem");
  const csrPath = join(tmp, "csr.pem");
  const cnfPath = join(tmp, "openssl.cnf");

  const cnf = buildOpensslConfig(input);
  await writeFile(cnfPath, cnf, "utf8");

  // 1. Generate the EC private key (P-256).
  await runOpenssl([
    "ecparam",
    "-name", "prime256v1",
    "-genkey",
    "-noout",
    "-out", keyPath,
  ]);

  // 2. Build the CSR with the ZATCA-specific subject + extensions.
  await runOpenssl([
    "req",
    "-new",
    "-key", keyPath,
    "-out", csrPath,
    "-config", cnfPath,
  ]);

  const [privateKeyPem, csrPem] = await Promise.all([
    readFile(keyPath, "utf8"),
    readFile(csrPath, "utf8"),
  ]);

  // 3. Clean up the temp dir — the PEMs are now in memory.
  await rm(tmp, { recursive: true, force: true }).catch(() => {});

  return {
    privateKeyPem,
    csrPem,
    csrBase64: Buffer.from(csrPem, "utf8").toString("base64"),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

function buildOpensslConfig(input: CsrInput): string {
  // The custom-attributes block + SAN extension below are exactly the
  // shape ZATCA requires. Changing the order or any OID will silently
  // produce a CSR ZATCA accepts but issues a CSID for the wrong
  // taxpayer profile — there's no error feedback at submission time,
  // so verify against the spec before tweaking.
  return `
[ req ]
default_bits        = 2048
default_md          = sha256
prompt              = no
distinguished_name  = dn
req_extensions      = v3_req

[ dn ]
CN = ${escapeCnf(input.commonName)}
O  = ${escapeCnf(input.organizationName)}
OU = ${escapeCnf(input.organizationalUnit)}
C  = SA

[ v3_req ]
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, nonRepudiation, keyEncipherment
subjectAltName   = @san

[ san ]
DirName.1 = san_directory

[ san_directory ]
SN  = ${escapeCnf(input.vatRegistrationNumber)}
UID = ${escapeCnf(input.vatRegistrationNumber)}
title = ${input.invoiceType}
registeredAddress = ${escapeCnf(input.location)}
businessCategory  = ${escapeCnf(input.industry)}
`;
}

function escapeCnf(value: string): string {
  // OpenSSL config doesn't support quoting; strip newlines and
  // collapse internal whitespace so a malformed input can't smuggle
  // extra config lines.
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function runOpenssl(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("openssl", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`openssl ${args[0]} exited with code ${code}: ${stderr.trim()}`));
      }
    });
  });
}
