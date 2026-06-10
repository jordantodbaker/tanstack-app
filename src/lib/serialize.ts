/**
 * Serialize a nullable `Date` to an ISO 8601 string (or null) for client
 * transport. Every entity's row→DTO mapper needs the same null-safe conversion,
 * so it lives here instead of being copy-pasted per module.
 */
export const serializeDate = (d: Date | null): string | null =>
  d === null ? null : d.toISOString();
