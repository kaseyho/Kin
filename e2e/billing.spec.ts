import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('activates and restores Kin+ in the clearly labelled demo checkout', async ({ page }) => {
  await page.goto('/?demo=story');
  await page.getByText('Jamie', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Relationship with Jamie' }).click();
  await page.getByRole('button', { name: 'Open Kin+' }).click();

  await expect(
    page.getByRole('heading', { name: 'Make each relationship feel more like yours.' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Restore purchases' }).click();
  await expect(page.getByText('No active Kin+ purchase found.')).toBeVisible();

  await page.getByRole('button', { name: 'Try Kin+ in demo' }).click();
  await expect(page.getByRole('heading', { name: 'Kin+ is active' })).toBeVisible();
  await expect(page.getByText(/Demo entitlement/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage subscription' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Restore purchases' }).click();
  await expect(page.getByText('Kin+ restored.')).toBeVisible();

  await page.getByRole('button', { name: 'Close Kin+' }).click();
  await expect(page.getByRole('button', { name: 'Open Kin+' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Kin+' }).click();
  await expect(page.getByRole('heading', { name: 'Kin+ is active' })).toBeVisible();
});
