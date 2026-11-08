// Données d'exemple pour le mode navigateur (dev et tests). Entreprises fictives.
import type { Commune, Offer } from '../types';

const today = new Date();
const daysAgo = (d: number, h = 9) => {
  const x = new Date(today);
  x.setDate(x.getDate() - d);
  x.setHours(h, 0, 0, 0);
  return x.toISOString();
};

type Raw = Omit<Offer, 'skills' | 'sourceId' | 'source'> & { skills?: string[] };

const raw: Raw[] = [
  {
    id: 'ft-178KQZX',
    title: 'Assistante administrative (H/F)',
    company: 'Cabinet Vauban Conseil',
    location: '69 - Lyon 3e Arrondissement',
    postalCode: '69003',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps plein',
    salary: 'Annuel de 24 000 € à 27 000 €',
    experience: '3 ans',
    applyEmail: 'recrutement@vauban-conseil.example',
    publishedAt: daysAgo(0, 7),
    skills: ['Gérer un agenda', 'Facturation', 'Accueil téléphonique'],
    description: `Cabinet de conseil de 25 personnes, nous recherchons une assistante administrative pour épauler l'équipe de direction au quotidien.

Missions :
- Accueil physique et téléphonique des clients
- Gestion des agendas et organisation des déplacements
- Préparation des devis et suivi de la facturation
- Classement et archivage numérique

Profil :
- 3 ans d'expérience minimum sur un poste similaire
- Maîtrise du Pack Office, Excel en particulier
- Une connaissance de Sage est un plus
- Rigueur, discrétion, sens du service

Lundi au vendredi, tickets restaurant, mutuelle prise en charge à 50 %. Accès métro D.`
  },
  {
    id: 'az-4455102',
    title: "Chargée d'accueil",
    company: 'Clinique des Tilleuls',
    location: 'Villeurbanne, Rhône',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps plein',
    salary: '22 000 – 24 000 € / an',
    applyUrl: 'https://www.adzuna.fr/details/4455102',
    publishedAt: daysAgo(1),
    description: `La Clinique des Tilleuls recrute une chargée d'accueil pour son accueil principal. Vous accueillez patients et visiteurs, gérez le standard téléphonique (40 postes), orientez les patients vers les services et assurez la prise de rendez-vous. Vous gérez aussi le courrier entrant et sortant. Une première expérience en accueil est demandée ; le milieu médical n'est pas obligatoire. Horaires en journée, du lundi au vendredi.`
  },
  {
    id: 'ft-179ABCD',
    title: 'Assistante RH (H/F)',
    company: 'Groupe Hélia',
    location: '69 - Lyon 7e Arrondissement',
    postalCode: '69007',
    contract: 'CDD',
    contractLabel: 'CDD - 6 mois',
    workingTime: 'Temps plein',
    salary: 'Mensuel de 2 100 €',
    experience: '2 ans',
    applyEmail: 'rh@groupe-helia.example',
    publishedAt: daysAgo(2),
    skills: ['Gestion administrative du personnel', 'Suivi des absences'],
    description: `Au sein du service RH (5 personnes), vous assurez la gestion administrative du personnel : préparation des contrats, suivi des absences et des congés, organisation des visites médicales, classement des dossiers salariés. Vous êtes le premier contact des salariés pour leurs questions administratives. Maîtrise d'Excel indispensable. Une première expérience en RH est un plus.`
  },
  {
    id: 'ft-179EFGH',
    title: 'Secrétaire médicale (H/F)',
    company: 'Centre de santé Bellecour',
    location: '69 - Lyon 2e Arrondissement',
    postalCode: '69002',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps partiel',
    salary: 'Horaire de 12,50 €',
    experience: '1 an',
    applyEmail: 'contact@cds-bellecour.example',
    publishedAt: daysAgo(3),
    skills: ['Terminologie médicale', 'Prise de rendez-vous'],
    description: `Centre de santé pluridisciplinaire, nous recherchons une secrétaire médicale à 28 h par semaine. Accueil des patients, prise de rendez-vous sur Doctolib, frappe de comptes rendus, gestion du tiers payant. La connaissance de la terminologie médicale est indispensable.`
  },
  {
    id: 'az-4455300',
    title: 'Gestionnaire de paie',
    company: 'Ardent Logistique',
    location: 'Vénissieux, Rhône',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps plein',
    salary: '32 000 – 36 000 € / an',
    applyUrl: 'https://www.adzuna.fr/details/4455300',
    publishedAt: daysAgo(4),
    description: `Vous gérez la paie de 300 salariés (logistique, conventions transport) sur Silae, les déclarations sociales (DSN) et les relations avec les organismes. Diplôme en paie (Bac +2/3) et 3 ans d'expérience en paie exigés.`
  },
  {
    id: 'ft-179IJKL',
    title: 'Assistante commerciale (H/F)',
    company: 'Orio Distribution',
    location: '69 - Saint-Priest',
    postalCode: '69800',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps plein',
    salary: 'Annuel de 25 000 €',
    experience: '2 ans',
    applyEmail: 'emploi@orio-distribution.example',
    publishedAt: daysAgo(0, 8),
    skills: ['Établir un devis', 'Saisie de commandes'],
    description: `Distributeur de matériel de bureau, nous recherchons une assistante commerciale. Vous saisissez les commandes, établissez les devis, suivez les livraisons et la facturation, et répondez aux clients par téléphone et par e-mail. Excel courant. Expérience de 2 ans en assistanat.`
  },
  {
    id: 'ft-179MNOP',
    title: "Hôtesse d'accueil en entreprise (H/F)",
    company: 'Siège Lumen',
    location: '69 - Lyon 9e Arrondissement',
    postalCode: '69009',
    contract: 'CDD',
    contractLabel: 'CDD - 12 mois',
    workingTime: 'Temps plein',
    salary: 'Mensuel de 1 950 €',
    experience: '1 an',
    applyEmail: 'accueil.recrutement@lumen.example',
    publishedAt: daysAgo(1),
    skills: ['Accueil physique', 'Standard téléphonique'],
    description: `Au siège de Lumen (600 collaborateurs), vous accueillez les visiteurs, gérez le standard, les badges et les réservations de salles. Anglais apprécié pour les visiteurs internationaux. Présentation soignée, sens du service.`
  },
  {
    id: 'ft-179QRST',
    title: 'Assistante de direction (H/F)',
    company: 'Atelier Rive Gauche',
    location: '69 - Lyon 6e Arrondissement',
    postalCode: '69006',
    contract: 'CDI',
    contractLabel: 'CDI',
    workingTime: 'Temps plein',
    salary: 'Annuel de 28 000 € à 30 000 €',
    experience: '3 ans',
    applyEmail: 'direction@atelier-rivegauche.example',
    publishedAt: daysAgo(2),
    skills: ['Gérer un agenda', 'Organiser des déplacements'],
    description: `Agence d'architecture de 15 personnes. Vous assistez les deux associés : gestion de leurs agendas, organisation des déplacements, préparation des réunions, suivi administratif des projets et de la facturation. Vous êtes à l'aise avec Excel et Outlook. Anglais professionnel souhaité.`
  },
  {
    id: 'ft-179UVWX',
    title: "Agent d'accueil (H/F) - Intérim",
    company: 'Proxi Intérim',
    location: '69 - Lyon 8e Arrondissement',
    postalCode: '69008',
    contract: 'MIS',
    contractLabel: 'Mission intérimaire - 1 mois',
    workingTime: 'Temps plein',
    salary: 'Horaire de 12,02 €',
    applyEmail: 'lyon8@proxi-interim.example',
    publishedAt: daysAgo(0, 6),
    description: `Mission d'un mois pour un client industriel : accueil des visiteurs et des transporteurs, standard téléphonique.`
  },
  {
    id: 'ft-179YZAB',
    title: 'Secrétaire polyvalente (H/F)',
    company: 'Mairie de Caluire-et-Cuire',
    location: '69 - Caluire-et-Cuire',
    postalCode: '69300',
    contract: 'CDD',
    contractLabel: 'CDD - 6 mois',
    workingTime: 'Temps plein',
    salary: 'Mensuel de 1 900 €',
    experience: '2 ans',
    applyEmail: 'drh@ville-caluire.example',
    publishedAt: daysAgo(5),
    skills: ['Gestion du courrier', 'Accueil du public'],
    description: `Au sein du service population, vous accueillez le public, gérez le courrier, tenez les agendas des élus et assurez le classement et l'archivage des dossiers. Maîtrise de Word et Excel.`
  }
];

