import { expect, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { SAMPLE_CV_TEXT } from '../src/lib/backend/fixtures';

/** Le CV d'exemple, transformé en vrai PDF (pour tester l'import comme le ferait l'utilisatrice). */
export async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([595, 842]);
  let y = 800;
  for (const line of SAMPLE_CV_TEXT.split('\n')) {
    if (y < 50) {
      page = doc.addPage([595, 842]);
      y = 800;
    }
    page.drawText(line, { x: 50, y, size: 10, font });
    y -= 15;
  }
  return Buffer.from(await doc.save());
}

/** Ouvre l'app avec un stockage vide et une simulation rapide. */
export async function fresh(page: Page, latency = 30) {
  await page.addInitScript((ms) => {
    if (!sessionStorage.getItem('boing-test-init')) {
      localStorage.clear();
      sessionStorage.setItem('boing-test-init', '1');
    }
    localStorage.setItem('boing-mock-latency', String(ms));
  }, latency);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bienvenue sur Boing' })).toBeVisible();
}

export interface OnboardOptions {
  claude?: boolean;
  sources?: boolean;
}

/** Fait tout le premier lancement : clés, CV (PDF), critères. */
export async function onboard(page: Page, { claude = true, sources = true }: OnboardOptions = {}) {
  await fresh(page);
  if (claude) await page.getByLabel('Clé API Claude').fill('sk-ant-test');
  if (sources) {
    await page.getByLabel('France Travail — identifiant client').fill('PAR_boing_test');
    await page.getByLabel('France Travail — clé secrète').fill('secret');
    await page.getByLabel('Adzuna — App ID').fill('az-id');
    await page.getByLabel('Adzuna — App Key').fill('az-key');
  }
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Ton CV' })).toBeVisible();
  await page.getByTestId('cv-input').setInputFiles({ name: 'CV_Camille_Martin.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  if (claude) {
    await expect(page.getByRole('heading', { name: 'Ce que Claude a compris' })).toBeVisible();
  } else {
    await page.getByLabel('Prénom').fill('Camille');
    await page.getByLabel('Nom', { exact: true }).fill('Martin');
  }
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: 'Quel travail cherches-tu ?' })).toBeVisible();
  if (!claude) {
    await page.getByLabel('Métiers visés').fill('Assistante administrative');
    await page.getByLabel('Métiers visés').press('Enter');
  }
  await page.getByLabel('Ville').fill('Lyo');
  await page.getByRole('option', { name: /^Lyon \(69\)/ }).click();
  await page.getByRole('button', { name: 'Voir les offres' }).click();
  await expect(page.getByRole('heading', { name: 'Offres', exact: true })).toBeVisible();
}

export async function mockState<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate((f) => (new Function('b', `return (${f})(b)`))(window.__boing), fn) as Promise<T>;
}
