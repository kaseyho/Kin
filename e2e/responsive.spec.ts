import { expect, test, type Page } from '@playwright/test';

async function openDemoConversation(page: Page) {
  await page.goto('/?demo=story&demoDate=2026-12-05');
  await page.getByText('Jamie', { exact: true }).first().click();
}

test('fits the core conversation at a phone viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await openDemoConversation(page);

  await expect(page.getByTestId('chat-wallpaper')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('conversation-phone.png') });
});

test('shows a bounded conversation beside relationship context on wide screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ height: 820, width: 1180 });
  await openDemoConversation(page);

  await expect(page.getByTestId('chat-wallpaper')).toBeVisible();
  await expect(page.getByTestId('wide-relationship-panel')).toBeVisible();
  const conversation = await page.getByTestId('chat-wallpaper').boundingBox();
  expect(conversation?.width).toBeLessThanOrEqual(700);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('conversation-wide.png') });
});

test('captures onboarding and the relationship-aligned Kin+ offer', async ({ page }, testInfo) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Your chats contain more than messages.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('onboarding-phone.png') });

  await openDemoConversation(page);
  await page.getByRole('button', { name: 'Relationship with Jamie' }).click();
  await page.getByRole('button', { name: 'Open Kin+' }).click();
  await expect(page.getByRole('heading', { name: 'Make each relationship feel more like yours.' })).toBeVisible();
  await page.screenshot({ fullPage: true, path: testInfo.outputPath('kin-plus-phone.png') });
});
