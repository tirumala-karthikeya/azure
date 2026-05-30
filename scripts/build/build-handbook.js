/**
 * Builds docs/github-actions-handbook.docx from docs/github-actions-handbook.md
 * using docx-js, with W3Schools-style code blocks, Arial body, styled headings,
 * a footer with page numbers, and full table support.
 */

const fs = require('fs');
const path = require('path');

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Footer, AlignmentType, LevelFormat, ExternalHyperlink, ImageRun,
  HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber,
  UnderlineType,
} = require('docx');

const INPUT  = path.resolve(__dirname, '../../docs/github-actions-handbook.md');
const OUTPUT = path.resolve(__dirname, '../../docs/github-actions-handbook.docx');
const RENDERED_DIR = path.resolve(__dirname, './rendered');

// Heading text → { file, width } of diagram to insert after it. Width is in
// on-page pixels; height is auto-computed from the PNG's aspect ratio.
const DIAGRAMS = {
  'How it works under the hood':                                         { file: 'lifecycle.png',                 width: 560 },
  'The Actions UI, in a quick tour':                                     { file: 'ui-layout.png',                 width: 560 },
  'Scenario 2 — Sequential execution':                                   { file: 'scenario-02-sequential.png',    width: 560 },
  'Scenario 3 — Parallel execution':                                     { file: 'scenario-03-parallel.png',      width: 560 },
  'Scenario 4 — Mixed (sequential then parallel then sequential)':       { file: 'scenario-04-mixed.png',         width: 560 },
  'Scenario 7 — Environment-based deployment with approval gates':       { file: 'scenario-07-environments.png',  width: 560 },
  'Scenario 11 — Auto-rollback on health check failure':                 { file: 'scenario-11-rollback.png',      width: 560 },
  'Scenario 12 — Workflow chaining with `workflow_run`':                 { file: 'scenario-12-chaining.png',      width: 560 },
  'The full flow':                                                       { file: 'end-to-end.png',                width: 400 },
};

const BODY_FONT     = 'Calibri';   // matches the Google Doc default
const CODE_FONT     = 'Consolas';
const CODE_BG       = 'F4F4F4';
const ACCENT        = '2E75B6';    // medium blue for code-block left border / arrows
const TITLE_CLR     = '1F3864';    // dark navy for title and section headings
const SUBHEAD_CLR   = '2E75B6';    // medium blue for subsection headings
const BODY_CLR      = '404040';    // body text
const LINK_CLR      = '2E75B6';
const TABLE_HEAD_BG = '1F3864';    // dark navy table header
const TABLE_HEAD_FG = 'FFFFFF';    // white header text
const RULE_CLR      = '2E75B6';    // horizontal rules under headings
const BORDER_CLR    = 'CCCCCC';

// Page geometry (US Letter, 1-inch margins)
const PAGE_W   = 12240;
const PAGE_H   = 15840;
const MARGIN   = 1440;
const CONTENT_W = PAGE_W - MARGIN * 2;   // 9360

// ────────────────────────────────────────────────────────────────────────────
// Inline parser: **bold**, *italic*, `code`, [text](url)
// Returns an array of TextRun / ExternalHyperlink objects.
// extra: properties applied to every TextRun (used for table header cells).
// ────────────────────────────────────────────────────────────────────────────
function parseInline(text, extra = {}) {
  const out = [];
  let i = 0;
  const flush = (s) => {
    if (s.length) out.push(new TextRun({ text: s, font: BODY_FONT, ...extra }));
  };
  let buf = '';

  while (i < text.length) {
    // Bold **...**
    if (text[i] === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        flush(buf); buf = '';
        out.push(new TextRun({ text: text.substring(i + 2, end), bold: true, font: BODY_FONT, ...extra }));
        i = end + 2;
        continue;
      }
    }
    // Inline code `...`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        flush(buf); buf = '';
        out.push(new TextRun({
          text: text.substring(i + 1, end),
          font: CODE_FONT,
          size: 20,
          shading: { fill: CODE_BG, type: ShadingType.CLEAR },
          ...extra,
        }));
        i = end + 1;
        continue;
      }
    }
    // Link [text](url)
    if (text[i] === '[') {
      const close = text.indexOf('](', i + 1);
      if (close !== -1) {
        const end = text.indexOf(')', close + 2);
        if (end !== -1) {
          const linkText = text.substring(i + 1, close);
          const url      = text.substring(close + 2, end);
          flush(buf); buf = '';
          out.push(new ExternalHyperlink({
            link: url,
            children: [new TextRun({
              text: linkText,
              style: 'Hyperlink',
              color: LINK_CLR,
              underline: { type: UnderlineType.SINGLE, color: LINK_CLR },
              font: BODY_FONT,
              ...extra,
            })],
          }));
          i = end + 1;
          continue;
        }
      }
    }
    // Italic *...* — only when delimiters are flanked by non-whitespace
    if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*' && text[i + 1] !== ' ') {
      // find closing *
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && text[end + 1] !== '*' && text[end - 1] !== ' ') {
        const inside = text.substring(i + 1, end);
        if (!inside.includes('*') && !inside.includes('\n') && inside.length <= 100) {
          flush(buf); buf = '';
          out.push(new TextRun({ text: inside, italics: true, font: BODY_FONT, ...extra }));
          i = end + 1;
          continue;
        }
      }
    }
    buf += text[i];
    i++;
  }
  flush(buf);
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Block builders
// ────────────────────────────────────────────────────────────────────────────

