import { describe, it, expect } from "vitest";
import {
  canBePaid,
  validateStatusPair,
  derivePaymentStatus,
  mapJournalStatus,
  DOCUMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  POSTING_STATUS_LABELS,
  type DocumentStatus,
} from "../../../ghayth-erp/src/lib/finance/status-model.ts";

// #1945 acceptance — the three finance status axes must never mix.
// These encode the owner's exact rules: a draft is never paid, an approved
// expense may be unpaid, and "paid" must correspond to a real money-out effect.

const ALL_DOCS: DocumentStatus[] = ["draft", "submitted", "approved", "rejected", "cancelled"];

describe("finance status model — separation of axes", () => {
  it("labels every value on all three axes", () => {
    expect(Object.keys(DOCUMENT_STATUS_LABELS).length).toBe(5);
    expect(Object.keys(PAYMENT_STATUS_LABELS).length).toBe(3);
    expect(Object.keys(POSTING_STATUS_LABELS).length).toBe(3);
  });

  it("a draft can NEVER be paid", () => {
    expect(canBePaid("draft")).toBe(false);
    expect(validateStatusPair("draft", "paid")).toBeTruthy();
    expect(validateStatusPair("draft", "partially_paid")).toBeTruthy();
    // unpaid draft is the only consistent draft state
    expect(validateStatusPair("draft", "unpaid")).toBeNull();
  });

  it("a submitted (pending-approval) document cannot be paid", () => {
    expect(canBePaid("submitted")).toBe(false);
    expect(validateStatusPair("submitted", "paid")).toBeTruthy();
  });

  it("an APPROVED document may be unpaid OR paid (both valid)", () => {
    expect(canBePaid("approved")).toBe(true);
    expect(validateStatusPair("approved", "unpaid")).toBeNull();
    expect(validateStatusPair("approved", "paid")).toBeNull();
    expect(validateStatusPair("approved", "partially_paid")).toBeNull();
  });

  it("rejected / cancelled documents cannot be paid", () => {
    expect(canBePaid("rejected")).toBe(false);
    expect(canBePaid("cancelled")).toBe(false);
    expect(validateStatusPair("rejected", "paid")).toBeTruthy();
    expect(validateStatusPair("cancelled", "paid")).toBeTruthy();
  });

  it("only `approved` is payable across the whole document lifecycle", () => {
    expect(ALL_DOCS.filter(canBePaid)).toEqual(["approved"]);
  });
});

describe("finance status model — paid requires a real effect", () => {
  it("is unpaid when there is no money source (no money-out effect)", () => {
    expect(derivePaymentStatus({ doc: "approved", hasMoneySource: false })).toBe("unpaid");
  });

  it("is paid only when approved AND a money source is credited", () => {
    expect(derivePaymentStatus({ doc: "approved", hasMoneySource: true })).toBe("paid");
  });

  it("never marks an unapproved document paid even with a money source", () => {
    expect(derivePaymentStatus({ doc: "draft", hasMoneySource: true })).toBe("unpaid");
    expect(derivePaymentStatus({ doc: "submitted", hasMoneySource: true })).toBe("unpaid");
  });

  it("reports partial payment when only part of the amount is disbursed", () => {
    expect(
      derivePaymentStatus({ doc: "approved", hasMoneySource: true, paidAmount: 40, totalAmount: 100 }),
    ).toBe("partially_paid");
    expect(
      derivePaymentStatus({ doc: "approved", hasMoneySource: true, paidAmount: 100, totalAmount: 100 }),
    ).toBe("paid");
  });
});

describe("finance status model — backend status → display axes", () => {
  it("maps posted/approved to approved + posted", () => {
    expect(mapJournalStatus("posted")).toEqual({ documentStatus: "approved", postingStatus: "posted" });
    expect(mapJournalStatus("approved")).toEqual({ documentStatus: "approved", postingStatus: "posted" });
  });

  it("maps pending_approval to submitted + unposted", () => {
    expect(mapJournalStatus("pending_approval")).toEqual({ documentStatus: "submitted", postingStatus: "unposted" });
  });

  it("maps draft / unknown to draft + unposted", () => {
    expect(mapJournalStatus("draft")).toEqual({ documentStatus: "draft", postingStatus: "unposted" });
    expect(mapJournalStatus(null)).toEqual({ documentStatus: "draft", postingStatus: "unposted" });
    expect(mapJournalStatus("something_new")).toEqual({ documentStatus: "draft", postingStatus: "unposted" });
  });

  it("maps cancelled to cancelled + reversed", () => {
    expect(mapJournalStatus("cancelled")).toEqual({ documentStatus: "cancelled", postingStatus: "reversed" });
  });
});
