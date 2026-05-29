export const MAX_MESSAGE = 150;
export const MAX_NAME = 60;

export interface SubmissionInput {
  message: string;
  displayName?: string | null;
  countryCode: string;
}
export interface ValidationResult { ok: boolean; errors: string[]; }

export function validateSubmission(
  input: SubmissionInput,
  isValidCountry: (code: string) => boolean,
): ValidationResult {
  const errors: string[] = [];
  const msg = (input.message ?? '').trim();
  if (!msg) errors.push('message_required');
  if (msg.length > MAX_MESSAGE) errors.push('message_too_long');
  if (!input.countryCode) errors.push('country_required');
  else if (!isValidCountry(input.countryCode)) errors.push('country_invalid');
  if (input.displayName && input.displayName.length > MAX_NAME) errors.push('name_too_long');
  return { ok: errors.length === 0, errors };
}
