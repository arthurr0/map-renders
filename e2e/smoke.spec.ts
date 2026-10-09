import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.resolve(here, '../tests/fixtures/village_v3.schem');
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('loads the village and exports a 1080p PNG', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

  await page.goto('/');
  await expect(page.getByText('No schematic loaded')).toBeVisible();

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open file' }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(fixture);

  const fileInfo = page.locator('.app-file');
  await expect(fileInfo.getByText('village_v3.schem')).toBeVisible();
  await expect(fileInfo.getByText(/[\d,.\s]+ blocks/)).toBeVisible();
  await expect(page.locator('.viewport-overlay[role=status]')).toHaveCount(0);

  await page.locator('header.app-header').getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Resolution').selectOption('1080p');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /^Export \.png$/ }).click();
  const download = await downloadPromise;
  const bytes = await readFile(await download.path());

  expect([...bytes.subarray(0, 8)]).toEqual(pngSignature);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(1920);
  expect(bytes.readUInt32BE(20)).toBe(1080);
  expect(bytes.length).toBeGreaterThan(200 * 1024);

  expect(problems).toEqual([]);
});
