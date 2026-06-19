import { test, expect } from '@playwright/test';

// the guide's network call is mocked so these assert the client behavior deterministically.
// the model's target-selection accuracy is validated separately, live.

test.describe('guide assistant', () => {
  test('answers and draws the red box on the named element', async ({ page }) => {
    await page.route('**/api/chat', (route) =>
      route.fulfill({ json: { say: 'Use the upload box on this page.', highlight: 'upload', tokens: 0 } }),
    );
    await page.goto('/');
    await expect(page.getByRole('dialog', { name: 'guide assistant' })).toBeVisible();
    await page.locator('.guide-input input').fill('where do I upload?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Use the upload box on this page.')).toBeVisible();
    await expect(page.locator('[data-guide="upload"]')).toHaveClass(/guide-highlight/);
  });

  test('minimizes and reopens with the conversation kept', async ({ page }) => {
    await page.route('**/api/chat', (route) =>
      route.fulfill({ json: { say: 'Here is how it works.', highlight: null, tokens: 0 } }),
    );
    await page.goto('/');
    await page.locator('.guide-input input').fill('how do I check a label?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText('Here is how it works.')).toBeVisible();

    await page.locator('.guide-launch').click(); // minimize
    await expect(page.getByRole('dialog', { name: 'guide assistant' })).toBeHidden();
    await expect(page.locator('.guide-launch')).toHaveText('Need help?');

    await page.locator('.guide-launch').click(); // reopen
    await expect(page.getByText('Here is how it works.')).toBeVisible();
  });
});

test('feedback modal opens a prefilled github issue', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__opened = [];
    window.open = ((url?: any) => {
      (window as any).__opened.push(String(url));
      return null;
    }) as any;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Report issue' }).click();
  await expect(page.getByRole('dialog', { name: 'report issue or feedback' })).toBeVisible();
  await page.getByRole('button', { name: 'Issue', exact: true }).click();
  await page.getByLabel('Title').fill('a button does nothing');
  await page.getByRole('button', { name: 'Open GitHub issue' }).click();
  const opened: string[] = await page.evaluate(() => (window as any).__opened);
  expect(opened[0]).toContain('github.com');
  expect(opened[0]).toContain('labels=bug');
});
