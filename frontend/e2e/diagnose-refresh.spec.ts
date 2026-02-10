import { test, expect } from '@playwright/test';

/**
 * Diagnostic tests to identify why the frontend keeps refreshing every second
 * and why the login page is not displayed.
 */

test.describe('Diagnose Page Refresh Issue', () => {

  test('check if login page loads and stays stable', async ({ page }) => {
    const navigationEvents: string[] = [];
    const consoleMessages: string[] = [];
    const errors: string[] = [];
    let reloadCount = 0;

    // Track all console messages
    page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      consoleMessages.push(text);
      console.log('CONSOLE:', text);
    });

    // Track page errors
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.log('PAGE ERROR:', error.message);
    });

    // Track navigations (reloads)
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        reloadCount++;
        navigationEvents.push(`Navigation #${reloadCount} at ${Date.now()}: ${frame.url()}`);
        console.log(`NAVIGATION #${reloadCount}: ${frame.url()}`);
      }
    });

    // Track requests that might cause issues
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/') || url.includes('sw.js')) {
        console.log(`REQUEST: ${request.method()} ${url}`);
      }
    });

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/api/') || url.includes('sw.js')) {
        console.log(`RESPONSE: ${response.status()} ${url}`);
      }
    });

    // Track dialogs (confirm/alert from service worker update)
    page.on('dialog', async (dialog) => {
      console.log(`DIALOG: ${dialog.type()} - ${dialog.message()}`);
      // Dismiss to prevent reload
      await dialog.dismiss();
    });

    // Navigate to the app
    console.log('--- Navigating to http://localhost:3000 ---');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });

    // Wait 8 seconds to observe behavior
    console.log('--- Waiting 8 seconds to observe refresh behavior ---');
    await page.waitForTimeout(8000);

    // Take screenshot
    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-after-8s.png', fullPage: true });

    // Check what's visible on the page
    const bodyText = await page.textContent('body');
    console.log('--- PAGE BODY TEXT (first 500 chars) ---');
    console.log(bodyText?.substring(0, 500));

    // Check for login page elements
    const hasLoginForm = await page.locator('form').count();
    const hasEmailInput = await page.locator('input[type="email"]').count();
    const hasPasswordInput = await page.locator('input[type="password"]').count();
    const hasSignInButton = await page.locator('button[type="submit"]').count();
    const hasLoadingSpinner = await page.locator('.animate-spin').count();

    console.log('--- ELEMENT CHECK ---');
    console.log(`Login form present: ${hasLoginForm > 0}`);
    console.log(`Email input present: ${hasEmailInput > 0}`);
    console.log(`Password input present: ${hasPasswordInput > 0}`);
    console.log(`Sign In button present: ${hasSignInButton > 0}`);
    console.log(`Loading spinner present: ${hasLoadingSpinner > 0}`);

    // Summary
    console.log('\n--- DIAGNOSTIC SUMMARY ---');
    console.log(`Total navigation events: ${reloadCount}`);
    console.log(`Total console messages: ${consoleMessages.length}`);
    console.log(`Total page errors: ${errors.length}`);
    console.log(`Navigation events:`, navigationEvents);
    console.log(`Page errors:`, errors);

    // Check for service worker related messages
    const swMessages = consoleMessages.filter(m =>
      m.toLowerCase().includes('service worker') ||
      m.toLowerCase().includes('sw.js') ||
      m.toLowerCase().includes('workbox')
    );
    console.log(`Service Worker messages:`, swMessages);

    // Check for auth related messages
    const authMessages = consoleMessages.filter(m =>
      m.toLowerCase().includes('auth') ||
      m.toLowerCase().includes('token') ||
      m.toLowerCase().includes('login') ||
      m.toLowerCase().includes('401')
    );
    console.log(`Auth messages:`, authMessages);

    // Check for sync related messages
    const syncMessages = consoleMessages.filter(m =>
      m.toLowerCase().includes('sync')
    );
    console.log(`Sync messages:`, syncMessages);

    // Assertions
    // More than 2 navigations in 8 seconds = refresh loop
    if (reloadCount > 2) {
      console.log('!!! REFRESH LOOP DETECTED !!!');
      console.log(`Page reloaded ${reloadCount} times in 8 seconds`);
    }

    // Login page should eventually be visible (since no tokens exist)
    expect(reloadCount, 'Page should not reload more than 2 times').toBeLessThanOrEqual(2);
  });

  test('check service worker behavior', async ({ page }) => {
    const swEvents: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Service Worker') || text.includes('sw.js') || text.includes('workbox')) {
        swEvents.push(text);
        console.log('SW:', text);
      }
    });

    // Unregister existing service workers first
    await page.goto('http://localhost:3000');
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      console.log(`Found ${registrations.length} service worker registrations`);
      for (const reg of registrations) {
        console.log(`SW scope: ${reg.scope}, active: ${!!reg.active}, installing: ${!!reg.installing}, waiting: ${!!reg.waiting}`);
      }
    });

    await page.waitForTimeout(3000);

    console.log('--- SERVICE WORKER EVENTS ---');
    console.log(swEvents);
  });

  test('check for 401 redirect loop with network monitoring', async ({ page }) => {
    const apiCalls: { url: string; status: number; method: string }[] = [];
    let redirectCount = 0;

    page.on('request', (request) => {
      if (request.url().includes('/api/') || request.url().includes('/login')) {
        console.log(`API REQUEST: ${request.method()} ${request.url()}`);
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/api/')) {
        apiCalls.push({
          url: response.url(),
          status: response.status(),
          method: response.request().method()
        });
        console.log(`API RESPONSE: ${response.status()} ${response.request().method()} ${response.url()}`);
        if (response.status() === 401) {
          redirectCount++;
        }
      }
    });

    // Clear localStorage to simulate fresh visit (no tokens)
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    });

    // Reload to start fresh
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    console.log('\n--- API CALL SUMMARY ---');
    console.log(`Total API calls: ${apiCalls.length}`);
    console.log(`401 responses: ${redirectCount}`);
    console.log('All API calls:', JSON.stringify(apiCalls, null, 2));

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-api-check.png', fullPage: true });
  });

  test('check page DOM and React root state', async ({ page }) => {
    page.on('console', (msg) => console.log(`CONSOLE: ${msg.text()}`));
    page.on('pageerror', (err) => console.log(`ERROR: ${err.message}`));

    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Check if React root exists and has content
    const rootContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return {
        exists: !!root,
        innerHTML: root?.innerHTML?.substring(0, 1000) || 'empty',
        childCount: root?.childElementCount || 0,
      };
    });

    console.log('--- REACT ROOT STATE ---');
    console.log(`Root exists: ${rootContent.exists}`);
    console.log(`Child count: ${rootContent.childCount}`);
    console.log(`Inner HTML (first 1000 chars): ${rootContent.innerHTML}`);

    // Check localStorage state
    const storageState = await page.evaluate(() => {
      return {
        access_token: localStorage.getItem('access_token')?.substring(0, 50) || null,
        refresh_token: localStorage.getItem('refresh_token')?.substring(0, 50) || null,
        allKeys: Object.keys(localStorage),
      };
    });

    console.log('--- LOCAL STORAGE STATE ---');
    console.log(JSON.stringify(storageState, null, 2));

    // Check if page is stuck on loading
    const isLoading = await page.locator('.animate-spin').count();
    const isLoginVisible = await page.locator('input[type="email"]').count();
    const pageTitle = await page.title();

    console.log(`--- PAGE STATE ---`);
    console.log(`Page title: ${pageTitle}`);
    console.log(`Loading spinner visible: ${isLoading > 0}`);
    console.log(`Login form visible: ${isLoginVisible > 0}`);

    await page.screenshot({ path: '/home/oye/Documents/offline_first_architecture/frontend/e2e/screenshot-dom-state.png', fullPage: true });
  });
});
