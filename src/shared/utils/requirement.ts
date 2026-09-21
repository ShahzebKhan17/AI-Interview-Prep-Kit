/**
 * Requirement ID utility functions.
 * Ensures consistent and deterministic application-level requirement IDs (e.g. REQ-001, REQ-002).
 */

/**
 * Formats a 1-based numeric index into a standardized requirement ID.
 * Example: 1 -> "REQ-001", 12 -> "REQ-012"
 */
export function formatRequirementId(index: number): string {
  if (index < 1) {
    throw new Error("Requirement index must be greater than or equal to 1");
  }
  return `REQ-${String(index).padStart(3, "0")}`;
}

/**
 * Checks whether a given string is a valid requirement ID (format REQ-###).
 */
export function isValidRequirementId(id: string): boolean {
  if (!id || typeof id !== "string") return false;
  return /^REQ-\d{3,}$/i.test(id.trim());
}

/**
 * Normalizes a requirement ID to uppercase standard format.
 * Example: "req-001" -> "REQ-001"
 */
export function normalizeRequirementId(id: string): string {
  return id.trim().toUpperCase();
}
