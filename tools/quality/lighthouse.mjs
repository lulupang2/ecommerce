import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { chromium } from '@playwright/test';
import { lighthouseConfig } from './lighthouse.config.mjs';

const reportOnly = process.argv.includes('--report-only');
const reportDirectory = path.resolve('.lighthouseci');
const runs = reportOnly ? 1 : lighthouseConfig.runs;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function pageSummary(name, url, reports) {
  const categories = Object.fromEntries(
    Object.keys(lighthouseConfig.categories).map(category => [
      category,
      median(reports.map(report => report.categories[category].score ?? 0)),
    ]),
  );
  const metrics = Object.fromEntries(
    Object.keys(lighthouseConfig.metrics).map(metric => [
      metric,
      median(reports.map(report => report.audits[metric].numericValue ?? Number.POSITIVE_INFINITY)),
    ]),
  );
  return { name, url, categories, metrics };
}

function violationsFor(summary) {
  const violations = [];
  for (const [category, minimum] of Object.entries(lighthouseConfig.categories)) {
    const actual = summary.categories[category];
    if (actual < minimum) {
      violations.push(`${category} score ${actual.toFixed(2)} < ${minimum.toFixed(2)}`);
    }
  }
  for (const [metric, maximum] of Object.entries(lighthouseConfig.metrics)) {
    const actual = summary.metrics[metric];
    if (actual > maximum) {
      const displayed = metric === 'cumulative-layout-shift' ? actual.toFixed(3) : Math.round(actual);
      violations.push(`${metric} ${displayed} > ${maximum}`);
    }
  }
  return violations;
}

await fs.mkdir(reportDirectory, { recursive: true });
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'],
  logLevel: 'silent',
});

const summaries = [];
try {
  for (const page of lighthouseConfig.pages) {
    const url = new URL(page.path, lighthouseConfig.baseUrl).toString();
    const reports = [];
    for (let run = 1; run <= runs; run += 1) {
      const result = await lighthouse(url, {
        port: chrome.port,
        logLevel: 'error',
        output: ['json', 'html'],
        onlyCategories: Object.keys(lighthouseConfig.categories),
      });
      if (!result) throw new Error(`Lighthouse did not return a report for ${url}`);
      reports.push(result.lhr);
      const [jsonReport, htmlReport] = result.report;
      const prefix = path.join(reportDirectory, `${page.name}-${run}`);
      await Promise.all([
        fs.writeFile(`${prefix}.report.json`, jsonReport),
        fs.writeFile(`${prefix}.report.html`, htmlReport),
      ]);
    }
    summaries.push(pageSummary(page.name, url, reports));
  }
} finally {
  try {
    await chrome.kill();
  } catch (error) {
    if (process.platform !== 'win32') throw error;
  }
}

const result = {
  status: 'passed',
  runsPerPage: runs,
  thresholds: {
    categories: lighthouseConfig.categories,
    metrics: lighthouseConfig.metrics,
  },
  pages: summaries.map(summary => ({
    ...summary,
    violations: violationsFor(summary),
  })),
};
const failures = result.pages.flatMap(page =>
  page.violations.map(violation => `${page.name}: ${violation}`),
);
if (failures.length) result.status = reportOnly ? 'reported' : 'failed';

await fs.writeFile(
  path.join(reportDirectory, 'summary.json'),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result));

if (failures.length && !reportOnly) process.exitCode = 1;
