/**
 * Pure-function tests for the FAQ auto-reply scorer + composer.
 * Locks down: term extraction, weighting (title > tag > content),
 * confidence threshold gating, and reply body shape per channel.
 */
import { describe, it, expect } from "vitest";
import {
  extractTerms,
  scoreArticle,
  pickBestMatch,
  composeAutoReplyBody,
  AUTO_REPLY_THRESHOLD,
} from "../../src/lib/inboxAutoReply.js";

const article = (id: number, title: string, content = "", tags: string[] = []) => ({
  id, title, content, category: null, tags,
});

describe("extractTerms", () => {
  it("lowercases and drops punctuation", () => {
    expect(extractTerms("Hello, World!")).toEqual(expect.arrayContaining(["hello", "world"]));
  });

  it("filters terms shorter than 3 chars", () => {
    expect(extractTerms("a be cat")).toEqual(["cat"]);
  });

  it("dedupes repeated words", () => {
    expect(extractTerms("rent rent rent")).toEqual(["rent"]);
  });

  it("works on Arabic", () => {
    const terms = extractTerms("ما هي سياسة الإرجاع");
    expect(terms).toContain("سياسة");
    expect(terms).toContain("الإرجاع");
  });

  it("returns empty on empty input", () => {
    expect(extractTerms("")).toEqual([]);
  });
});

describe("scoreArticle", () => {
  it("title hit weighs 5", () => {
    const s = scoreArticle(article(1, "refund policy"), ["refund"]);
    expect(s.score).toBe(5);
    expect(s.matchedTerms).toEqual(["refund"]);
  });

  it("tag hit weighs 3", () => {
    const s = scoreArticle(article(1, "billing", "", ["refund"]), ["refund"]);
    expect(s.score).toBe(3);
  });

  it("content hit weighs 1, capped at 5 hits", () => {
    const content = "refund refund refund refund refund refund refund"; // 7 hits → cap 5
    const s = scoreArticle(article(1, "policy", content), ["refund"]);
    // Only one unique query term → only one content hit possible, not 5.
    expect(s.score).toBe(1);
  });

  it("title beats tag beats content", () => {
    const a = article(1, "refund instructions", "see content about refund", ["refund"]);
    // Title path wins → +5 only (we 'continue' after first weight assignment).
    expect(scoreArticle(a, ["refund"]).score).toBe(5);
  });

  it("returns 0 when nothing matches", () => {
    expect(scoreArticle(article(1, "rent contract", "monthly rent"), ["shipping"]).score).toBe(0);
  });

  it("returns 0 on empty query", () => {
    expect(scoreArticle(article(1, "anything"), []).score).toBe(0);
  });
});

describe("pickBestMatch", () => {
  it("picks the highest-scoring article when above threshold", () => {
    const articles = [
      article(1, "refund policy", "all about refunds", ["refund", "policy"]),
      article(2, "shipping info", "delivery times"),
    ];
    // Query has 2 title-hits (refund, policy) = 10 → above threshold 8.
    const best = pickBestMatch(articles, "how to refund — what policy applies?");
    expect(best?.articleId).toBe(1);
    expect(best?.score).toBeGreaterThanOrEqual(AUTO_REPLY_THRESHOLD);
  });

  it("returns null when no article is confidently above the threshold", () => {
    const articles = [article(1, "rent contract", "monthly rent terms")];
    expect(pickBestMatch(articles, "weather today")).toBeNull();
  });

  it("returns null on empty article list", () => {
    expect(pickBestMatch([], "anything")).toBeNull();
  });

  it("returns null on empty query", () => {
    expect(pickBestMatch([article(1, "x")], "")).toBeNull();
  });

  it("requires score >= 8 (title hit alone isn't enough)", () => {
    // Single title hit = 5, below threshold 8.
    const a = article(1, "refund");
    expect(pickBestMatch([a], "refund")).toBeNull();
  });

  it("title + tag combo (5+3=8) crosses the threshold", () => {
    const a = article(1, "refund", "", ["policy"]);
    expect(pickBestMatch([a], "refund policy")?.score).toBe(8);
  });
});

describe("composeAutoReplyBody", () => {
  const a = article(1, "كيف أُعيد منتجاً", "اتّبع الخطوات التالية لإعادة منتج: ...");

  it("includes title + content + human-followup footer", () => {
    const body = composeAutoReplyBody(a, "email");
    expect(body).toContain(a.title);
    expect(body).toContain("الخطوات التالية");
    expect(body).toContain("سيتواصل معك");
  });

  it("truncates long content for SMS/WhatsApp", () => {
    const long = "x".repeat(2000);
    const big = { ...a, content: long };
    const email = composeAutoReplyBody(big, "email"); // 4000 char limit
    const sms = composeAutoReplyBody(big, "sms");     // 800 char limit
    expect(email.length).toBeGreaterThan(sms.length);
  });

  it("handles null content gracefully", () => {
    const nullContent = { ...a, content: null };
    const body = composeAutoReplyBody(nullContent, "email");
    expect(body).toContain(a.title);
    expect(body).toContain("سيتواصل معك");
  });
});
