import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
export async function summaryPdf(title: string, text: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(join(process.cwd(), "src/assets/DejaVuSans.ttf")),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  const clean = (value: string) =>
    Array.from(value)
      .map((c) =>
        c === "\n"
          ? "\n"
          : c === "\t"
            ? " "
            : supported.has(c.codePointAt(0)!)
              ? c
              : "□",
      )
      .join("");
  let page = pdf.addPage([595, 842]),
    y = 790;
  const line = (value: string, size = 11) => {
    if (y < 55) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
    page.drawText(value, { x: 48, y, font, size, color: rgb(0.07, 0.12, 0.2) });
    y -= size + 7;
  };
  for (const paragraph of clean(`${title}\n\n${text}`).split("\n")) {
    if (!paragraph) {
      y -= 12;
      continue;
    }
    let current = "";
    for (const word of paragraph
      .split(/\s+/)
      .flatMap((w) => w.match(/.{1,45}/gu) ?? [])) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, 11) > 499 && current) {
        line(current);
        current = word;
      } else current = next;
    }
    if (current) line(current);
  }
  pdf.setTitle(clean(title));
  pdf.setCreator("Mi espacio personal");
  return pdf.save();
}
