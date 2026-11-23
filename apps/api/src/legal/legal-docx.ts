import type { LegalPiece } from '@agora/contracts';
import { AlignmentType, Document, Footer, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';

const KIND: Record<LegalPiece['kind'], string> = {
  impugnation: 'IMPUGNAÇÃO AO EDITAL',
  appeal: 'RECURSO ADMINISTRATIVO',
  counter_arguments: 'CONTRARRAZÕES DE RECURSO',
};

/** Marcadores [PREENCHER: …] ficam em amarelo e os [S#] em negrito, para ninguém usar a peça sem ver o que falta e de onde vem. */
function runs(text: string): TextRun[] {
  const out: TextRun[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[PREENCHER:[^\]]*\]|\[S\d+\]/g)) {
    const i = m.index ?? 0;
    if (i > last) out.push(new TextRun({ text: text.slice(last, i), font: 'Calibri', size: 22 }));
    const ph = m[0].startsWith('[PREENCHER');
    out.push(
      new TextRun({
        text: m[0],
        bold: true,
        ...(ph ? { highlight: 'yellow' as const } : {}),
        font: 'Calibri',
        size: 22,
      }),
    );
    last = i + m[0].length;
  }
  if (last < text.length)
    out.push(new TextRun({ text: text.slice(last), font: 'Calibri', size: 22 }));
  return out;
}

export async function legalToDocx(p: LegalPiece): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: KIND[p.kind], bold: true, font: 'Calibri' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Órgão: ${p.organ_name}`, font: 'Calibri', size: 22 })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Objeto: ${p.procurement_object}`, font: 'Calibri', size: 22 }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Prazo: ${p.deadline.label} (validar com o jurídico)`,
          italics: true,
          font: 'Calibri',
          size: 20,
        }),
      ],
    }),
    new Paragraph({ text: '' }),
  ];
  for (const s of p.sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: s.title, font: 'Calibri' })],
      }),
    );
    for (const para of s.body.split(/\n{2,}/))
      children.push(new Paragraph({ spacing: { after: 120 }, children: runs(para.trim()) }));
  }
  if (p.sources.length > 0) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: 'Fontes consultadas', font: 'Calibri' })],
      }),
    );
    for (const s of p.sources) {
      children.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: `[${s.id}] ${s.title} — ${s.url}${s.quote ? (s.quote_verified ? ' (trecho conferido na fonte)' : ' (trecho NÃO conferido na fonte)') : ''}`,
              font: 'Calibri',
              size: 20,
            }),
          ],
        }),
      );
    }
  }
  const doc = new Document({
    creator: 'Régua',
    title: `${KIND[p.kind]} (rascunho)`,
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Rascunho gerado por IA — não substitui assessoria jurídica; revisar antes de usar.',
                    italics: true,
                    size: 18,
                    font: 'Calibri',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
