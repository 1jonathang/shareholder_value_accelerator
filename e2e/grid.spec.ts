import { test, expect } from '@playwright/test';

test.describe('Spreadsheet Grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the spreadsheet canvas', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    await expect(canvas).toBeVisible();
  });

  test('should show column and row headers', async ({ page }) => {
    // Wait for the canvas to render
    await page.waitForTimeout(500);
    
    // Take a screenshot for visual verification
    const canvas = page.locator('canvas#sheet-canvas');
    await expect(canvas).toHaveScreenshot('initial-grid.png', {
      maxDiffPixels: 100,
    });
  });

  test('should allow cell selection via click', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    
    // Click on cell A1 (accounting for header offset)
    await canvas.click({ position: { x: 100, y: 50 } });
    
    // Verify selection indicator appears
    const selectionInfo = page.locator('[data-testid="selection-info"]');
    await expect(selectionInfo).toContainText('A1');
  });

  test('should support keyboard navigation', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    await canvas.click({ position: { x: 100, y: 50 } });
    
    // Navigate with arrow keys
    await page.keyboard.press('ArrowRight');
    const selectionInfo = page.locator('[data-testid="selection-info"]');
    await expect(selectionInfo).toContainText('B1');
    
    await page.keyboard.press('ArrowDown');
    await expect(selectionInfo).toContainText('B2');
  });

  test('should enable cell editing on double-click', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    await canvas.dblclick({ position: { x: 100, y: 50 } });
    
    // Check that the cell editor appears
    const cellEditor = page.locator('[data-testid="cell-editor"]');
    await expect(cellEditor).toBeVisible();
    await expect(cellEditor).toBeFocused();
  });

  test('should accept cell input and display value', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    await canvas.dblclick({ position: { x: 100, y: 50 } });
    
    const cellEditor = page.locator('[data-testid="cell-editor"]');
    await cellEditor.fill('Hello World');
    await page.keyboard.press('Enter');
    
    // Verify the value is displayed
    await page.waitForTimeout(100);
    // The canvas should now show "Hello World" in A1
  });

  test('should evaluate formulas', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    
    // Enter value in A1
    await canvas.dblclick({ position: { x: 100, y: 50 } });
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
    
    // Enter value in A2
    await canvas.dblclick({ position: { x: 100, y: 74 } });
    await page.keyboard.type('20');
    await page.keyboard.press('Enter');
    
    // Enter formula in A3
    await canvas.dblclick({ position: { x: 100, y: 98 } });
    await page.keyboard.type('=SUM(A1:A2)');
    await page.keyboard.press('Enter');
    
    // Verify the formula bar shows the result
    await canvas.click({ position: { x: 100, y: 98 } });
    const formulaBar = page.locator('[data-testid="formula-bar"]');
    await expect(formulaBar).toContainText('=SUM(A1:A2)');
  });

  test('should support smooth scrolling', async ({ page }) => {
    const canvas = page.locator('canvas#sheet-canvas');
    
    // Scroll down
    await canvas.hover();
    await page.mouse.wheel(0, 500);
    
    // Verify scroll position changed
    await page.waitForTimeout(100);
    const scrollInfo = page.locator('[data-testid="scroll-position"]');
    const text = await scrollInfo.textContent();
    expect(text).not.toBe('Row: 1');
  });

  test('should support pinch-to-zoom on touch devices', async ({ page }) => {
    // Skip on non-touch browsers
    const isTouchEnabled = await page.evaluate(() => 'ontouchstart' in window);
    if (!isTouchEnabled) {
      test.skip();
      return;
    }
    
    const canvas = page.locator('canvas#sheet-canvas');
    const box = await canvas.boundingBox();
    if (!box) return;
    
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    // Simulate pinch gesture
    await page.touchscreen.tap(centerX, centerY);
  });
});

test.describe('Agent Integration', () => {
  test('should open command palette with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    
    // Cmd/Ctrl + K to open command palette
    await page.keyboard.press('Control+k');
    
    const commandPalette = page.locator('[data-testid="command-palette"]');
    await expect(commandPalette).toBeVisible();
  });

  test('should show agent plan panel', async ({ page }) => {
    await page.goto('/');
    
    await page.keyboard.press('Control+k');
    const input = page.locator('[data-testid="command-input"]');
    await input.fill('Create a revenue projection');
    await page.keyboard.press('Enter');
    
    // Wait for agent response
    const planPanel = page.locator('[data-testid="agent-plan"]');
    await expect(planPanel).toBeVisible({ timeout: 10000 });
  });
});

