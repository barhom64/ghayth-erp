/**
 * Inbox auto-reply — pure helpers for matching an inbound message to a
 * knowledge-base article and shaping the reply.
 *
 * Used by the inbox.message.received event listener after the classifier
 * runs: if the message looks like a question (request / inquiry) and a
 * high-confidence KB match exists, the listener sends an auto-reply
 * with the article content + a "human will follow up" footer so the
 * customer gets an immediate answer.
 *
 * Match is keyword + tag based. Scoring formula:
 *   - title term hit: +5 each
 *   - tag exact match: +3 each
 *   - content term hit: +1 each (capped at 5 hits)
 * Threshold for confident match: score >= 8 (≈ one title hit + one tag).
 */

export interface KbArticle {
  id: number;
  title: string;
  content: string | null;
  category: string | null;
  tags: string[] | null;
}

export interface MatchScore {
  articleId: number;
  score: number;
  matchedTerms: string[];
}

const MIN_TERM_LENGTH = 3;
const CONTENT_HIT_CAP = 5;
const CONFIDENT_SCORE = 8;

/**
 * Pull useful search terms from a message: title-cased words 3+ chars,
 * stripping punctuation. Arabic + ASCII. Returns lowercased, deduped.
 */
export function extractTerms(text: string): string[] {
  if (!text) return [];
  const cleaned = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const set = new Set<string>();
  for (const word of cleaned.split(/\s+/)) {
    if (word.length >= MIN_TERM_LENGTH) set.add(word);
  }
  return [...set];
}

/**
 * Score one article against a set of query terms. Pure: no DB hits.
 */
export function scoreArticle(article: KbArticle, queryTerms: string[]): MatchScore {
  if (queryTerms.length === 0) {
    return { articleId: article.id, score: 0, matchedTerms: [] };
  }
  const titleTerms = new Set(extractTerms(article.title));
  const contentTerms = new Set(extractTerms(article.content ?? ""));
  const tagSet = new Set((article.tags ?? []).map((t) => t.toLowerCase()));

  let score = 0;
  let contentHits = 0;
  const matched: string[] = [];

  for (const term of queryTerms) {
    if (titleTerms.has(term)) {
      score += 5;
      matched.push(term);
      continue;
    }
    if (tagSet.has(term)) {
      score += 3;
      matched.push(term);
      continue;
    }
    if (contentTerms.has(term) && contentHits < CONTENT_HIT_CAP) {
      score += 1;
      contentHits++;
      matched.push(term);
    }
  }

  return { articleId: article.id, score, matchedTerms: matched };
}

/**
 * Pick the best matching article (highest score) from a candidate set.
 * Returns null when no article is confidently above the threshold —
 * the caller should NOT auto-reply on a weak match (silent confusion
 * is worse than no reply).
 */
export function pickBestMatch(articles: KbArticle[], query: string): MatchScore | null {
  const terms = extractTerms(query);
  if (terms.length === 0 || articles.length === 0) return null;
  let best: MatchScore | null = null;
  for (const a of articles) {
    const s = scoreArticle(a, terms);
    if (!best || s.score > best.score) best = s;
  }
  if (!best || best.score < CONFIDENT_SCORE) return null;
  return best;
}

/**
 * Build the reply body for a matched article. Trims article content
 * at a soft limit so SMS/WhatsApp don't reject. Always appends a
 * "human will follow up" note so the customer knows this isn't the
 * final word.
 */
export function composeAutoReplyBody(
  article: KbArticle,
  channel: "email" | "sms" | "whatsapp",
): string {
  const limit = channel === "email" ? 4000 : 800;
  const content = (article.content ?? "").slice(0, limit);
  const footer = "\n\n— رد آلي. سيتواصل معك أحد ممثلي خدمة العملاء قريباً للتأكيد.";
  return `${article.title}\n\n${content}${footer}`;
}

export const AUTO_REPLY_THRESHOLD = CONFIDENT_SCORE;
