// wps/delivery.ts — WPS bank direct-delivery channel configuration.
// Each bank that supports SFTP/HTTPS file upload has an entry here.

import type { WpsFormat } from "../types.js";

export type DeliveryStage = "config" | "locked" | "upload" | "poll";
export type DeliveryChannel = "sftp" | "https" | "none";

export class WpsDeliveryError extends Error {
  constructor(
    message: string,
    public readonly stage: DeliveryStage,
  ) {
    super(message);
    this.name = "WpsDeliveryError";
  }
}

export interface BankDeliveryConfig {
  channel: DeliveryChannel;
  /** Credential field names required for this channel */
  requiredFields: string[];
}

// Banks that support direct SFTP delivery. Others use "none" (manual upload).
export const BANK_DELIVERY_CONFIG: Partial<Record<WpsFormat, BankDeliveryConfig>> = {
  ncb: { channel: "sftp", requiredFields: ["host", "port", "username", "password", "remotePath"] },
  alrajhi: { channel: "sftp", requiredFields: ["host", "port", "username", "password", "remotePath"] },
  riyad: { channel: "https", requiredFields: ["apiKey", "clientId"] },
  albilad: { channel: "sftp", requiredFields: ["host", "port", "username", "password", "remotePath"] },
};

export function getDeliveryChannel(format: WpsFormat): DeliveryChannel {
  return BANK_DELIVERY_CONFIG[format]?.channel ?? "none";
}
