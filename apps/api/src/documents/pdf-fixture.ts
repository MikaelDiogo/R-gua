import { strToU8 } from 'fflate';

/** PDF mínimo e válido (xref correto) com uma linha de texto: prova a leitura de verdade, sem fixture binária. */
export function pdfWithText(text: string): Uint8Array {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  bodies.forEach((b, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}
