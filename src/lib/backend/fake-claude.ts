// « Claude simulé » : en mode navigateur (dev, tests), ces réponses remplacent l'API.
// Elles ont été rédigées à la main, dans le format exact que l'app demande à Claude,
// pour les offres d'exemple. Pour une offre inconnue, une réponse générique est construite.

import { taskOf } from '../ai/prompts';
import type { Completion, CompletionRequest } from '../types';

type Json = Record<string, any>;

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// ---------- parse_cv ----------

const CAMILLE = {
  firstName: 'Camille',
  lastName: 'Martin',
  title: 'Assistante administrative',
  email: 'camille.martin@exemple.fr',
  phone: '06 12 34 56 78',
  city: 'Lyon',
  summary: "Personne motivée et polyvalente, à la recherche d'un nouveau défi.",
  experiences: [
    {
      role: "Assistante d'accueil",
      company: 'Agence Orée (immobilier)',
      start: '2021',
      end: "Aujourd'hui",
      bullets: ['Accueil physique et téléphonique', 'Gestion du courrier', 'Aide à la facturation', "Gestion de l'agenda du directeur d'agence"]
    },
    {
      role: "Hôtesse d'accueil",
      company: 'Groupe Lumière Événements',
      start: '2019',
      end: '2021',
      bullets: ['Accueil des visiteurs sur salons professionnels', 'Standard téléphonique', "Préparation des badges et des listes d'invités"]
    }
  ],
  education: [
    { degree: "BTS Support à l'action managériale", school: 'Lycée Ampère, Lyon', year: '2019' },
    { degree: 'Bac STMG', school: 'Lycée Jean Moulin, Lyon', year: '2017' }
  ],
  skills: [
    'Word',
    'Excel',
    'Outlook',
    'Standard téléphonique',
    'Accueil physique',
    "Gestion d'agenda",
    'Facturation',
    'Devis',
    'Archivage numérique',
    'Gestion du courrier'
  ],
  languages: ['Anglais (B2)'],
  availability: 'Immédiate',
  drivingLicense: true,
  suggestedJobs: ['Assistante administrative', "Chargée d'accueil", 'Assistante de direction', 'Secrétaire']
};

function parseCv(p: Json) {
  const text: string = p.cvText ?? '';
  if (/camille\s+martin/i.test(text)) return CAMILLE;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const [first = '', ...rest] = (lines[0] ?? '').split(/\s+/);
  return {
    firstName: first,
    lastName: rest.join(' '),
    title: lines[1] ?? '',
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? '',
    phone: text.match(/0\d(?:[ .]?\d{2}){4}/)?.[0] ?? '',
    city: '',
    summary: '',
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    availability: '',
    drivingLicense: /permis b/i.test(text),
    suggestedJobs: lines[1] ? [lines[1]] : []
  };
}

// ---------- analyse ----------