// A single line inside a code block gets borders that look like one big box
// when stacked with its neighbours.
function codeLine(line, isFirst, isLast) {
  const gray = { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD', space: 2 };
  return new Paragraph({
    shading: { fill: CODE_BG, type: ShadingType.CLEAR },
    border: {
      left:   { style: BorderStyle.SINGLE, size: 24, color: ACCENT, space: 6 },
      right:  gray,
      top:    isFirst ? gray : undefined,
      bottom: isLast  ? gray : undefined,
    },
    spacing: { before: 0, after: 0, line: 260, lineRule: 'auto' },
    indent:  { left: 120, right: 120 },
    children: [new TextRun({ text: line.length ? line : ' ', font: CODE_FONT, size: 18 })],
  });
}

function spacer(after = 120) {
  return new Paragraph({
    spacing: { before: 0, after },
    children: [new TextRun({ text: '' })],
  });
}

// PNG has width at bytes 16-19 and height at 20-23, big-endian uint32.
function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function makeImage(spec) {
  const { file, width } = typeof spec === 'string' ? { file: spec, width: 560 } : spec;
  const full = path.resolve(RENDERED_DIR, file);
  const buf  = fs.readFileSync(full);
  const { w, h } = pngSize(buf);
  const scale = width / w;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 180, after: 180 },
    children: [new ImageRun({
      type: 'png',
      data: buf,
      transformation: { width, height: Math.round(h * scale) },
      altText: { title: file, description: file, name: file },
    })],
  });
}

function rule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BORDER_CLR, space: 6 } },
    spacing: { before: 240, after: 240 },
    children: [new TextRun({ text: '' })],
  });
}

