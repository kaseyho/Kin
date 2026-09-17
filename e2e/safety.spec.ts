import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('submits a private message report and exposes demo-safe Space controls', async ({ page }, testInfo) => {
  await page.goto('/?demo=story');
  await page.getByText('Jamie', { exact: true }).first().click();
  await page.getByRole('button', {
    name: 'Message from Jamie: I was trying to impress you. Actions available',
  }).click({ button: 'right' });
  await page.getByRole('button', { name: 'Report this message' }).click();

  await expect(page.getByRole('dialog', { name: 'Report this message' })).toBeVisible();
  await expect(page.getByText(/not sent to Kin or a moderator/i)).toBeVisible();
  await expect(page.getByText(/Support contact is not configured for this build/i)).toBeVisible();
  await page.getByRole('radio', { name: 'Harassment or bullying' }).click();
  await page.getByLabel('Optional report details').fill('Repeated unwanted contact.');
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('message-report-phone.png') });
  await page.getByRole('button', { name: 'Save demo report' }).click();

  await expect(page.getByRole('heading', { name: 'Demo report saved' })).toBeVisible();
  await expect(page.getByText(/Reference report-/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Relationship with Jamie' }).click();
  await expect(page.getByRole('button', { name: 'Report this Kin Space' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete local copy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Leave this Kin Space' })).toBeHidden();
  await page.getByRole('button', { name: 'Delete local copy' }).click();
  await expect(page.getByRole('heading', { name: 'Delete this local copy?' })).toBeVisible();
  await expect(page.getByText(/demo data on this device only/i).last()).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('demo-delete-confirmation-phone.png') });
  await page.getByRole('button', { name: 'Cancel destructive action' }).click();
});

test('returns focus to the originating message after closing a report', async ({ page }) => {
  await page.goto('/?demo=story');
  await page.getByText('Jamie', { exact: true }).first().click();
  const message = page.getByRole('button', {
    name: 'Message from Jamie: I was trying to impress you. Actions available',
  });

  await message.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Report this message' }).click();
  await page.getByRole('button', { exact: true, name: 'Cancel' }).click();

  await expect(message).toBeFocused();
});
