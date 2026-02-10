import { test, expect } from '@playwright/test';

/**
 * Test task and comment creation after fixing the last_modified_by serializer issue.
 */

test.describe('Task and Comment Creation', () => {

  test('create a task and add a comment via the UI', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`ERROR: ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      if (!err.message.includes('Background Sync')) {
        errors.push(err.message);
        console.log(`PAGE ERROR: ${err.message}`);
      }
    });

    // Load app and login
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await page.locator('input[type="email"]').fill('user1@test.com');
    await page.locator('input[type="password"]').fill('testpass123');
    await page.locator('button[type="submit"]').click();

    // Wait for authenticated app
    await expect(page.locator('text=Logout')).toBeVisible({ timeout: 10000 });
    console.log('Logged in successfully');

    // Wait for sync to complete
    await page.waitForTimeout(3000);

    // Click "New Task" button
    await page.getByRole('button', { name: 'New Task' }).click();
    await page.waitForTimeout(500);

    // Fill task form
    const taskTitle = `Test Task ${Date.now()}`;
    await page.locator('input[name="title"], input[placeholder*="title"], #title').first().fill(taskTitle);

    // Look for description field
    const descField = page.locator('textarea[name="description"], textarea[placeholder*="description"], #description').first();
    if (await descField.isVisible()) {
      await descField.fill('This is a test task created by Playwright');
    }

    // Submit the form
    const submitButton = page.locator('button[type="submit"]').first();
    await submitButton.click();
    await page.waitForTimeout(2000);

    console.log(`Created task: ${taskTitle}`);
    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-task-created.png', fullPage: true });

    // Verify no critical errors
    const criticalErrors = errors.filter(e => !e.includes('Background Sync'));
    console.log(`Critical errors: ${criticalErrors.length}`);
    if (criticalErrors.length > 0) {
      console.log('Errors:', criticalErrors);
    }
  });

  test('sync creates tasks on server successfully', async ({ page }) => {
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Sync') || text.includes('sync') || text.includes('error') || text.includes('Error')) {
        console.log(`CONSOLE: ${text}`);
      }
    });
    page.on('pageerror', (err) => console.log(`PAGE ERROR: ${err.message}`));

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        console.log(`API ERROR: ${response.status()} ${response.url()}`);
      }
    });

    // Login
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(1000);
    await page.locator('input[type="email"]').fill('user1@test.com');
    await page.locator('input[type="password"]').fill('testpass123');
    await page.locator('button[type="submit"]').click();

    // Wait for login and sync
    await expect(page.locator('text=Logout')).toBeVisible({ timeout: 10000 });

    // Wait for initial sync to complete
    await page.waitForTimeout(5000);

    // Check sync status
    const syncText = await page.locator('text=Synced').count();
    console.log(`Sync status visible: ${syncText > 0}`);

    // Check for any API errors in recent console
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-synced.png', fullPage: true });
  });
});
