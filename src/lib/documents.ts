// Fabrication et enregistrement des PDF d'une candidature.
import { applyChanges, fullName } from './cv';
import { renderCv, renderLetter } from './pdf/render';
import { posteDe, slug } from './format';
import type { Application, Profile } from './types';
import type { Backend } from './backend';

export function fileNames(app: Application, p: Profile) {
  const who = slug(fullName(p)) || 'Candidature';
  const co = slug(app.offer.company) || 'entreprise';
  return { cv: `CV_${who}_${co}.pdf`, letter: `Lettre_${who}_${co}.pdf`, folder: `${co}_${app.id.slice(-5)}` };
}

export async function cvPdf(app: Application, p: Profile): Promise<Uint8Array> {
  return renderCv(applyChanges(p, app.cvChanges), app.cvTemplate);
}

export async function letterPdf(app: Application, p: Profile): Promise<Uint8Array> {
  return renderLetter(
    {
      senderName: fullName(p),
      senderLines: [p.city, p.phone, p.email],
      recipient: [app.offer.company, 'Service recrutement'],
      date: `${p.city ? `${p.city}, le ` : 'Le '}${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      subject: `candidature au poste ${posteDe(app.offer.title)}`
    },
    app.letter
  );
}

/** Génère les deux PDF, les enregistre dans le dossier de l'app et renvoie leurs chemins et contenus. */
export async function buildFiles(backend: Backend, app: Application, p: Profile) {
  const names = fileNames(app, p);
  const [cvBytes, letterBytes] = await Promise.all([cvPdf(app, p), app.letter ? letterPdf(app, p) : Promise.resolve(null)]);
  const cvPath = await backend.saveDocument(names.folder, names.cv, cvBytes);
  const letterPath = letterBytes ? await backend.saveDocument(names.folder, names.letter, letterBytes) : undefined;
  return { names, cvBytes, letterBytes, cvPath, letterPath };
}
