import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

async function finishOnboarding(page: import('@playwright/test').Page, name = 'Maya') {
  await page.getByRole('button', { name: 'See how Kin remembers' }).click();
  await page.getByRole('button', { name: 'Create my profile' }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('creates and manages a private single-use invitation', async ({ page }, testInfo) => {
  await page.goto('/');
  await finishOnboarding(page);

  await page.getByLabel('Who is this Space with?').fill('Jamie');
  await page.getByRole('button', { name: 'Create our Kin Space' }).click();

  await expect(page.getByRole('heading', { name: 'Jamie is one tap away.' })).toBeVisible();
  await expect(page).toHaveURL(/\/space\/[^/]+\/invitation$/);
  await expect(page.getByText(/https:\/\/demo\.kin\.invalid\/invite\/[A-Z0-9]{6,12}/)).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('invitation-waiting-phone.png') });

  await page.setViewportSize({ height: 820, width: 1180 });
  const invitationCard = await page.getByTestId('invitation-card').boundingBox();
  expect(invitationCard?.width).toBeLessThanOrEqual(640);
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('invitation-waiting-wide.png') });

  await page.getByRole('button', { name: 'Replace invitation code' }).click();
  await expect(page.getByText('New invitation ready. The old code no longer works.')).toBeVisible();

  await page.goto('/chats');
  await page.getByRole('button', { name: 'Open Kin Space with Jamie' }).click();
  await expect(page).toHaveURL(/\/space\/[^/]+\/invitation$/);
  await expect(page.getByRole('heading', { name: 'Jamie is one tap away.' })).toBeVisible();

  await page.getByRole('button', { name: 'Cancel invitation' }).click();
  await expect(page.getByRole('heading', { name: 'Invitation cancelled.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share invitation' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No active invitation.' })).toBeVisible();
});

test('keeps an incoming invitation through onboarding and preserves a failed code', async ({ page }) => {
  await page.goto('/invite/ABCDEF');

  await expect(page.getByRole('heading', { name: 'Your chats contain more than messages.' })).toBeVisible();
  await finishOnboarding(page, 'Alex');

  await expect(page).toHaveURL(/\/invite\/ABCDEF$/);
  await expect(page.getByRole('heading', { name: 'This invitation needs attention.' })).toBeVisible();
  await expect(page.getByText('That invite could not be found. Check the code and try again.')).toBeVisible();
  await expect(page.getByText('ABCDEF')).toBeVisible();
});
