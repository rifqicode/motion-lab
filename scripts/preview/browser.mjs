/* global document */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const screenshotPage = async (browser, html, file, width = 1500) => {
  const page = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => {},
  });
  try {
    await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
    await page.goto({ url: pathToFileURL(html).href, timeout: 20000 });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const { value } = await page._client().send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    await writeFile(file, Buffer.from(value.data, 'base64'));
  } finally {
    await page.close();
  }
};
export async function verifyReportPage(browser, html, baselinePairs) {
  const reviewPage = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => {},
  });
  let reportChecks;
  try {
    await reviewPage.goto({ url: pathToFileURL(html).href, timeout: 20000 });
    await reviewPage.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    reportChecks = await reviewPage.evaluate(() => {
      const ranges = [...document.querySelectorAll('input[type=range]')];
      if (ranges[0]) {
        ranges[0].value = '25';
        ranges[0].dispatchEvent(new Event('input', { bubbles: true }));
        if (
          ranges[0].parentElement.querySelector('.after').style.clipPath !==
            'inset(0px 75% 0px 0px)' &&
          ranges[0].parentElement.querySelector('.after').style.clipPath !== 'inset(0 75% 0 0)'
        )
          throw new Error('Comparison slider failed');
      }
      return {
        imagesDecoded: document.images.length,
        comparisonSliders: ranges.length,
        sliderInteraction: ranges.length ? 'verified' : 'no baseline pairs',
      };
    });
    if (reportChecks.comparisonSliders !== baselinePairs)
      throw new Error('Baseline report coverage mismatch');
  } finally {
    await reviewPage.close();
  }

  return reportChecks;
}
