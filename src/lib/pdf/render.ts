// Génère le CV et la lettre en PDF (pdf-lib, polices standard : rien à télécharger).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import type { CvContent, CvTemplate } from '../types';

const A4: [number, number] = [595.28, 841.89];
const EXTRA = new Set('’‘“”–—…œŒ€•'.split(''));

/** Les polices standard ne connaissent que l'alphabet latin (WinAnsi). */
export function pdfSafe(s: string): string {
  return s
    .replace(/[   ]/g, ' ')
    .replace(/[≈→←•·]/g, (c) => ({ '≈': '~', '→': '->', '←': '<-', '•': '•', '·': '·' })[c] ?? '')
    .split('')
    .filter((c) => c === '\n' || (c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) <= 0xff) || EXTRA.has(c))
    .join('');
}

interface Ctx {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  margin: number;
  width: number;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

function ensure(c: Ctx, needed: number) {
  if (c.y - needed < c.margin) {
    c.page = c.doc.addPage(A4);
    c.y = A4[1] - c.margin;
  }
}

function text(c: Ctx, s: string, opts: { font?: PDFFont; size?: number; color?: RGB; x?: number; width?: number; gap?: number } = {}) {
  const font = opts.font ?? c.regular;
  const size = opts.size ?? 10;
  const x = opts.x ?? c.margin;
  const width = opts.width ?? c.width - (x - c.margin);
  const lh = size * 1.38;
  for (const line of wrap(s, font, size, width)) {
    ensure(c, lh);
    c.page.drawText(line, { x, y: c.y - size, size, font, color: opts.color ?? rgb(0.1, 0.1, 0.11) });
    c.y -= lh;
  }
  c.y -= opts.gap ?? 0;
}

async function setup(): Promise<Ctx> {
  const doc = await PDFDocument.create();
  const page = doc.addPage(A4);
  const margin = 54;
  return {
    doc,
    page,
    y: A4[1] - margin,
    margin,
    width: A4[0] - margin * 2,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique)
  };
}

const INK = rgb(0.094, 0.094, 0.106);
const MUTED = rgb(0.32, 0.32, 0.36);
const ACCENT = rgb(0.204, 0.259, 0.769);

function heading(c: Ctx, label: string, template: CvTemplate) {
  ensure(c, 40);
  c.y -= 10;
  const color = template === 'moderne' ? ACCENT : INK;
  c.page.drawText(pdfSafe(label.toUpperCase()), { x: c.margin, y: c.y - 10, size: 10, font: c.bold, color });
  c.y -= 15;
  c.page.drawLine({
    start: { x: c.margin, y: c.y },
    end: { x: c.margin + c.width, y: c.y },
    thickness: template === 'moderne' ? 1.5 : 0.6,
    color: template === 'moderne' ? ACCENT : rgb(0.8, 0.8, 0.78)
  });
  c.y -= 8;
}

/** Modèle deux colonnes : coordonnées, compétences, langues et formation à gauche ; le parcours à droite. */
async function renderColumns(cv: CvContent): Promise<Uint8Array> {
  const c = await setup();
  c.doc.setTitle(pdfSafe(`CV — ${cv.fullName}`));
  c.doc.setCreator('Boing');
  const sideW = 168;
  const gap = 26;
  const top = A4[1] - c.margin;
  c.page.drawRectangle({ x: 0, y: 0, width: c.margin + sideW + gap / 2, height: A4[1], color: rgb(0.953, 0.953, 0.94) });

  // Colonne de gauche
  const side = { x: c.margin, width: sideW };
  const sideHead = (label: string) => {
    c.y -= 8;
    text(c, label.toUpperCase(), { ...side, font: c.bold, size: 9, color: ACCENT, gap: 2 });
  };
  text(c, cv.fullName, { ...side, font: c.bold, size: 18, gap: 2 });
  text(c, cv.title, { ...side, size: 11, color: ACCENT, gap: 8 });
  sideHead('Contact');
  for (const l of cv.contact) text(c, l, { ...side, size: 9.5, color: MUTED });
  if (cv.skills.length) {
    sideHead('Compétences');
    for (const sk of cv.skills) text(c, sk, { ...side, size: 9.5 });
  }
  if (cv.languages.length) {
    sideHead('Langues');
    for (const l of cv.languages) text(c, l, { ...side, size: 9.5 });
  }
  if (cv.education.length) {
    sideHead('Formation');
    for (const e of cv.education) text(c, [e.degree, e.school, e.year].filter(Boolean).join(' — '), { ...side, size: 9.5, gap: 4 });
  }

  // Colonne principale (repart du haut de la première page)
  c.page = c.doc.getPage(0);
  c.y = top;
  const mainX = c.margin + sideW + gap;
  const main = { x: mainX, width: A4[0] - c.margin - mainX };
  const mainHead = (label: string) => {
    ensure(c, 40);
    c.y -= 6;
    c.page.drawText(pdfSafe(label.toUpperCase()), { x: mainX, y: c.y - 10, size: 10, font: c.bold, color: ACCENT });
    c.y -= 15;
    c.page.drawLine({ start: { x: mainX, y: c.y }, end: { x: mainX + main.width, y: c.y }, thickness: 1, color: ACCENT });
    c.y -= 8;
  };
  if (cv.summary) {
    mainHead('Profil');
    text(c, cv.summary, { ...main, size: 10.5, gap: 6 });
  }
  if (cv.experiences.length) {
    mainHead('Expérience');
    for (const e of cv.experiences) {
      ensure(c, 40);
      text(c, `${e.role} — ${e.company}`, { ...main, font: c.bold, size: 11 });
      const dates = [e.start, e.end].filter(Boolean).join(' – ');
      if (dates) text(c, dates, { ...main, size: 9.5, color: MUTED, gap: 1 });
      for (const b of e.bullets) {
        ensure(c, 14);
        c.page.drawText('•', { x: mainX + 2, y: c.y - 10, size: 10, font: c.regular, color: MUTED });
        text(c, b, { x: mainX + 14, width: main.width - 14, size: 10 });
      }
      c.y -= 6;
    }
  }
  return c.doc.save();
}

