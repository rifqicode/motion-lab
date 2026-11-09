import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { screenshotPage, verifyReportPage } from './browser.mjs';

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character],
  );
}

function frameCard(sample, { comparison, baseline }) {
  const paired = sample.before && comparison;
  const images = paired
    ? `
  <img src="${sample.before}" alt="previous">
  <img class="after" src="${sample.file}" alt="current">`
    : `<img src="${sample.file}" alt="${escapeHTML(sample.composition)} frame ${sample.frame}">`;
  const note = sample.before
    ? 'Current frame · baseline available'
    : baseline
      ? 'No matching baseline'
      : 'Current preview';
  const control = paired
    ? `<input type="range" value="50" aria-label="Before after wipe" oninput="this.parentElement.querySelector('.after').style.clipPath='inset(0 '+(100-this.value)+'% 0 0)'">`
    : `<p class="note">${note}</p>`;
  return `<figure>
  <div class="compare">${images}</div>
  <figcaption>${escapeHTML(sample.composition)} · f${sample.frame} · ${sample.time.toFixed(2)}s</figcaption>
  ${control}
 </figure>`;
}

function reviewHTML(title, samples, { css, baseline, comparison = true }) {
  return `<!doctype html><html><meta charset="utf-8">
 <title>${escapeHTML(title)}</title><style>${css}</style><body>
 <h1>${escapeHTML(title)}</h1>
 <p class="note">PNG preview only. Automated sampling does not certify visual quality.</p>
 <nav><a href="index.html">All samples</a><a href="manifest.json">Manifest</a></nav>
 <div class="grid">${samples.map((sample) => frameCard(sample, { comparison, baseline })).join('')}</div>
 </body></html>`;
}

export async function writePreviewReport({ browser, run, samples, scenes }) {
  const css = await readFile(new URL('./report.css', import.meta.url), 'utf8');
  const htmlFile = join(run.directory, 'index.html');
  await writeFile(
    htmlFile,
    reviewHTML('MotionLab preview review', samples, { css, baseline: run.baseline }),
  );
  const reportChecks = await verifyReportPage(
    browser,
    htmlFile,
    samples.filter((sample) => sample.before).length,
  );
  for (const id of new Set(samples.map((sample) => sample.composition))) {
    const items = samples.filter((sample) => sample.composition === id);
    const name = `contact-${id}`;
    const sheet = join(run.directory, `${name}.html`);
    await writeFile(
      sheet,
      reviewHTML(id, items, { css, baseline: run.baseline, comparison: false }),
    );
    await screenshotPage(browser, sheet, join(run.directory, `${name}.png`));
  }
  const manifest = {
    runId: run.runId,
    baseline: run.baseline,
    samples,
    cues:
      run.previous?.cues ??
      scenes.map((shot) => ({
        id: shot.id,
        from: shot.from,
        duration: shot.duration,
        cues: shot.cues,
      })),
    reportChecks,
    limitations: [
      'Frames require human or agent visual review',
      'Before/after wipe shows current on left and baseline on right; not automatic approval',
    ],
  };
  await writeFile(join(run.directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await writeFile(
    join(run.root, 'latest.json'),
    JSON.stringify({ directory: run.runId, report: `${run.runId}/index.html` }, null, 2),
  );
  await writeFile(
    join(run.root, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>MotionLab latest preview</title><a href="${run.runId}/index.html">Open latest preview</a><meta http-equiv="refresh" content="0;url=${run.runId}/index.html">`,
  );
}
