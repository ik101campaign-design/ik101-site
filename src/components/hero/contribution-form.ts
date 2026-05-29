import { validateSubmission, type SubmissionInput } from '../../lib/validation';

export function buildSubmission(raw: { message: string; displayName?: string; countryCode: string }): SubmissionInput {
  return {
    message: (raw.message ?? '').trim(),
    displayName: raw.displayName?.trim() ? raw.displayName.trim() : null,
    countryCode: raw.countryCode,
  };
}

export interface SubmitResult { ok: boolean; errors: string[]; status?: number; }

export async function submitMessage(
  raw: { message: string; displayName?: string; countryCode: string },
  isValidCountry: (c: string) => boolean,
  fetcher: typeof fetch,
  endpoint: string,
): Promise<SubmitResult> {
  const input = buildSubmission(raw);
  const v = validateSubmission(input, isValidCountry);
  if (!v.ok) return { ok: false, errors: v.errors };
  const resp = await fetcher(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return { ok: resp.ok, errors: resp.ok ? [] : ['submit_failed'], status: resp.status };
}