export const FIXTURE_OFFERS: Offer[] = raw.map((o) => ({
  ...o,
  skills: o.skills ?? [],
  source: o.id.startsWith('ft-') ? 'France Travail' : 'Adzuna',
  sourceId: o.id.slice(3),
  url:
    o.id.startsWith('ft-')
      ? `https://candidat.francetravail.fr/offres/recherche/detail/${o.id.slice(3)}`
      : (o.applyUrl ?? null)
}));

export const FIXTURE_COMMUNES: Commune[] = [
  { name: 'Lyon', insee: '69123', postalCode: '69001', department: '69' },
  { name: 'Lyons-la-Forêt', insee: '27377', postalCode: '27480', department: '27' },
  { name: 'Villeurbanne', insee: '69266', postalCode: '69100', department: '69' },
  { name: 'Paris', insee: '75056', postalCode: '75001', department: '75' },
  { name: 'Marseille', insee: '13055', postalCode: '13001', department: '13' },
  { name: 'Lille', insee: '59350', postalCode: '59000', department: '59' },
  { name: 'Toulouse', insee: '31555', postalCode: '31000', department: '31' },
  { name: 'Bordeaux', insee: '33063', postalCode: '33000', department: '33' },
  { name: 'Nantes', insee: '44109', postalCode: '44000', department: '44' }
];

/** Texte du CV d'exemple (utilisé par les tests et pour essayer l'app sans CV). */
export const SAMPLE_CV_TEXT = `Camille Martin
Assistante administrative
Lyon · 06 12 34 56 78 · camille.martin@exemple.fr · Permis B

PROFIL
Personne motivée et polyvalente, à la recherche d'un nouveau défi.

EXPÉRIENCE
Assistante d'accueil — Agence Orée (immobilier), Lyon — 2021 à aujourd'hui
- Accueil physique et téléphonique
- Gestion du courrier
- Aide à la facturation
- Gestion de l'agenda du directeur d'agence

Hôtesse d'accueil — Groupe Lumière Événements, Lyon — 2019 à 2021
- Accueil des visiteurs sur salons professionnels
- Standard téléphonique
- Préparation des badges et des listes d'invités

FORMATION
BTS Support à l'action managériale — Lycée Ampère, Lyon — 2019
Bac STMG — Lycée Jean Moulin, Lyon — 2017

COMPÉTENCES
Word, Excel, Outlook, standard téléphonique, accueil physique, gestion d'agenda, facturation, devis, archivage numérique, gestion du courrier

LANGUES
Anglais (B2)

Disponibilité : immédiate`;
