/**
 * /communications/letters/create — DEPRECATED.
 *
 * Phase 5 of the communications unification (see
 * docs/architecture/communications-unification.md). Two correspondence
 * creation paths existed:
 *   - /communications/letters/create   (this file)
 *   - /correspondence/create           (the keeper)
 *
 * Both POST to /correspondence. This page now redirects to the canonical
 * one, preserving any query string (deep links from discipline-memo,
 * tenant, and project pages pass relatedType/relatedId/subject).
 *
 * The route is kept so existing inbound URLs don't 404. Once we have
 * confidence no external bookmarks survive (after one release cycle),
 * the route can be dropped from commsRoutes.tsx.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function LettersCreate() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    const query = typeof window !== "undefined" ? window.location.search : "";
    setLocation(`/correspondence/create${query}`);
  }, [setLocation]);
  return null;
}
