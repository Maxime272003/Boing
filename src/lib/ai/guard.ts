// Garde-fous sur ce que Claude rédige : une offre piégée pourrait tenter de lui faire
// glisser un lien, une adresse ou un numéro. On signale tout ce qui ne vient pas du profil ou de l'offre.
import type { Offer, Profile } from '../types';

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE_RE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/g;
const SUSPICIOUS = /ignore[rz]? (?:les|tes|vos|toutes les) (?:consignes|instructions)|en tant qu['’](?:ia|assistant)|mod[eè]le de langage|\bprompt\b/i;

const digits = (s: string) => s.replace(/\D/g, '').replace(/^33/, '0');

export function allowedRefs(profile: Profile, offer: Offer) {
  const emails = new Set([profile.email, offer.applyEmail].filter(Boolean).map((e) => e!.toLowerCase()));
  const phones = new Set([profile.phone].filter(Boolean).map(digits));
  const hosts = new Set(
    [offer.url, offer.applyUrl]
      .filter(Boolean)
      .map((u) => {
        try {
          return new URL(u!).host.replace(/^www\./, '');
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  );
  return { emails, phones, hosts };
}

/** Liste des éléments inattendus dans un texte rédigé par Claude (vide si tout va bien). */
export function findUnexpected(text: string, profile: Profile, offer: Offer): string[] {
  const { emails, phones, hosts } = allowedRefs(profile, offer);
  const issues: string[] = [];
  for (const m of text.match(EMAIL_RE) ?? []) {
    if (!emails.has(m.toLowerCase())) issues.push(`adresse e-mail inconnue : ${m}`);
  }
  for (const m of text.match(URL_RE) ?? []) {
    const host = m.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].toLowerCase();
    if (!hosts.has(host)) issues.push(`lien inattendu : ${m}`);
  }
  for (const m of text.match(PHONE_RE) ?? []) {
    if (!phones.has(digits(m))) issues.push(`numéro inconnu : ${m}`);
  }
  if (SUSPICIOUS.test(text)) issues.push('formulation inhabituelle (consigne, IA…) : relis le texte');
  return [...new Set(issues)];
}