const ANALYSES: Record<string, Json> = {
  'Cabinet Vauban Conseil': {
    score: 92,
    verdict: 'Très bon match',
    summary: "Ton expérience d'accueil et d'administratif auprès d'une direction correspond presque point par point au poste.",
    strengths: [
      '5 ans en accueil et administratif (3 ans demandés)',
      'Facturation et devis déjà pratiqués chez Agence Orée',
      "Gestion de l'agenda d'un directeur, comme demandé ici"
    ],
    gaps: ["Sage n'apparaît pas sur ton CV : à ajouter seulement si tu l'as déjà utilisé", "Ton niveau sur Excel n'est pas précisé"],
    keywords: ['facturation', 'devis', 'archivage numérique', 'Excel', 'agenda']
  },
  'Clinique des Tilleuls': {
    score: 86,
    verdict: 'Très bon match',
    summary: "Standard, accueil physique et courrier : c'est exactement ce que tu fais depuis cinq ans.",
    strengths: [
      'Standard téléphonique tenu en agence et en événementiel',
      "Accueil physique du public depuis 2019",
      'Gestion du courrier déjà dans tes missions'
    ],
    gaps: ["La prise de rendez-vous n'apparaît pas clairement sur ton CV"],
    keywords: ['accueil', 'standard téléphonique', 'orientation', 'courrier']
  },
  'Groupe Hélia': {
    score: 74,
    verdict: 'Bon match',
    summary: 'Bon socle administratif, mais pas encore d’expérience en ressources humaines.',
    strengths: ['BTS Support à l’action managériale', 'Classement et archivage numérique', 'Excel au quotidien'],
    gaps: ['Le suivi des absences et des congés n’apparaît pas sur ton CV', 'Pas d’expérience RH à proprement parler'],
    keywords: ['gestion administrative', 'dossiers salariés', 'Excel', 'classement']
  },
  'Centre de santé Bellecour': {
    score: 63,
    verdict: 'Match correct',
    summary: 'Accueil et rendez-vous vont bien, mais la terminologie médicale est indispensable.',
    strengths: ['Accueil physique et téléphonique', "Gestion d'agenda"],
    gaps: ['Terminologie médicale demandée, absente de ton CV', 'Pas d’expérience de Doctolib ni du tiers payant', 'Poste à temps partiel (28 h)'],
    keywords: ['accueil des patients', 'prise de rendez-vous', 'Doctolib']
  },
  'Ardent Logistique': {
    score: 41,
    verdict: 'Match faible',
    summary: 'Poste spécialisé en paie, assez éloigné de ton parcours.',
    strengths: ['Rigueur administrative', 'Excel'],
    gaps: ['Diplôme en paie exigé', '3 ans d’expérience en paie demandés', 'Logiciel Silae et DSN non pratiqués'],
    keywords: ['paie', 'DSN', 'Silae']
  },
  'Orio Distribution': {
    score: 78,
    verdict: 'Bon match',
    summary: 'Devis et facturation te sont familiers ; la saisie de commandes serait nouvelle.',
    strengths: ['Devis et facturation chez Agence Orée', 'Relation client au téléphone', 'Excel'],
    gaps: ["La saisie de commandes et le suivi des livraisons n'apparaissent pas sur ton CV"],
    keywords: ['devis', 'facturation', 'relation client', 'Excel']
  },
  'Siège Lumen': {
    score: 81,
    verdict: 'Bon match',
    summary: 'Accueil de visiteurs, standard et badges : ton expérience en événementiel colle bien.',
    strengths: ['Préparation des badges et listes d’invités', 'Standard téléphonique', 'Anglais B2 pour les visiteurs internationaux'],
    gaps: ['CDD de 12 mois alors que tu vises aussi du CDI'],
    keywords: ['accueil des visiteurs', 'standard', 'badges', 'anglais']
  },
  'Atelier Rive Gauche': {
    score: 83,
    verdict: 'Bon match',
    summary: "Tu gères déjà l'agenda d'un directeur et la facturation ; l'organisation des déplacements serait à mettre en avant si tu l'as fait.",
    strengths: ["Gestion de l'agenda du directeur d'agence", 'Facturation', 'Excel et Outlook', 'Anglais B2'],
    gaps: ["L'organisation de déplacements n'apparaît pas sur ton CV"],
    keywords: ['agenda', 'facturation', 'Outlook', 'anglais']
  },
  'Mairie de Caluire-et-Cuire': {
    score: 80,
    verdict: 'Bon match',
    summary: 'Accueil du public, courrier et archivage : trois missions que tu as déjà assurées.',
    strengths: ['Accueil du public depuis 2019', 'Gestion du courrier', 'Archivage numérique'],
    gaps: ['Pas d’expérience dans la fonction publique (ce n’est pas demandé)'],
    keywords: ['accueil du public', 'courrier', 'archivage', 'agenda']
  },
  'Proxi Intérim': {
    score: 70,
    verdict: 'Bon match',
    summary: 'Accueil et standard : ton cœur de métier, mais pour une mission d’un mois seulement.',
    strengths: ['Accueil des visiteurs', 'Standard téléphonique'],
    gaps: ['Mission courte en intérim'],
    keywords: ['accueil', 'standard']
  }
};

function genericAnalysis(p: Json) {
  const text = norm(`${p.offer?.title ?? ''} ${p.offer?.description ?? ''} ${(p.offer?.skills ?? []).join(' ')}`);
  const skills: string[] = p.profile?.skills ?? [];
  const found = skills.filter((s) => text.includes(norm(s)));
  const score = Math.min(88, 35 + found.length * 12);
  return {
    score,
    verdict: score >= 85 ? 'Très bon match' : score >= 70 ? 'Bon match' : score >= 50 ? 'Match correct' : 'Match faible',
    summary: found.length
      ? `L'offre cite ${found.slice(0, 2).join(' et ')}, que tu maîtrises.`
      : "Peu de points communs entre l'offre et ton CV.",
    strengths: found.slice(0, 3).map((s) => `${s} : présent sur ton CV et demandé dans l'offre`),
    gaps: found.length ? [] : ["Les compétences demandées n'apparaissent pas sur ton CV"],
    keywords: found.slice(0, 5)
  };
}

// ---------- adapt_cv ----------

