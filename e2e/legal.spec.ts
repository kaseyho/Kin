import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('renders legal, support, and account-deletion pages in the demo build', async ({ page }) => {
  for (const [path, title] of [
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Use'],
    ['/community-standards', 'Community Standards'],
    ['/support', 'Kin Support'],
    ['/account-deletion', 'Delete Your Kin Account'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close document' })).toBeVisible();
  }
});

test('publishes concrete privacy and deletion disclosures', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText(/Supabase for authentication/i)).toBeVisible();
  await expect(page.getByText(/RevenueCat to manage purchases/i)).toBeVisible();
  await expect(page.getByText(/kept for up to 180 days/i)).toBeVisible();
  await expect(page.getByText(/does not sell your personal information/i)).toBeVisible();

  await page.goto('/account-deletion');
  await expect(page.getByRole('heading', { name: 'Delete account in Kin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Request deletion without the app' })).toBeVisible();
  await expect(page.getByText(/Account deletion does not automatically cancel a subscription/i)).toBeVisible();
  await page.getByRole('link', { name: 'Read the Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
