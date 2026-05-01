import type { ValidationResult } from "./types.js";

const secretLikePatterns = [
  /\b(?:api[_-]?key|secret|token|password|credential|private[_-]?key)\b\s*[:=]/iu,
  /\bsk_(?:test|live)_[A-Za-z0-9_=-]{8,}/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u
];

export function runNoSecretPreflight(payload: string): ValidationResult {
  const hasSecretLikeMaterial = secretLikePatterns.some((pattern) => pattern.test(payload));

  if (!hasSecretLikeMaterial) {
    return {
      valid: true,
      errors: []
    };
  }

  return {
    valid: false,
    errors: ["secret-like material detected in transport payload; value redacted"]
  };
}
