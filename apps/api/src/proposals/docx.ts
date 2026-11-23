import type { Proposal } from '@agora/contracts';
import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const BRL = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto com marcadores [PREENCHER: …] destacados em amarelo, para ninguém enviar a proposta sem ver o que falta. */
function runs(text: string): TextRun[] {
  const out: TextRun[] = [];
  const re = /\[PREENCHER:[^\]]*\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(new TextRun({ text: text.slice(last, i), font: 'Calibri', size: 22 }));
    out.push(
      new TextRun({ text: m[0], highlight: 'yellow', bold: true, font: 'Calibri', size: 22 }),
    );
    last = i + m[0].length;
  }
  if (last < text.length)
    out.push(new TextRun({ text: text.slice(last), font: 'Calibri', size: 22 }));
  return out;
}

const cell = (text: string, opts: { bold?: boolean; right?: boolean; width: number }) =>
  new TableCell({
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    children: [
      new Paragraph({
        alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text, bold: opts.bold, font: 'Calibri', size: 20 })],
      }),
    ],
  });

export async function proposalToDocx(p: Proposal): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: 'PROPOSTA COMERCIAL', bold: true, font: 'Calibri' })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Órgão: ${p.organ_name}`, font: 'Calibri', size: 22 })],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Objeto: ${p.procurement_object}`, font: 'Calibri', size: 22 }),
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
    for (const para of s.body.split(/\n{2,}/)) {
      children.push(new Paragraph({ spacing: { after: 120 }, children: runs(para.trim()) }));
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: 'Planilha de preços', font: 'Calibri' })],
    }),
  );
  const w = [7, 40, 10, 8, 17, 18];
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['Item', 'Descrição', 'Qtd.', 'Un.', 'Preço unit.', 'Total'].map((h, i) =>
            cell(h, { bold: true, width: w[i] as number, right: i >= 4 }),
          ),
        }),
        ...p.items.map(
          (it) =>
            new TableRow({
              children: [
                cell(String(it.number), { width: w[0] as number }),
                cell(it.description, { width: w[1] as number }),
                cell(it.quantity === null ? '—' : String(it.quantity), {
                  width: w[2] as number,
                  right: true,
                }),
                cell(it.unit ?? '—', { width: w[3] as number }),
                cell(BRL(it.unit_price), { width: w[4] as number, right: true }),
                cell(BRL(it.total), { width: w[5] as number, right: true }),
              ],
            }),
        ),
      ],
    }),
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 160 },
      children: [
        new TextRun({
          text: `Valor total da proposta: ${BRL(p.total)}`,
          bold: true,
          font: 'Calibri',
          size: 24,
        }),
      ],
    }),
  );

  const doc = new Document({
    creator: 'Régua',
    title: 'Proposta comercial (rascunho)',
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Rascunho gerado por IA — revisar antes de enviar.',
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
