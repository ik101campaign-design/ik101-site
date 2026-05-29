// NOTE: This spec performs a REAL insert into the connected Supabase project
// (a `pending` row in the `messages` table). Point it at a disposable/test
// Supabase project, or clean up the inserted row afterward. Never run it
// against the production project without filtering the row out of the queue.

import { test, expect } from '@playwright/test';

test('submitting a message shows the pending notice and persists the optimistic dot', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-globe-cta]').click();
  await page.locator('[data-field-message]').fill('E2E test voice');
  await page.locator('[data-field-country]').selectOption('PK');
  await page.locator('[data-submit]').click();
  await expect(page.locator('[role="status"]')).toContainText('approved');
  const cached = await page.evaluate(() => localStorage.getItem('ik101.voices.optimistic.v1'));
  expect(cached).toContain('E2E test voice');
});
