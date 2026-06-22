import { test, expect, type Page } from '@playwright/test';

// core user flows. /api/verify and /api/examples are mocked so the frontend wiring is asserted
// deterministically without the model or network. (model accuracy is covered by scripts/eval.ts.)

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const EXAMPLE = {
  id: 'TEST-1',
  title: 'test label',
  blurb: 'a test label',
  category: 'compliant',
  application: {
    beverage_type: 'distilled_spirits',
    brand_name: 'RIVER STONE',
    class_type: 'Kentucky Straight Bourbon Whiskey',
    alcohol_content: '45% Alc./Vol. (90 Proof)',
    net_contents: '750 mL',
    producer_name: 'River Stone Distilling Co.',
    producer_address: 'Louisville, KY',
    country_of_origin: 'United States',
  },
  image: TINY_PNG,
  mime: 'image/png',
};

function verifyResponse(decision: 'approve' | 'reject' | 'needs_review') {
  const checks =
    decision === 'reject'
      ? [{ field: 'alcohol_content', status: 'fail', severity: 'error', message: 'application says 45% but label says 40%' }]
      : [{ field: 'brand_name', status: 'pass', severity: 'ok', message: '' }];
  return { decision, checks, quality: { ok: true, reasons: [] }, latencyMs: 1200, confidence: 0.96, tokens: 120 };
}

// the guide is on by default; close it so it can't overlap the form controls
async function closeGuide(page: Page) {
  const launch = page.locator('.guide-launch');
  if ((await launch.textContent())?.includes('Close')) await launch.click();
}

test('home renders the workspace, wheel actions, and nav', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Label check', level: 1 })).toBeVisible();
  await expect(
    page.getByText('Compare uploaded photo of label to application values (The values'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Try example/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate test/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Batch', exact: true })).toBeVisible();
  await expect(page.locator('[data-guide="upload"]')).toBeVisible(); // dropzone
  await expect(page.getByLabel('Brand name')).toBeVisible(); // application form
  for (const link of ['Single label', 'Batch', 'Usage', 'Report issue']) {
    await expect(page.getByRole('navigation').getByText(link, { exact: true })).toBeVisible();
  }
});

test('the radial menu fans out its options', async ({ page }) => {
  await page.goto('/');
  await closeGuide(page);
  await page.getByRole('button', { name: /Try example/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Compliant', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Noncompliant' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Unclear photo' })).toBeVisible();
});

test('try-example loads a label, then Verify shows an approve result under the image', async ({ page }) => {
  await page.route('**/api/examples**', (route) => route.fulfill({ json: { example: EXAMPLE } }));
  await page.route('**/api/verify', (route) => route.fulfill({ json: verifyResponse('approve') }));
  await page.goto('/');
  await closeGuide(page);

  await page.getByRole('button', { name: /Try example/ }).click();
  await page.getByRole('menuitem', { name: 'Compliant', exact: true }).click();

  await expect(page.getByLabel('Brand name')).toHaveValue('RIVER STONE'); // fields populated
  await expect(page.locator('.stage-img')).toBeVisible(); // image swapped in

  await page.getByRole('button', { name: 'Verify label' }).click();

  const result = page.locator('.stage-col .result-section'); // result lives under the image, not full width
  await expect(result.locator('.banner')).toContainText('Approve');
});

test('a reject verdict shows the red banner with the reason', async ({ page }) => {
  await page.route('**/api/examples**', (route) => route.fulfill({ json: { example: EXAMPLE } }));
  await page.route('**/api/verify', (route) => route.fulfill({ json: verifyResponse('reject') }));
  await page.goto('/');
  await closeGuide(page);

  await page.getByRole('button', { name: /Try example/ }).click();
  await page.getByRole('menuitem', { name: 'Compliant', exact: true }).click();
  await expect(page.locator('.stage-img')).toBeVisible();
  await page.getByRole('button', { name: 'Verify label' }).click();

  await expect(page.locator('.banner')).toContainText('Reject');
  await expect(page.locator('.checks')).toContainText('label says 40%');
});

test('batch and usage pages load', async ({ page }) => {
  await page.goto('/batch');
  await expect(page.getByRole('heading', { name: /Batch/i }).first()).toBeVisible();
  await page.goto('/usage');
  await expect(page.getByRole('heading', { name: /Usage/i }).first()).toBeVisible();
});
