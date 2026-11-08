// Lecture du texte d'un CV (PDF ou .txt) directement dans l'interface.
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export async function extractText(file: File): Promise<string> {
  if (/\.txt$/i.test(file.name) || file.type === 'text/plain') return file.text();
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    throw new Error('Format non pris en charge : utilise un PDF (ou un .txt).');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let line = '';
    const lines: string[] = [];
    for (const item of content.items as any[]) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim());
        line = '';
      }
      line += item.str + (item.hasEOL ? '' : '');
      lastY = y;
    }
    if (line.trim()) lines.push(line.trim());
    pages.push(lines.join('\n'));
  }
  const text = pages.join('\n\n').trim();
  if (!text) throw new Error("Ce PDF ne contient pas de texte lisible (c'est peut-être une image scannée).");
  return text;
}