function buildTable(rawRows) {
  // rawRows: array of string rows (already split by |). First = header, second = separator.
  if (rawRows.length < 2) return null;
  const parseRow = (r) => r.split('|').slice(1, -1).map(c => c.trim());
  const header = parseRow(rawRows[0]);
  const body   = rawRows.slice(2).map(parseRow);
  const n      = header.length;
  const col    = Math.floor(CONTENT_W / n);
  const widths = Array(n).fill(col);
  widths[n - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);

  const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: BORDER_CLR };
  const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

  const makeCell = (text, isHeader, idx) => new TableCell({
    borders,
    width: { size: widths[idx], type: WidthType.DXA },
    shading: isHeader ? { fill: TABLE_HEAD_BG, type: ShadingType.CLEAR } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: [new Paragraph({
      spacing: { before: 0, after: 0 },
      children: parseInline(text, isHeader
        ? { bold: true, size: 20, color: TABLE_HEAD_FG }
        : { size: 20, color: BODY_CLR }),
    })],
  });

  const rows = [];
  rows.push(new TableRow({
    tableHeader: true,
    children: header.map((h, idx) => makeCell(h, true, idx)),
  }));
  body.forEach(br => {
    rows.push(new TableRow({
      children: br.map((c, idx) => makeCell(c, false, idx)),
    }));
  });

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Main loop: walk markdown line-by-line, emit docx-js blocks
// ────────────────────────────────────────────────────────────────────────────
const md = fs.readFileSync(INPUT, 'utf-8');
const lines = md.split('\n');
const children = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];

  if (line.trim() === '') { i++; continue; }

  if (line.trim() === '---') { children.push(rule()); i++; continue; }

  // Headings
  const h = line.match(/^(#{1,4})\s+(.*)$/);
  if (h) {
    const level = h[1].length;
    const text  = h[2].trim();
    const headingLevel = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][level];
    // The very first # on line 1 is the document title — center it, big, with rule.
    if (level === 1 && children.length === 0) {
      children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: parseInline(text.toUpperCase(), { size: 56, bold: true, color: TITLE_CLR }),
        spacing: { before: 0, after: 120 },
      }));
    } else if (level === 1) {
      // Section heading — navy, with a thin blue rule below.
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 480, after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_CLR, space: 4 },
        },
        children: parseInline(text, { size: 36, bold: true, color: TITLE_CLR }),
      }));
    } else {
      // H2/H3/H4 — medium blue subheadings, no rule
      const sizes = { 2: 28, 3: 24, 4: 22 };
      children.push(new Paragraph({
        heading: headingLevel,
        spacing: { before: level === 2 ? 360 : 240, after: 120 },
        children: parseInline(text, { size: sizes[level], bold: true, color: SUBHEAD_CLR }),
      }));
    }
    // If this heading has a diagram mapped to it, drop the image in right after.
    if (DIAGRAMS[text]) {
      children.push(makeImage(DIAGRAMS[text]));
    }
    i++; continue;
  }

  // Code block
  if (line.startsWith('```')) {
    i++;
    const body = [];
    while (i < lines.length && !lines[i].startsWith('```')) { body.push(lines[i]); i++; }
    i++; // skip closing ```
    body.forEach((l, idx) => children.push(codeLine(l, idx === 0, idx === body.length - 1)));
    children.push(spacer(120));
    continue;
  }

  // Table
  if (line.startsWith('|')) {
    const rows = [];
    while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i]); i++; }
    const t = buildTable(rows);
    if (t) { children.push(t); children.push(spacer(120)); }
    continue;
  }

  // Blockquote
  if (line.startsWith('> ')) {
    const qs = [];
    while (i < lines.length && lines[i].startsWith('> ')) { qs.push(lines[i].slice(2)); i++; }
    children.push(new Paragraph({
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: ACCENT, space: 12 } },
      indent: { left: 360 },
      spacing: { before: 120, after: 120 },
      children: parseInline(qs.join(' ')),
    }));
    continue;
  }

  // Bullet list (supports -item or * item)
  if (line.match(/^[-*]\s+/)) {
    while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
      const item = lines[i].replace(/^[-*]\s+/, '');
      children.push(new Paragraph({
        numbering: { reference: 'bullets', level: 0 },
        spacing: { before: 40, after: 40 },
        children: parseInline(item),
      }));
      i++;
    }
    children.push(spacer(100));
    continue;
  }

  // Numbered list
  if (line.match(/^\d+\.\s+/)) {
    while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
      const item = lines[i].replace(/^\d+\.\s+/, '');
      children.push(new Paragraph({
        numbering: { reference: 'numbers', level: 0 },
        spacing: { before: 40, after: 40 },
        children: parseInline(item),
      }));
      i++;
    }
    children.push(spacer(100));
    continue;
  }

  // Paragraph — gather consecutive plain lines
  const paraLines = [];
  while (
    i < lines.length &&
    lines[i].trim() !== '' &&
    !lines[i].startsWith('#') &&
    !lines[i].startsWith('```') &&
    !lines[i].startsWith('|') &&
    !lines[i].startsWith('> ') &&
    !lines[i].match(/^[-*]\s+/) &&
    !lines[i].match(/^\d+\.\s+/) &&
    lines[i].trim() !== '---'
  ) {
    paraLines.push(lines[i]);
    i++;
  }
  if (paraLines.length) {
    children.push(new Paragraph({
      spacing: { before: 60, after: 120, line: 320, lineRule: 'auto' },
      children: parseInline(paraLines.join(' ')),
    }));
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Document assembly
// ────────────────────────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'GitHub Actions Handbook Generator',
  title:   'The GitHub Actions Handbook',
  styles: {
    default: {
      document: { run: { font: BODY_FONT, size: 22, color: BODY_CLR } },
    },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 56, bold: true, font: BODY_FONT, color: TITLE_CLR },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 }, outlineLevel: 0 } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 36, bold: true, font: BODY_FONT, color: TITLE_CLR },
        paragraph: { spacing: { before: 480, after: 80 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 28, bold: true, font: BODY_FONT, color: SUBHEAD_CLR },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 24, bold: true, font: BODY_FONT, color: SUBHEAD_CLR },
        paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 2 } },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 22, bold: true, font: BODY_FONT, color: SUBHEAD_CLR },
        paragraph: { spacing: { before: 180, after: 80 }, outlineLevel: 3 } },
      { id: 'Hyperlink', name: 'Hyperlink', basedOn: 'Normal', next: 'Normal',
        run: { color: LINK_CLR, underline: { type: UnderlineType.SINGLE, color: LINK_CLR } } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets',
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }] },
      { reference: 'numbers',
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size:   { width: PAGE_W, height: PAGE_H },
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: 'Page ', size: 18, font: BODY_FONT, color: '888888' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 18, font: BODY_FONT, color: '888888' }),
            new TextRun({ text: ' of ',   size: 18, font: BODY_FONT, color: '888888' }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: BODY_FONT, color: '888888' }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(OUTPUT, buffer);
  console.log(`Wrote ${OUTPUT} — ${buffer.length.toLocaleString()} bytes, ${children.length} blocks`);
});
