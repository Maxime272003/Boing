import { expect, test, type Page } from '@playwright/test';
import { analysed, fresh, mockState, onboard } from './helpers';

const offers = (page: Page) => page.getByTestId('offer');

test.describe('Premier lancement', () => {
  test('clés, import du CV en PDF lu par Claude, critères, puis offres analysées', async ({ page }) => {
    await onboard(page);

    // Collecte : 6 offres correspondent aux métiers suggérés ; l'intérim est écarté (CDI/CDD demandés)
    await expect(offers(page)).toHaveCount(6);
    await expect(page.getByText('Agent d’accueil')).toHaveCount(0);

    // Claude analyse automatiquement, la meilleure offre remonte en tête
    await analysed(page);
    await expect(offers(page).first()).toContainText('Assistante administrative');
    await expect(offers(page).first().getByRole('img', { name: 'Match 92 %' })).toBeVisible();
    await expect(offers(page).first()).toContainText('Très bon match');

    const calls = await mockState<{ task: string; model: string; cached: boolean }[]>(page, '(b) => b.claudeCalls');
    expect(calls[0]).toMatchObject({ task: 'parse_cv', model: 'claude-sonnet-5-5' });
    // Profil et consignes en cache pour toutes les analyses
    expect(calls.filter((c) => c.task === 'analyse').every((c) => c.cached)).toBe(true);
    expect(calls.filter((c) => c.task === 'analyse')).toHaveLength(6);
    expect(calls.find((c) => c.task === 'analyse')?.model).toBe('claude-haiku-5-5');
  });

  test('sans clé Claude : fiche profil à la main, offres sans score', async ({ page }) => {
    await onboard(page, { claude: false });
    await expect(offers(page).first()).toBeVisible();
    await expect(page.getByText('Ajoute ta clé Claude pour obtenir un score')).toBeVisible();
    await expect(offers(page).first()).toContainText('Pas encore analysée par Claude');
  });

  test('sans source : un message explique quoi faire', async ({ page }) => {
    await onboard(page, { sources: false });
    await expect(page.getByRole('heading', { name: "Pas encore d'offres" })).toBeVisible();
    await page.getByRole('link', { name: 'Ajouter une clé' }).click();
    await expect(page.getByRole('heading', { name: 'Paramètres' })).toBeVisible();
  });
});

test.describe('Liste des offres', () => {
  test('filtres, recherche, favoris, masquer', async ({ page }) => {
    await onboard(page);
    await analysed(page);

    await page.getByRole('button', { name: /^Match ≥ 70 % · 6/ }).click();
    await expect(offers(page)).toHaveCount(6);

    await page.getByRole('button', { name: /^Toutes/ }).click();
    await page.getByPlaceholder('Filtrer par mot-clé').fill('clinique');
    await expect(offers(page)).toHaveCount(1);
    await page.getByPlaceholder('Filtrer par mot-clé').fill('');

    const first = offers(page).first();
    await first.getByRole('button', { name: 'Ajouter aux favoris' }).click();
    await page.getByRole('button', { name: /^Favoris · 1/ }).click();
    await expect(offers(page)).toHaveCount(1);

    await page.getByRole('button', { name: /^Toutes/ }).click();
    await offers(page).last().getByRole('button', { name: "Masquer l'offre" }).click();
    await expect(offers(page)).toHaveCount(5);
    await page.getByRole('button', { name: /^Masquées · 1/ }).click();
    await expect(offers(page)).toHaveCount(1);

    // L'annonce reprise par Adzuna n'apparaît pas en double ; l'offre trop ancienne est archivée
    await page.getByRole('button', { name: /^Toutes/ }).click();
    await expect(page.getByRole('link', { name: 'Assistante administrative' })).toHaveCount(1);
    await page.getByRole('button', { name: /^Archivées · 1/ }).click();
    await expect(offers(page)).toHaveCount(1);
    await expect(offers(page)).toContainText('Agence Mistral');
    await offers(page).getByRole('button', { name: 'Ressortir' }).click();
    await expect(offers(page)).toHaveCount(0);

    // Tri par date : l'offre la plus récente d'abord
    await page.getByRole('button', { name: /^Toutes · 6/ }).click();
    await page.getByLabel('Trier par').selectOption('date');
    await expect(offers(page).first()).toContainText('Assistante');
  });
});

