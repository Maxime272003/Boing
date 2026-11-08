import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { SAMPLE_ARTIST_CV_TEXT } from '../src/lib/backend/fixtures';
import { analysed, fresh, mockState } from './helpers';

async function artistPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 800;
  for (const line of SAMPLE_ARTIST_CV_TEXT.split('\n')) {
    page.drawText(line, { x: 50, y, size: 9, font });
    y -= 14;
  }
  return Buffer.from(await doc.save());
}

/** Léa, concept artist, cherche dans son métier ET un job alimentaire en attendant. */
async function onboardArtist(page: Page) {
  await fresh(page);
  await page.getByLabel('Clé API Claude').fill('sk-ant-test');
  await page.getByLabel('France Travail — identifiant client').fill('id');
  await page.getByLabel('France Travail — clé secrète').fill('secret');
  await page.getByLabel('Adzuna — App ID').fill('id');
  await page.getByLabel('Adzuna — App Key').fill('key');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByTestId('cv-input').setInputFiles({ name: 'CV_Lea_Moreau.pdf', mimeType: 'application/pdf', buffer: await artistPdf() });
  await expect(page.getByText('Léa Moreau · Concept artist')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await page.getByLabel('Ville').first().fill('Lyo');
  await page.getByRole('option', { name: /^Lyon \(69\)/ }).click();
  await page.getByLabel("J'ai aussi besoin d'un job alimentaire en attendant").check();
  await expect(page.getByLabel('Jobs alimentaires envisagés')).toBeVisible();
  // Les suggestions de Claude pré-remplissent la recherche, et la ville est reprise
  await expect(page.getByRole('button', { name: 'Retirer Vendeuse' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirer Serveuse' })).toBeVisible();
  await expect(page.getByLabel('Ville').nth(1)).toHaveValue('Lyon');
  await page.getByLabel('Tes contraintes pour ce job').fill('Temps partiel, pas le dimanche');
  await page.getByRole('button', { name: 'Voir les offres' }).click();
  await expect(page.getByRole('heading', { name: 'Offres', exact: true })).toBeVisible();
  await analysed(page);
}

const offers = (page: Page) => page.getByTestId('offer');

test('métier et job alimentaire : deux recherches, deux façons de noter', async ({ page }) => {
  await onboardArtist(page);

  await expect(offers(page)).toHaveCount(5);
  await expect(page.getByRole('radio', { name: 'Mon métier · 2' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Jobs alimentaires · 3' })).toBeVisible();

  // Claude reçoit le mode et le profil avec les contraintes
  const calls = await mockState<{ task: string }[]>(page, '(b) => b.claudeCalls');
  expect(calls.filter((c) => c.task === 'analyse')).toHaveLength(5);

  await page.getByRole('radio', { name: /Jobs alimentaires/ }).click();
  await expect(offers(page)).toHaveCount(3);
  await expect(offers(page).first()).toContainText('Vendeuse en magasin de beaux-arts');
  await expect(offers(page).first().getByRole('img', { name: 'Match 91 %' })).toBeVisible();
  await expect(offers(page).first().getByText('Job alimentaire')).toBeVisible();
  // Temps plein, soirs et dimanches : mal noté pour un job d'appoint
  await expect(offers(page).last()).toContainText('Serveur / Serveuse');
  await expect(offers(page).last().getByRole('img', { name: 'Match 42 %' })).toBeVisible();

  await page.getByRole('radio', { name: /Mon métier/ }).click();
  await expect(offers(page)).toHaveCount(2);
  await expect(offers(page).first()).toContainText('Concept artist junior');
  await expect(offers(page).first().getByText('Job alimentaire')).toHaveCount(0);
});

test('candidature à un job alimentaire : CV recentré, lettre courte, suivi filtré', async ({ page }) => {
  await onboardArtist(page);
  await page.getByRole('link', { name: 'Vendeuse en magasin de beaux-arts' }).click();
  await expect(page.getByText('Noté comme job alimentaire')).toBeVisible();
  await expect(page.getByText('20 h par semaine, pas de dimanche : compatible avec ton activité')).toBeVisible();
  await page.getByRole('button', { name: 'Préparer ma candidature' }).first().click();

  // CV : intitulé, accroche, missions spécialisées masquées
  await expect(page.getByTestId('cv-change')).toHaveCount(5);
  await expect(page.getByText('Version « job alimentaire »')).toBeVisible();
  const adapted = page.getByRole('region', { name: 'Version adaptée' });
  await expect(adapted).toContainText('Vendeuse — conseil client');
  await expect(adapted).toContainText('en parallèle de mon activité de concept artist');
  await expect(adapted).not.toContainText("Recherches d'environnements");
  await expect(page.getByRole('region', { name: 'Ton CV d\'origine' })).toContainText("Recherches d'environnements");
  // Refuser un masquage remet la mission
  await page.getByTestId('cv-change').filter({ hasText: 'Mission trop spécialisée masquée' }).getByRole('button', { name: 'Refuser' }).click();
  await expect(adapted).toContainText("Recherches d'environnements");

  // Lettre : courte et directe par défaut
  await page.getByRole('button', { name: 'Suivant : la lettre →' }).click();
  await expect(page.getByRole('button', { name: 'Courte' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Direct' })).toHaveAttribute('aria-pressed', 'true');
  const letter = page.getByLabel('Texte de la lettre');
  await expect(letter).toHaveValue(/je suis concept artist/);
  await expect(letter).toHaveValue(/hors dimanche/);

  // Envoi via le site, puis suivi avec le filtre
  await page.getByRole('link', { name: '3. Envoi' }).click();
  await page.getByRole('radio', { name: /Postuler sur le site/ }).click();
  await page.getByRole('button', { name: "C'est envoyé, ajouter au suivi" }).click();
  await expect(page.getByTestId('col-sent')).toContainText('Atelier Pigment');
  await expect(page.getByTestId('col-sent').getByText('Job alimentaire')).toBeVisible();
  await page.getByRole('radio', { name: 'Mon métier' }).click();
  await expect(page.getByTestId('app-card')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Jobs alimentaires' }).click();
  await expect(page.getByTestId('app-card')).toHaveCount(1);
});

test('les recherches gardent leur type dans Mes documents', async ({ page }) => {
  await onboardArtist(page);
  await page.getByRole('link', { name: 'Mes documents' }).click();
  const searches = page.getByRole('region', { name: 'Recherches enregistrées' });
  await expect(searches.getByText('Job alimentaire', { exact: true })).toBeVisible();
  await expect(searches.getByText('Métier', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fiche profil' })).toContainText('Temps partiel, pas le dimanche');
});

test.describe('mode sombre', () => {
  test.use({ colorScheme: 'dark' });
  test('suit le thème du système', async ({ page }) => {
    await fresh(page);
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
    expect(bg).toBe('rgb(19, 19, 21)');
    const card = await page.locator('.card').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(card).toBe('rgb(28, 28, 31)');
    const text = await page.getByRole('heading', { name: 'Bienvenue sur Boing' }).evaluate((el) => getComputedStyle(el).color);
    expect(text).toBe('rgb(242, 242, 240)');
  });
});