const ADAPTATIONS: Record<string, Json[]> = {
  'Cabinet Vauban Conseil': [
    {
      title: 'Accroche réécrite',
      why: "La phrase générique est remplacée par ton expérience concrète, alignée sur ce que l'offre décrit.",
      op: {
        kind: 'summary',
        value:
          "Assistante administrative avec 5 ans d'expérience en accueil, gestion d'agenda et facturation auprès d'une direction d'agence."
      }
    },
    {
      title: 'Facturation détaillée',
      why: "L'offre parle de « devis » et de « suivi de la facturation » : ta mission est décrite avec ces mots.",
      op: { kind: 'bullet', exp: 0, index: 2, value: 'Préparation des devis et suivi de la facturation clients' }
    },
    {
      title: 'Archivage numérique ajouté',
      why: "Compétence de ta fiche profil, demandée dans l'offre : elle apparaît maintenant dans ton expérience.",
      op: { kind: 'bullet', exp: 0, index: null, value: 'Classement et archivage numérique des dossiers' }
    },
    {
      title: 'Compétences réordonnées',
      why: "Excel, la facturation et l'agenda passent en tête : ce sont les attentes principales du poste.",
      op: { kind: 'skills', value: ['Excel', 'Facturation', 'Devis', "Gestion d'agenda", 'Archivage numérique', 'Standard téléphonique'] }
    }
  ],
  'Clinique des Tilleuls': [
    {
      title: 'Intitulé ajusté',
      why: "L'annonce recherche une « chargée d'accueil » : ton titre reprend ce mot.",
      op: { kind: 'title', value: "Chargée d'accueil" }
    },
    {
      title: 'Accroche réécrite',
      why: "Met en avant le standard et l'accueil du public, cœur du poste.",
      op: {
        kind: 'summary',
        value:
          "Chargée d'accueil avec 5 ans d'expérience : accueil du public, standard téléphonique et gestion du courrier, en agence et sur des salons."
      }
    },
    {
      title: 'Standard mis en avant',
      why: "Le standard de la clinique compte 40 postes : ta mission est formulée de façon plus précise.",
      op: { kind: 'bullet', exp: 1, index: 1, value: 'Tenue du standard téléphonique et orientation des appels' }
    },
    {
      title: 'Compétences réordonnées',
      why: "L'accueil et le standard passent en premier.",
      op: { kind: 'skills', value: ['Accueil physique', 'Standard téléphonique', 'Gestion du courrier', "Gestion d'agenda", 'Outlook'] }
    }
  ]
};

function genericAdaptation(p: Json) {
  const offerText = norm(`${p.offer?.title ?? ''} ${p.offer?.description ?? ''}`);
  const skills: string[] = p.profile?.skills ?? [];
  const ranked = [...skills].sort((a, b) => Number(offerText.includes(norm(b))) - Number(offerText.includes(norm(a))));
  const top = ranked.filter((s) => offerText.includes(norm(s))).slice(0, 3);
  const years = (p.profile?.experiences ?? []).length ? 'plusieurs années' : 'une première expérience';
  return [
    {
      title: 'Accroche réécrite',
      why: `Ton accroche reprend les attentes du poste de ${p.offer?.title ?? 'ce poste'}.`,
      op: {
        kind: 'summary',
        value: `${p.profile?.title || 'Professionnelle'} avec ${years} d'expérience${top.length ? ` en ${top.join(', ').toLowerCase()}` : ''}.`
      }
    },
    {
      title: 'Compétences réordonnées',
      why: "Les compétences citées dans l'offre passent en tête.",
      op: { kind: 'skills', value: ranked }
    }
  ];
}

// ---------- write_letter ----------

const LETTER_BODY: Record<string, string[]> = {
  'Cabinet Vauban Conseil': [
    "Depuis cinq ans, j'assure l'accueil et le suivi administratif d'une agence immobilière à Lyon. J'y gère l'agenda du directeur, le standard et, au quotidien, la préparation des devis et le suivi de la facturation.",
    "Votre annonce décrit un rôle de soutien à l'équipe de direction : c'est celui que j'occupe aujourd'hui et que j'aime. Rigoureuse et discrète, je sais organiser les priorités quand le téléphone sonne et qu'un client attend à l'accueil.",
    "Titulaire d'un BTS Support à l'action managériale, j'utilise Excel et Outlook tous les jours, et je classe et archive les dossiers sous format numérique."
  ],
  'Clinique des Tilleuls': [
    "Accueillir, orienter, rassurer : c'est ce que je fais depuis 2019, d'abord sur des salons professionnels puis à l'accueil d'une agence immobilière lyonnaise.",
    "Le standard téléphonique et l'accueil physique font partie de mon quotidien, tout comme la gestion du courrier. Je sais garder le sourire et la précision quand les appels s'enchaînent et que plusieurs personnes attendent.",
    "Votre clinique accueille un public qui a besoin d'être bien orienté dès son arrivée : je serais heureuse de mettre cette expérience à son service."
  ]
};

