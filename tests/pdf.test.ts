import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { pdfSafe, renderCv, renderLetter } from '../src/lib/pdf/render';

describe('PDF', () => {
  it('nettoie les caractères hors alphabet latin', () => {
    expect(pdfSafe('Prêt ≈ 5 ans → oui !')).toBe('Prêt ~ 5 ans -> oui !');
    expect(pdfSafe('œuvre — « ok »')).toBe('œuvre — « ok »');
  });

  it('génère un CV et une lettre lisibles', async () => {
    const bytes = await renderCv({
      fullName: 'Camille Martin',
      title: 'Assistante administrative',
      contact: ['Lyon', 'camille@exemple.fr'],
      summary: "5 ans d'expérience en accueil.",
      experiences: Array.from({ length: 8 }, (_, i) => ({ role: `Poste ${i}`, company: 'Société', start: '2020', end: '2021', bullets: ['Accueil', 'Facturation et devis'] })),
      education: [{ degree: 'BTS', school: 'Lycée', year: '2019' }],
      skills: ['Excel', 'Word'],
      languages: ['Anglais (B2)']
    }, 'moderne');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain('Camille Martin');

    const cols = await PDFDocument.load(await renderCv({
      fullName: 'Léa Moreau', title: 'Concept artist', contact: ['Lyon'], summary: 'Accroche.',
      experiences: [{ role: 'Freelance', company: 'Jeux', start: '2023', end: "Aujourd'hui", bullets: ['Environnements'] }],
      education: [], skills: ['Photoshop'], languages: ['Anglais (C1)']
    }, 'colonnes'));
    expect(cols.getPageCount()).toBe(1);

    const letter = await renderLetter({ senderName: 'Camille', senderLines: ['Lyon'], recipient: ['Cabinet'], date: 'Lyon, le 8 novembre 2026', subject: 'candidature' }, 'Madame, Monsieur,\n\nTexte.\n\nCordialement,');
    expect((await PDFDocument.load(letter)).getPageCount()).toBe(1);
  });
});
