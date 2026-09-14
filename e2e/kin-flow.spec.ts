import { expect, test } from '@playwright/test';

test.use({ viewport: { height: 844, width: 390 } });

test('preserves a message as a Moment and rediscovers it', async ({ page }, testInfo) => {
  await page.goto('/?demo=story&demoDate=2026-12-05');
  await page.getByText('Jamie', { exact: true }).first().click();

  await page
    .getByText('December 5 was honestly the best first date.', { exact: true })
    .click({ button: 'right' });
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('remember-sheet-phone.png'),
  });
  await page.getByRole('button', { name: 'Remember this' }).click();
  await page.getByRole('button', { name: 'Remember as Moment' }).click();
  await page.getByLabel('Title').fill('Our first date');
  await page.getByRole('button', { name: 'Keep this Moment' }).click();

  await expect(page.getByText('Saved to your timeline')).toBeVisible();
  await page.getByRole('button', { name: 'Back to conversation' }).click();
  await page.getByRole('button', { name: 'Relationship with Jamie' }).click();
  await expect(
    page.getByTestId('relationship-recent-moments').getByText('Our first date'),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('core-moment-phone.png'),
  });
  await page.getByRole('button', { name: 'Open full timeline' }).click();
  await expect(page.getByRole('heading', { name: 'Our timeline' })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('timeline-phone.png'),
  });
});

test('opens message actions from the keyboard and returns focus on close', async ({ page }) => {
  await page.goto('/?demo=story');
  await page.getByText('Jamie', { exact: true }).first().click();
  const message = page.getByRole('button', {
    name: 'Message from Jamie: I was trying to impress you. Actions available',
  });

  await message.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Message actions' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Remember this' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'React with heart' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(message).toBeFocused();
});