test.describe('Candidature de bout en bout', () => {
  test('analyse, CV adapté, lettre, envoi par e-mail, suivi', async ({ page }) => {
    await onboard(page);
    await analysed(page);

    // Détail de l'offre
    await page.getByRole('link', { name: 'Assistante administrative' }).click();
    await expect(page.getByRole('heading', { name: 'Très bon match' })).toBeVisible();
    await expect(page.getByText('5 ans en accueil et administratif (3 ans demandés)')).toBeVisible();
    await expect(page.getByText('Sage n’apparaît pas', { exact: false }).or(page.getByText("Sage n'apparaît pas", { exact: false }))).toBeVisible();
    await page.getByRole('button', { name: 'Préparer ma candidature' }).first().click();

    // Étape 1 : CV adapté
    await expect(page.getByRole('heading', { name: 'Préparer la candidature' })).toBeVisible();
    await expect(page.getByTestId('cv-change')).toHaveCount(4);
    const adapted = page.getByRole('region', { name: 'Version adaptée' });
    await expect(adapted).toContainText("5 ans d'expérience en accueil, gestion d'agenda et facturation");
    await expect(adapted).toContainText('Classement et archivage numérique des dossiers');
    // Refuser l'accroche : la version adaptée garde l'originale
    await page.getByTestId('cv-change').filter({ hasText: 'Accroche réécrite' }).getByRole('button', { name: 'Refuser' }).click();
    await expect(adapted).toContainText('Personne motivée et polyvalente');
    // Modifier directement un texte dans l'aperçu
    await adapted.getByRole('button', { name: /Modifier la mission : Accueil physique et téléphonique/ }).click();
    await page.getByRole('textbox', { name: 'Modifier la mission', exact: true }).fill('Accueil physique et téléphonique (40 appels par jour)');
    await adapted.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(adapted).toContainText('(40 appels par jour)');
    await expect(page.getByTestId('cv-change')).toHaveCount(5);
    await expect(page.getByTestId('cv-change').last()).toContainText('Modifié à la main');
    await page.getByLabel('Modèle').selectOption('colonnes');
    await page.getByLabel('Modèle').selectOption('moderne');
    await page.getByRole('button', { name: 'Aperçu PDF' }).click();
    await expect.poll(() => mockState<number>(page, '(b) => b.documents.length')).toBe(1);

    // Étape 2 : lettre rédigée automatiquement, puis réécrite avec options
    await page.getByRole('button', { name: 'Suivant : la lettre →' }).click();
    const letter = page.getByLabel('Texte de la lettre');
    await expect(letter).toHaveValue(/agence immobilière à Lyon/);
    await page.getByRole('button', { name: 'Direct' }).click();
    await page.getByLabel('Consigne en plus').fill('Mentionne que je peux commencer en décembre');
    await page.getByRole('button', { name: 'Réécrire la lettre' }).click();
    await expect(letter).toHaveValue(/dès décembre/);
    await expect(letter).toHaveValue(/Cordialement,/);
    await page.getByRole('button', { name: 'Annuler la dernière réécriture' }).click();
    await expect(letter).not.toHaveValue(/dès décembre/);
    await page.getByRole('button', { name: 'Réécrire la lettre' }).click();
    await expect(letter).toHaveValue(/dès décembre/);

    // Étape 3 : envoi — d'abord bloqué tant que l'e-mail n'est pas configuré
    await page.getByRole('button', { name: "Suivant : l'envoi →" }).click();
    await expect(page.getByRole('radio', { name: /Envoyer depuis l’app|Envoyer depuis l'app/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText("Envoi depuis l'app pas encore configuré")).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer la candidature' })).toBeDisabled();
    await expect(page.getByLabel('À')).toHaveValue('recrutement@vauban-conseil.example');

    await page.getByRole('link', { name: "Régler l'envoi d'e-mails" }).click();
    await page.getByLabel('Adresse', { exact: true }).fill('camille.martin@exemple.fr');
    await page.getByLabel('Nom affiché').fill('Camille Martin');
    await page.getByLabel("Mot de passe d'application").fill('app-password');
    await page.getByRole('region', { name: "Envoi d'e-mails" }).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('region', { name: "Envoi d'e-mails" }).getByText('● Configurée')).toBeVisible();
    await page.goBack();

    await expect(page.getByRole('heading', { name: 'Préparer la candidature' })).toBeVisible();
    await page.getByLabel("J'ai relu le CV adapté").check();
    await page.getByLabel("J'ai relu la lettre").check();
    await page.getByRole('button', { name: 'Envoyer la candidature' }).click();

    // Suivi
    await expect(page.getByRole('heading', { name: 'Candidatures', exact: true })).toBeVisible();
    await expect(page.getByTestId('stat-sent')).toHaveText('1');
    await expect(page.getByTestId('col-sent').getByTestId('app-card')).toContainText('Cabinet Vauban Conseil');

    const outbox = await mockState<any[]>(page, '(b) => b.outbox');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].mail.to).toBe('recrutement@vauban-conseil.example');
    expect(outbox[0].mail.subject).toBe('Candidature — Assistante administrative');
    expect(outbox[0].mail.attachments.map((a: any) => a.filename)).toEqual([
      'CV_Camille_Martin_Cabinet_Vauban_Conseil.pdf',
      'Lettre_Camille_Martin_Cabinet_Vauban_Conseil.pdf'
    ]);
    expect(outbox[0].smtp).toMatchObject({ host: 'smtp.gmail.com', port: 587, username: 'camille.martin@exemple.fr' });

    // Statistiques
    await expect(page.getByRole('region', { name: 'Statistiques' }).getByTestId('stats-row').first()).toContainText('Toutes1');

    // Les PDF sont rangés dans Mes documents
    await page.getByRole('link', { name: 'Mes documents' }).click();
    await expect(page.getByRole('region', { name: 'Documents générés' })).toContainText('Cabinet Vauban Conseil');
  });

  test('offre sans e-mail : postuler sur le site puis ajouter au suivi', async ({ page }) => {
    await onboard(page);
    await analysed(page);
    await page.getByRole('link', { name: "Chargée d'accueil" }).click();
    await page.getByRole('button', { name: 'Préparer ma candidature' }).first().click();
    await expect(page.getByTestId('cv-change')).toHaveCount(4);
    await expect(page.getByRole('region', { name: 'Version adaptée' })).toContainText("Chargée d'accueil avec 5 ans");
    await page.getByRole('link', { name: '3. Envoi' }).click();
    await expect(page.getByRole('radio', { name: /Postuler sur le site/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Enregistrer les PDF' }).click();
    await expect.poll(() => mockState<string[]>(page, '(b) => b.opened.filter((u) => u.startsWith("reveal:"))')).toHaveLength(1);
    await page.getByRole('button', { name: /Ouvrir le formulaire/ }).click();
    const opened = await mockState<string[]>(page, '(b) => b.opened');
    expect(opened).toContain('https://www.adzuna.fr/details/4455102');
    await page.getByRole('button', { name: "C'est envoyé, ajouter au suivi" }).click();
    await expect(page.getByTestId('col-sent')).toContainText('Clinique des Tilleuls');
  });
});

test.describe('Suivi des candidatures', () => {
  test('relance préparée par Claude, changement de statut, glisser-déposer', async ({ page }) => {
    await onboard(page);
    await analysed(page);

    // Une candidature faite ailleurs, envoyée il y a 9 jours
    await page.getByRole('link', { name: /Candidatures/ }).click();
    await page.getByRole('button', { name: 'Ajouter une candidature faite ailleurs' }).click();
    await page.getByLabel('Poste').fill('Assistante de gestion');
    await page.getByLabel('Entreprise').fill('Atelier Brunel');
    await page.getByLabel('E-mail du recruteur').fill('contact@brunel.example');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await expect(page.getByTestId('col-sent')).toContainText('Atelier Brunel');

    // On vieillit la candidature pour déclencher la relance
    await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('boing-mock-db')!);
      for (const v of Object.values<any>(db.applications)) {
        const old = new Date(Date.now() - 9 * 86400_000).toISOString();
        v.data.sentAt = old;
        v.data.followUpAt = new Date(Date.now() - 2 * 86400_000).toISOString();
      }
      localStorage.setItem('boing-mock-db', JSON.stringify(db));
    });
    await page.reload();
    await expect(page.getByText('Atelier Brunel : envoyée')).toBeVisible();
    await expect(page.getByRole('link', { name: /Candidatures.*1 relance/ })).toBeVisible();

    // Relance
    await page.getByRole('button', { name: 'Préparer la relance' }).click();
    const dialog = page.getByRole('dialog', { name: /Relance/ });
    await expect(dialog.getByLabel('Message')).toHaveValue(/Je me permets de revenir vers vous/);
    await dialog.getByRole('button', { name: 'Ouvrir dans ma messagerie' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('col-followup')).toContainText('Atelier Brunel');
    const opened = await mockState<string[]>(page, '(b) => b.opened');
    expect(opened.some((u) => u.startsWith('mailto:contact%40brunel.example?subject=Relance'))).toBe(true);

    // Changement de statut par la liste
    await page.getByLabel('Statut de « Assistante de gestion »').selectOption('interview');
    await expect(page.getByTestId('col-interview')).toContainText('Atelier Brunel');
    await page.getByLabel("Date de l'entretien").fill('2026-11-20T10:00');

    // Glisser-déposer vers Clôturée
    await page.getByTestId('app-card').filter({ hasText: 'Atelier Brunel' }).dragTo(page.getByTestId('col-closed'));
    await expect(page.getByTestId('col-closed')).toContainText('Atelier Brunel');
    await page.getByLabel('Issue').selectOption('refus');
    await expect(page.getByLabel('Issue')).toHaveValue('refus');
  });
});

test.describe('Mes documents et paramètres', () => {
  test('fiche profil, recherches, lettres modèles', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Mes documents' }).click();

    // Ajouter une compétence confirmée
    await page.getByRole('region', { name: 'Fiche profil' }).getByRole('button', { name: 'Modifier' }).click();
    const dialog = page.getByRole('dialog', { name: 'Fiche profil' });
    await dialog.getByLabel("Compétences confirmées (Claude n'utilise que celles-ci)").fill('Sage');
    await dialog.getByLabel("Compétences confirmées (Claude n'utilise que celles-ci)").press('Enter');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('region', { name: 'Fiche profil' })).toContainText('Sage');

    // Nouvelle recherche
    await page.getByRole('region', { name: 'Recherches enregistrées' }).getByRole('button', { name: 'Nouvelle' }).click();
    const sd = page.getByRole('dialog', { name: 'Recherche' });
    await sd.getByLabel('Nom').fill('Secrétariat médical');
    await sd.getByLabel('Métiers visés').fill('Secrétaire médicale');
    await sd.getByLabel('Métiers visés').press('Enter');
    await sd.getByRole('button', { name: 'Temps partiel' }).click();
    await sd.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('region', { name: 'Recherches enregistrées' })).toContainText('Secrétariat médical');

    // Lettre modèle
    await page.getByRole('region', { name: 'Lettres modèles' }).getByRole('button', { name: 'Nouvelle' }).click();
    const ld = page.getByRole('dialog', { name: 'Lettre modèle' });
    await ld.getByLabel('Nom').fill('Lettre accueil');
    await ld.getByLabel('Texte').fill('Madame, Monsieur,\n\nMa lettre type.');
    await ld.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('region', { name: 'Lettres modèles' })).toContainText('Par défaut');

    // La nouvelle recherche ramène l'offre à temps partiel
    await page.getByRole('link', { name: /^Offres/ }).click();
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.getByRole('link', { name: 'Secrétaire médicale' })).toBeVisible();
  });

  test('clés : statut sans jamais réafficher la valeur, retrait, tout effacer', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Paramètres' }).click();
    const keys = page.getByRole('region', { name: 'Clés API' });
    await expect(keys.getByLabel('Clé API', { exact: true })).toHaveValue('');
    await expect(keys.getByLabel('Clé API', { exact: true })).toHaveAttribute('placeholder', /enregistrée/);
    await keys.getByRole('button', { name: 'Tester' }).click();
    await expect(page.getByText('Connexion à Claude réussie').or(page.getByText('Claude a répondu'))).toBeVisible();

    await keys.getByRole('button', { name: 'Retirer' }).first().click();
    await expect(keys.getByText('○ Non configurée').first()).toBeVisible();

    await page.getByRole('button', { name: 'Tout effacer' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tout effacer' }).click();
    await expect(page.getByRole('heading', { name: 'Bienvenue sur Boing' })).toBeVisible();
  });

  test('connexion Gmail sans mot de passe d’application', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Paramètres' }).click();
    const mail = page.getByRole('region', { name: "Envoi d'e-mails" });
    await mail.getByLabel('Adresse', { exact: true }).fill('camille.martin@gmail.com');
    await mail.getByRole('radio', { name: 'Se connecter avec Google' }).click();
    await expect(mail.getByLabel("Mot de passe d'application")).toHaveCount(0);
    // Sans identifiant d'application : message clair
    await mail.getByRole('button', { name: 'Se connecter avec Google' }).last().click();
    await expect(page.getByText("Identifiant d'application OAuth manquant")).toBeVisible();
    await mail.getByText("Identifiants de l'application").click();
    await mail.getByLabel('Identifiant client OAuth').fill('123.apps.googleusercontent.com');
    await mail.getByRole('button', { name: 'Se connecter avec Google' }).last().click();
    await expect(mail.getByText('● Compte connecté')).toBeVisible();
    await expect(mail.getByText('● Configurée')).toBeVisible();
    await mail.getByRole('button', { name: "M'envoyer un e-mail de test" }).click();
    await expect(page.getByText('E-mail de test envoyé')).toBeVisible();
    const outbox = await mockState<any[]>(page, '(b) => b.outbox');
    expect(outbox[0].smtp).toMatchObject({ auth: 'oauth', provider: 'gmail', oauthClientId: '123.apps.googleusercontent.com' });
  });

  test('les données sont chiffrées sur le disque', async ({ page }) => {
    await onboard(page);
    await page.getByRole('link', { name: 'Paramètres' }).click();
    await expect(page.getByTestId('encrypted')).toContainText('chiffrés (AES-256)');
  });

  test('les données restent après un redémarrage', async ({ page }) => {
    await onboard(page);
    await analysed(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Offres', exact: true })).toBeVisible();
    await expect(offers(page)).toHaveCount(6);
    await expect(offers(page).first().getByRole('img', { name: 'Match 92 %' })).toBeVisible();
  });
});

test('premier écran sans erreur console', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await fresh(page);
  expect(errors).toEqual([]);
});
