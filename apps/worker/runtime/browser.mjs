import fs from 'node:fs/promises';
import path from 'node:path';

export async function openStudioBrowser(renderer, repoRoot) {
  await fs.mkdir('/tmp/studio-home', {recursive: true});
  const shell = path.join(repoRoot, 'node_modules/.remotion/chrome-headless-shell/linux64/chrome-headless-shell-linux64/chrome-headless-shell');
  const hasShell = await fs.access(shell).then(() => true, () => false);
  console.log(JSON.stringify({type: 'runtime.browser', executable: hasShell ? shell : '/usr/bin/chromium',
    chromeMode: hasShell ? 'headless-shell' : 'chrome-for-testing', nodeRssBytes: process.memoryUsage().rss}));
  return renderer.openBrowser('chrome', {browserExecutable: hasShell ? shell : '/usr/bin/chromium',
    chromeMode: hasShell ? 'headless-shell' : 'chrome-for-testing', chromiumOptions: {enableMultiProcessOnLinux: true}});
}
