import { test, expect } from '@playwright/test';

const EMAIL = process.env.MOD_EMAIL;
const PASSWORD = process.env.MOD_PASSWORD;

test('admin can log in and see the moderation queue', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'Set MOD_EMAIL and MOD_PASSWORD to run the moderation E2E.');
  await page.goto('/moderate');
  await page.locator('[data-login-email]').fill(EMAIL!);
  await page.locator('[data-login-password]').fill(PASSWORD!);
  await page.locator('[data-login-password-btn]').click();
  await expect(page.locator('[data-queue]')).toBeVisible();
});
