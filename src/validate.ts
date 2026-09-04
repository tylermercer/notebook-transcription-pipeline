/**
 * Structural format validation for notebook entries.
 *
 * NOTE: Format validation here is intentionally shallow and separate from the real
 * parser (`parse.ts`). These regexes check structural basics only (date header presence,
 * well-formed checkbox lines) and serve as a lightweight placeholder/tunable safeguard
 * before committing to GitHub. They must NOT attempt to reimplement `parse.ts`'s full
 * parsing logic to prevent silent drift over time. The GitHub Actions dry-run comment
 * remains the authoritative check before merging.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Date header pattern: ## YYYY-MM-DD
const DATE_HEADER_REGEX = /^##\s+\d{4}-\d{2}-\d{2}/m;

// Checkbox line pattern: ☐ or ☑ followed by tag(s) (e.g., ☐ PW, ☐ R)
const CHECKBOX_LINE_REGEX = /^[☐☑]\s+[A-Za-z0-9]+/m;

export function validateNotebookContent(content: string): ValidationResult {
  const errors: string[] = [];

  if (!content || !content.trim()) {
    errors.push("Content is empty.");
    return { valid: false, errors };
  }

  // Check 1: Date header presence
  if (!DATE_HEADER_REGEX.test(content)) {
    errors.push("Missing required date header (e.g., '## YYYY-MM-DD').");
  }

  // Check 2: Well-formed checkbox line presence
  if (!CHECKBOX_LINE_REGEX.test(content)) {
    errors.push("Missing required checkbox line (e.g., '☐ TAG').");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
