import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('keeps legal and deletion routes public in a signed-out connected build', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Kin' })).toBeVisible();

  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible();

  await page.goto('/account-deletion');
  await expect(page.getByRole('heading', { name: 'Delete Your Kin Account', exact: true })).toBeVisible();
});
