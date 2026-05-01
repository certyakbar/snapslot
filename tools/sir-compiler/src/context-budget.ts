import { countTokens } from "gpt-tokenizer";
import type { BlockEnvelope, PartialContext, TransportEnvelope, ValidationResult } from "./types.js";

export interface ContextBudgetResult extends ValidationResult {
  measured_tokens: number;
  partial_context?: PartialContext;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArrayFrom(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function partialContextFromPayload(parsedPayload: unknown): PartialContext {
  const context = isObject(parsedPayload) && isObject(parsedPayload.context) ? parsedPayload.context : {};
  const files = stringArrayFrom(context.files);
  const included_files = files.slice(0, 2);
  const omitted_files = files.slice(2);

  return {
    reason: "context budget exceeded",
    included_files,
    omitted_files,
    excerpt_windows: included_files.map((path) => ({
      path,
      start_line: 1,
      end_line: 80
    }))
  };
}

export function checkContextBudget(
  envelope: TransportEnvelope,
  parsedPayload: unknown
): ContextBudgetResult {
  const maxTokens = envelope.context_budget?.max_tokens;
  const measured_tokens = countTokens(envelope.payload);

  if (maxTokens === undefined || measured_tokens <= maxTokens) {
    return {
      valid: true,
      errors: [],
      measured_tokens
    };
  }

  return {
    valid: false,
    errors: [
      `context budget exceeded: measured ${measured_tokens} tokens with gpt-tokenizer; limit ${maxTokens}`
    ],
    measured_tokens,
    partial_context: partialContextFromPayload(parsedPayload)
  };
}

export function attachContextEscalation(block: BlockEnvelope, partial_context: PartialContext): BlockEnvelope {
  return {
    ...block,
    escalation: {
      subtype: "ESCALATE_TO_GOVERNOR_WITH_PARTIAL_CONTEXT",
      partial_context
    }
  };
}
