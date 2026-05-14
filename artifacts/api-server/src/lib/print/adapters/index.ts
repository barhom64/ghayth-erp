import type { FormatAdapter, PrintFormat } from "../types.js";
import { a4Adapter } from "./a4Adapter.js";
import { thermalAdapter, thermal58Adapter } from "./thermalAdapter.js";
import { labelAdapter } from "./labelAdapter.js";
import { excelAdapter } from "./excelAdapter.js";

const adapters: Record<PrintFormat, FormatAdapter> = {
  a4: a4Adapter,
  thermal_80: thermalAdapter,
  thermal_58: thermal58Adapter,
  label: labelAdapter,
  excel: excelAdapter,
};

export function getAdapter(format: PrintFormat): FormatAdapter {
  return adapters[format] ?? a4Adapter;
}