function letterParagraphs(p: Json): string[] {
  const company = p.offer?.company ?? '';
  if (LETTER_BODY[company]) return LETTER_BODY[company];
  const strengths: string[] = p.analysis?.strengths ?? [];
  const exp = p.profile?.experiences?.[0];
  return [
    exp
      ? `Actuellement ${exp.role.toLowerCase()} chez ${exp.company}, je souhaite mettre mon expérience au service de ${company}.`
      : `Je souhaite mettre mes compétences au service de ${company}.`,
    strengths.length
      ? `Plusieurs points de votre annonce correspondent à mon parcours : ${strengths.slice(0, 2).map((s) => s.toLowerCase()).join(' ; ')}.`
      : `Votre annonce pour le poste de ${p.offer?.title ?? ''} a retenu toute mon attention.`,
    'Organisée et fiable, je m’adapte vite à de nouveaux outils et à de nouvelles équipes.'
  ];
}

function writeLetter(p: Json) {
  const o = p.options ?? {};
  const name = p.profile?.name ?? '';
  const company = p.offer?.company ?? '';
  const title = String(p.offer?.title ?? '').replace(/\s*\(H\/F\)\s*/i, '').trim();
  let paras = [...letterParagraphs(p)];
  if (o.length === 'courte') paras = paras.slice(0, 2);
  const points: string[] = o.points ?? [];
  if (o.length === 'detaillee' || points.some((x: string) => /anglais/i.test(x))) {
    paras.push("Je parle anglais (niveau B2), ce qui me permet d'accueillir aussi des interlocuteurs étrangers.");
  }
  if (/d[ée]cembre|disponib|commencer/i.test(o.instruction ?? '')) {
    const month = (o.instruction as string).match(/janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i)?.[0];
    paras.push(month ? `Je suis disponible pour commencer dès ${month.toLowerCase()}.` : 'Je suis disponible immédiatement.');
  }
  const opening =
    o.tone === 'chaleureux'
      ? `C'est avec un réel enthousiasme que je vous propose ma candidature au poste de ${title.toLowerCase()}.`
      : o.tone === 'direct'
        ? `Je candidate au poste de ${title.toLowerCase()} chez ${company}.`
        : '';
  const closing =
    o.tone === 'direct'
      ? 'Je suis disponible pour un entretien quand vous le souhaitez.\n\nCordialement,'
      : o.tone === 'chaleureux'
        ? "Je serais ravie d'échanger avec vous et de vous en dire plus lors d'un entretien.\n\nJe vous prie d'agréer, Madame, Monsieur, mes salutations les meilleures."
        : "Je serais heureuse d'échanger avec vous lors d'un entretien.\n\nVeuillez agréer, Madame, Monsieur, mes salutations distinguées.";
  const letter = ['Madame, Monsieur,', ...(opening ? [opening] : []), ...paras, closing, name].join('\n\n');
  return {
    letter,
    mailSubject: `Candidature — ${title}`,
    mailBody: `Madame, Monsieur,\n\nJe vous adresse ma candidature au poste de ${title.toLowerCase()}. Vous trouverez ci-joint mon CV et ma lettre de motivation.\n\nJe reste disponible pour un entretien à votre convenance.\n\nBien cordialement,\n${name}${p.profile?.phone ? `\n${p.profile.phone}` : ''}`
  };
}

// ---------- follow_up ----------

function followUp(p: Json) {
  const title = String(p.offer?.title ?? '').replace(/\s*\(H\/F\)\s*/i, '').trim();
  const name = p.profile?.name ?? '';
  const date = p.sentAt ? new Date(p.sentAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : 'récemment';
  return {
    subject: `Relance — candidature ${title}`,
    body: `Madame, Monsieur,\n\nJe me permets de revenir vers vous au sujet de ma candidature au poste de ${title.toLowerCase()}, envoyée le ${date}. Ce poste m'intéresse toujours beaucoup et je reste disponible pour un échange.\n\nBien cordialement,\n${name}`
  };
}

export async function fakeClaude(req: CompletionRequest, delayMs = 250): Promise<Completion> {
  const task = taskOf(req.system);
  const payload: Json = JSON.parse(req.messages[req.messages.length - 1]?.content ?? '{}');
  let out: unknown;
  switch (task) {
    case 'parse_cv':
      out = parseCv(payload);
      break;
    case 'analyse':
      out = ANALYSES[payload.offer?.company] ?? genericAnalysis(payload);
      break;
    case 'adapt_cv':
      out = { changes: ADAPTATIONS[payload.offer?.company] ?? genericAdaptation(payload) };
      break;
    case 'write_letter':
      out = writeLetter(payload);
      break;
    case 'follow_up':
      out = followUp(payload);
      break;
    default:
      throw new Error('Tâche inconnue pour Claude simulé');
  }
  if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  const text = JSON.stringify(out);
  return { text, inputTokens: Math.round(JSON.stringify(req).length / 4), outputTokens: Math.round(text.length / 4) };
}
