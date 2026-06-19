/**
 * Field-tracking capability token (Capacitor background-geolocation
 * foundation). Verified source-only, no database:
 *
 *  1. signFieldTrackingToken stamps scope:"field_tracking" and a longer
 *     TTL than the 15-minute session token, and round-trips via verifyToken.
 *  2. A plain session token carries no scope claim.
 *
 * auth.js reads JWT_SECRET at module load (and process.exit(1)s without
 * one), so we set a test secret BEFORE a dynamic import — matching the
 * repo's other auth-dependent tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import jwt from "jsonwebtoken";

let signFieldTrackingToken: typeof import("../../src/lib/auth.js")["signFieldTrackingToken"];
let signToken: typeof import("../../src/lib/auth.js")["signToken"];
let verifyToken: typeof import("../../src/lib/auth.js")["verifyToken"];

beforeAll(async () => {
  process.env.JWT_SECRET ||= "test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa";
  const auth = await import("../../src/lib/auth.js");
  signFieldTrackingToken = auth.signFieldTrackingToken;
  signToken = auth.signToken;
  verifyToken = auth.verifyToken;
});

describe("signFieldTrackingToken — scoped, long-lived credential", () => {
  it("stamps scope:'field_tracking' and round-trips", () => {
    const decoded = verifyToken(signFieldTrackingToken({ userId: 7, assignmentId: 42, role: "driver" }, 12));
    expect(decoded.scope).toBe("field_tracking");
    expect(decoded.userId).toBe(7);
    expect(decoded.assignmentId).toBe(42);
  });

  it("a plain session token carries NO scope claim", () => {
    expect(verifyToken(signToken({ userId: 7, assignmentId: 42, role: "driver" })).scope).toBeUndefined();
  });

  it("lives longer than the 15-minute session token (12h default)", () => {
    const field = jwt.decode(signFieldTrackingToken({ userId: 1, assignmentId: 1, role: "driver" }, 12)) as any;
    const session = jwt.decode(signToken({ userId: 1, assignmentId: 1, role: "driver" })) as any;
    expect(field.exp - field.iat).toBeGreaterThan(session.exp - session.iat);
    expect(field.exp - field.iat).toBe(12 * 3600);
  });

  it("honours a custom TTL in hours", () => {
    const t = jwt.decode(signFieldTrackingToken({ userId: 1, assignmentId: 1, role: "driver" }, 6)) as any;
    expect(t.exp - t.iat).toBe(6 * 3600);
  });
});
