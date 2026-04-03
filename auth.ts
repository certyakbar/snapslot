import { scryptSync, timingSafeEqual } from "crypto";

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const providedHash = Buffer.from(hashPassword(password, salt), "hex");
  const storedHash = Buffer.from(expectedHash, "hex");

  if (providedHash.length !== storedHash.length) {
    return false;
  }

  return timingSafeEqual(providedHash, storedHash);
}
