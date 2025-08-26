const { chromium } = require('playwright');

async function testTalentLayout() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  console.log('Navigating to talent viewer page...');
  await page.goto('http://localhost:3000/talents');
  
  // Wait for the page to load
  await page.waitForTimeout(2000);
  
  // Take initial screenshot
  await page.screenshot({ 
    path: 'talent-viewer-initial.png', 
    fullPage: true 
  });
  console.log('Saved screenshot: talent-viewer-initial.png');
  
  // Try to select a class (Warrior)
  const classDropdown = await page.locator('select').first();
  if (await classDropdown.isVisible()) {
    await classDropdown.selectOption({ label: 'Warrior' });
    await page.waitForTimeout(500);
    
    // Select a spec if available
    const specDropdown = await page.locator('select').nth(1);
    if (await specDropdown.isVisible()) {
      await specDropdown.selectOption({ index: 1 });
      await page.waitForTimeout(1000);
    }
  }
  
  // Take screenshot after selection
  await page.screenshot({ 
    path: 'talent-viewer-with-selection.png', 
    fullPage: true 
  });
  console.log('Saved screenshot: talent-viewer-with-selection.png');
  
  // Click on the first talent build card if available
  const firstBuildCard = await page.locator('.talent-build-item').first();
  if (await firstBuildCard.isVisible()) {
    await firstBuildCard.click();
    await page.waitForTimeout(2000);
    
    // Take screenshot with expanded talent tree
    await page.screenshot({ 
      path: 'talent-viewer-expanded.png', 
      fullPage: true 
    });
    console.log('Saved screenshot: talent-viewer-expanded.png');
    
    // Check if talent tree iframe is visible and not overflowing
    const talentTreeContainer = await page.locator('.talent-tree-container');
    if (await talentTreeContainer.isVisible()) {
      const boundingBox = await talentTreeContainer.boundingBox();
      console.log('Talent tree container dimensions:', boundingBox);
      
      // Check viewport width
      const viewport = page.viewportSize();
      console.log('Viewport size:', viewport);
      
      if (boundingBox && viewport) {
        if (boundingBox.x + boundingBox.width > viewport.width) {
          console.log('⚠️  WARNING: Talent tree is overflowing the viewport!');
          console.log(`   Container right edge: ${boundingBox.x + boundingBox.width}px`);
          console.log(`   Viewport width: ${viewport.width}px`);
        } else {
          console.log('✓ Talent tree fits within viewport');
        }
      }
    }
  }
  
  // Test responsive behavior
  console.log('\nTesting responsive layout...');
  
  // Test tablet size
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.screenshot({ 
    path: 'talent-viewer-tablet.png', 
    fullPage: true 
  });
  console.log('Saved screenshot: talent-viewer-tablet.png (tablet view)');
  
  // Test desktop size
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ 
    path: 'talent-viewer-desktop.png', 
    fullPage: true 
  });
  console.log('Saved screenshot: talent-viewer-desktop.png (desktop view)');
  
  console.log('\n✅ Layout test completed!');
  console.log('Check the screenshot files to verify the layout.');
  
  await browser.close();
}

testTalentLayout().catch(console.error);