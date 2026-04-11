import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const _jwtSecret = process.env.JWT_SECRET;
if (!_jwtSecret) {
  console.error("FATAL: JWT_SECRET environment variable must be set. Exiting.");
  process.exit(1);
}
if (_jwtSecret.length < 32) {
  console.error(`FATAL: JWT_SECRET must be at least 32 characters (got ${_jwtSecret.length}). Exiting.`);
  process.exit(1);
}
const SECRET = _jwtSecret;

export interface JWTPayload {
  userId: number;
  assignmentId: number;
  role: string;
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET!, { expiresIn: "15m" });
}

export function signRefreshToken(): string {
  return randomBytes(64).toString("hex");
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, SECRET!) as unknown as JWTPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
