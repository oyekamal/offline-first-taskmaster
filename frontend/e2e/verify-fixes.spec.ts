import { test, expect } from '@playwright/test';

/**
 * Verification tests to confirm all refresh issues are fixed.
 */

test.describe('Verify All Fixes', () => {

  test('login page loads without refresh loop', async ({ page }) => {
    let reloadCount = 0;
    const errors: string[] = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloadCount++;
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('dialog', async (dialog) => await dialog.dismiss());

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Login page should be visible
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('text=Task Manager')).toBeVisible();

    // No refresh loop
    expect(reloadCount).toBeLessThanOrEqual(1);

    // No page errors
    expect(errors).toHaveLength(0);
  });

  test('full login and app usage flow works', async ({ page }) => {
    let reloadCount = 0;
    const criticalErrors: string[] = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloadCount++;
    });
    page.on('pageerror', (err) => {
      // Ignore non-critical errors like Background Sync disabled
      if (!err.message.includes('Background Sync')) {
        criticalErrors.push(err.message);
      }
    });

    // Load app
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Login
    await page.locator('input[type="email"]').fill('user1@test.com');
    await page.locator('input[type="password"]').fill('testpass123');
    await page.locator('button[type="submit"]').click();

    // Wait for authenticated app to load
    await page.waitForTimeout(5000);

    // Should be in authenticated app
    await expect(page.locator('text=Logout')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Task' })).toBeVisible();

    // Should show sync status
    await expect(page.locator('text=Synced')).toBeVisible();

    // No unexpected reloads (1 for initial load only)
    expect(reloadCount).toBeLessThanOrEqual(1);

    // No critical errors
    expect(criticalErrors).toHaveLength(0);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-final-verified.png', fullPage: true });
  });

  test('no refresh loop with stale tokens', async ({ page }) => {
    let reloadCount = 0;

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloadCount++;
    });

    await page.goto('http://localhost:3000');
    await page.waitForTimeout(500);

    // Inject expired token
    await page.evaluate(() => {
      localStorage.setItem('access_token', 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjE1Nzc4MzY4MDAsIm5hbWUiOiJUZXN0IFVzZXIifQ.fake');
      localStorage.setItem('refresh_token', 'expired_refresh');
    });

    reloadCount = 0;
    await page.reload();
    await page.waitForTimeout(5000);

    // Should show login page (expired token detected)
    await expect(page.locator('input[type="email"]')).toBeVisible();

    // No refresh loop
    expect(reloadCount).toBeLessThanOrEqual(1);
  });
});
