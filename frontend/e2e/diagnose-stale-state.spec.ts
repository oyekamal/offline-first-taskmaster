import { test, expect } from '@playwright/test';

/**
 * Simulate scenarios that could cause refresh loops:
 * 1. Stale/expired JWT tokens in localStorage
 * 2. Pre-existing service worker causing update loops
 * 3. Backend returning 401 during sync operations
 */

test.describe('Diagnose Stale State Issues', () => {

  test('simulate expired JWT tokens causing 401 redirect loop', async ({ page }) => {
    let reloadCount = 0;
    const apiCalls: string[] = [];
    const navigations: string[] = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        reloadCount++;
        navigations.push(`Nav #${reloadCount}: ${frame.url()} at ${Date.now()}`);
        console.log(`NAVIGATION #${reloadCount}: ${frame.url()}`);
      }
    });

    page.on('console', (msg) => console.log(`CONSOLE: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`ERROR: ${err.message}`));

    page.on('request', (request) => {
      if (request.url().includes('/api/')) {
        apiCalls.push(`${request.method()} ${request.url()}`);
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        console.log(`API: ${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    // Dismiss any confirm dialogs from service worker
    page.on('dialog', async (dialog) => {
      console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss();
    });

    // Load page first
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Inject a fake expired JWT token to simulate stale auth state
    // This is a JWT with exp set to a past time (2020-01-01)
    const expiredToken = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' +
      btoa(JSON.stringify({ user_id: 1, exp: 1577836800, name: 'Test User' })) + '.fake_sig';

    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', 'fake_refresh_token');
    }, `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxLCJleHAiOjE1Nzc4MzY4MDAsIm5hbWUiOiJUZXN0IFVzZXIifQ.fake_sig`);

    console.log('--- Set expired tokens, now reloading ---');
    reloadCount = 0;

    // Reload to trigger auth check with expired token
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    console.log('\n--- STALE TOKEN TEST RESULTS ---');
    console.log(`Reload count: ${reloadCount}`);
    console.log(`API calls: ${apiCalls.length}`);
    console.log(`Navigations:`, navigations);

    // Check if login page is shown (token should be detected as expired)
    const isLoginVisible = await page.locator('input[type="email"]').count();
    console.log(`Login visible: ${isLoginVisible > 0}`);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-stale-token.png', fullPage: true });

    // Should not enter a refresh loop
    expect(reloadCount).toBeLessThanOrEqual(2);
    expect(isLoginVisible).toBeGreaterThan(0);
  });

  test('simulate valid-looking but invalid token (triggers 401 on API call)', async ({ page }) => {
    let reloadCount = 0;
    const apiCalls: { url: string; status: number }[] = [];

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        reloadCount++;
        console.log(`NAVIGATION #${reloadCount}: ${frame.url()}`);
      }
    });

    page.on('console', (msg) => console.log(`CONSOLE: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`ERROR: ${err.message}`));

    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        apiCalls.push({ url: response.url(), status: response.status() });
        console.log(`API: ${response.status()} ${response.url()}`);
      }
    });

    page.on('dialog', async (dialog) => {
      console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
      await dialog.dismiss();
    });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Set a token that looks valid (exp in the future) but is actually invalid
    // This will pass the client-side isAuthenticated() check but fail on server
    const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const fakePayload = btoa(JSON.stringify({
      user_id: 999,
      exp: futureExp,
      name: 'Fake User',
      email: 'fake@test.com',
      role: 'admin'
    }));
    const fakeToken = `eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.${fakePayload}.fake_signature`;

    await page.evaluate((token) => {
      localStorage.setItem('access_token', token);
      localStorage.setItem('refresh_token', 'fake_refresh_token_value');
    }, fakeToken);

    console.log('--- Set fake valid-looking token, now reloading ---');
    reloadCount = 0;

    // Reload - app should think user is authenticated, show AuthenticatedApp,
    // then syncManager.initialize() runs, tries API calls, gets 401
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait longer to observe if the 401 handler causes a redirect loop
    await page.waitForTimeout(10000);

    console.log('\n--- FAKE TOKEN TEST RESULTS ---');
    console.log(`Reload count: ${reloadCount}`);
    console.log(`API calls made: ${apiCalls.length}`);
    console.log(`401 responses: ${apiCalls.filter(c => c.status === 401).length}`);
    console.log('API calls:', JSON.stringify(apiCalls, null, 2));

    const isLoginVisible = await page.locator('input[type="email"]').count();
    const isAppVisible = await page.locator('text=Task Manager').count();
    console.log(`Login visible: ${isLoginVisible > 0}`);
    console.log(`App header visible: ${isAppVisible > 0}`);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-fake-token.png', fullPage: true });

    // Check for refresh loop - this is the critical scenario
    if (reloadCount > 3) {
      console.log('!!! 401 REDIRECT LOOP DETECTED !!!');
      console.log('The window.location.href = "/login" in apiClient.ts is causing a refresh loop');
    }
  });

  test('check Vite HMR connection and websocket behavior', async ({ page }) => {
    const wsMessages: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('vite') || text.includes('hmr') || text.includes('reload') || text.includes('update')) {
        wsMessages.push(text);
        console.log(`HMR: ${text}`);
      }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    console.log('--- HMR/VITE MESSAGES ---');
    console.log(wsMessages);

    // Check WebSocket connections
    const wsCount = await page.evaluate(() => {
      return (performance.getEntriesByType('resource') as any[])
        .filter(r => r.name.includes('ws') || r.name.includes('socket'))
        .map(r => r.name);
    });
    console.log('WebSocket resources:', wsCount);
  });

  test('test login flow works end to end', async ({ page }) => {
    page.on('console', (msg) => console.log(`CONSOLE: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`ERROR: ${err.message}`));

    // Go to app
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Check login page is visible
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(submitButton).toBeVisible();

    console.log('Login page is visible and interactive');

    // Try to login with test credentials
    await emailInput.fill('user1@test.com');
    await passwordInput.fill('testpass123');

    console.log('Filled credentials, clicking submit...');
    await submitButton.click();

    // Wait for response
    await page.waitForTimeout(5000);

    // Check what happened
    const currentUrl = page.url();
    const bodyText = await page.textContent('body');

    console.log(`Current URL: ${currentUrl}`);
    console.log(`Body text (first 300): ${bodyText?.substring(0, 300)}`);

    // Check if we're now in the authenticated app
    const hasLogout = await page.locator('text=Logout').count();
    const hasNewTask = await page.locator('text=New Task').count();
    const hasLoginForm = await page.locator('input[type="email"]').count();

    console.log(`Has Logout button: ${hasLogout > 0}`);
    console.log(`Has New Task button: ${hasNewTask > 0}`);
    console.log(`Still on login page: ${hasLoginForm > 0}`);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-after-login.png', fullPage: true });
  });
});
