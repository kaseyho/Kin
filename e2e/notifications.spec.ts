import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('explains and dismisses a notification destination that is no longer available', async ({ page }) => {
  await page.goto('/?demo=story');
  await expect(page.getByText('Jamie', { exact: true }).first()).toBeVisible();

  await page.goto('/chats?notice=notification-unavailable');

  await expect(page.getByRole('alert')).toHaveText(
    'That conversation is no longer available. Your Chats are still here.',
  );
  await page.getByRole('button', { name: 'Dismiss notice' }).click();

  await expect(page).toHaveURL(/\/chats$/);
  await expect(page.getByRole('alert')).toBeHidden();
});