export async function renderCv(cv: CvContent, template: CvTemplate = 'sobre'): Promise<Uint8Array> {
  if (template === 'colonnes') return renderColumns(cv);
  const c = await setup();
  c.doc.setTitle(pdfSafe(`CV — ${cv.fullName}`));
  c.doc.setCreator('Boing');

  if (template === 'moderne') {
    c.page.drawRectangle({ x: 0, y: A4[1] - 8, width: A4[0], height: 8, color: ACCENT });
  }
  text(c, cv.fullName, { font: c.bold, size: 22, color: INK, gap: 2 });
  text(c, cv.title, { size: 13, color: template === 'moderne' ? ACCENT : MUTED, gap: 2 });
  text(c, cv.contact.join('  ·  '), { size: 9.5, color: MUTED, gap: 4 });

  if (cv.summary) {
    heading(c, 'Profil', template);
    text(c, cv.summary, { size: 10.5, gap: 2 });
  }
  if (cv.experiences.length) {
    heading(c, 'Expérience', template);
    for (const e of cv.experiences) {
      ensure(c, 40);
      const dates = [e.start, e.end].filter(Boolean).join(' – ');
      const dw = c.regular.widthOfTextAtSize(pdfSafe(dates), 9.5);
      c.page.drawText(pdfSafe(dates), { x: c.margin + c.width - dw, y: c.y - 11, size: 9.5, font: c.regular, color: MUTED });
      text(c, `${e.role} — ${e.company}`, { font: c.bold, size: 11, width: c.width - dw - 12, gap: 1 });
      for (const b of e.bullets) {
        ensure(c, 14);
        c.page.drawText('•', { x: c.margin + 4, y: c.y - 10, size: 10, font: c.regular, color: MUTED });
        text(c, b, { x: c.margin + 16, size: 10 });
      }
      c.y -= 6;
    }
  }
  if (cv.education.length) {
    heading(c, 'Formation', template);
    for (const e of cv.education) text(c, [e.degree, e.school, e.year].filter(Boolean).join(' — '), { size: 10, gap: 2 });
  }
  if (cv.skills.length) {
    heading(c, 'Compétences', template);
    text(c, cv.skills.join('  ·  '), { size: 10 });
  }
  if (cv.languages.length) {
    heading(c, 'Langues', template);
    text(c, cv.languages.join('  ·  '), { size: 10 });
  }
  return c.doc.save();
}

export interface LetterMeta {
  senderName: string;
  senderLines: string[];
  recipient: string[];
  date: string;
  subject: string;
}

export async function renderLetter(meta: LetterMeta, body: string): Promise<Uint8Array> {
  const c = await setup();
  c.doc.setTitle(pdfSafe(`Lettre de motivation — ${meta.senderName}`));
  c.doc.setCreator('Boing');
  text(c, meta.senderName, { font: c.bold, size: 11 });
  for (const l of meta.senderLines.filter(Boolean)) text(c, l, { size: 10, color: MUTED });
  c.y -= 16;
  const rx = c.margin + c.width * 0.55;
  for (const l of meta.recipient.filter(Boolean)) text(c, l, { x: rx, size: 10.5 });
  c.y -= 10;
  text(c, meta.date, { x: rx, size: 10.5, color: MUTED });
  c.y -= 18;
  text(c, `Objet : ${meta.subject}`, { font: c.bold, size: 10.5, gap: 14 });
  for (const para of body.split(/\n\s*\n/)) {
    text(c, para.trim(), { size: 10.5, gap: 9 });
  }
  return c.doc.save();
}
