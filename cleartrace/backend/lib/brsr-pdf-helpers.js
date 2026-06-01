'use strict';

const COLORS = {
  navy:       '#1F3864',
  midBlue:    '#2E5496',
  lightBlue:  '#D6E4F7',
  green:      '#375623',
  lightGreen: '#E2EFDA',
  amber:      '#FCE4D6',
  gray:       '#595959',
  lightGray:  '#F2F2F2',
  border:     '#BFBFBF',
  white:      '#FFFFFF',
  black:      '#000000',
};

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val.toLocaleString();
  if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val).trim();
  return s || '—';
}

function checkPageBreak(doc, currentY, neededHeight, margin) {
  if (currentY + neededHeight > doc.page.height - margin) {
    doc.addPage();
    return margin;
  }
  return currentY;
}

function addPageNumber(doc, pageNum, pageWidth, margin) {
  const w = (pageWidth || doc.page.width) - (margin || 40) * 2;
  const h = doc.page.height;
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(7)
     .text(`Page ${pageNum}`, (margin || 40), h - 22, { width: w, align: 'right' });
}

function drawSectionHeader(doc, title, y, pageWidth, margin) {
  const contentWidth = (pageWidth || doc.page.width) - (margin || 40) * 2;
  const x = margin || 40;
  y = checkPageBreak(doc, y, 28, margin || 40);
  doc.rect(x, y, contentWidth, 22).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(10)
     .text(title, x + 8, y + 6, { width: contentWidth - 16, lineBreak: false });
  return y + 28;
}

function drawSubHeader(doc, title, y, pageWidth, margin, opts) {
  const contentWidth = (pageWidth || doc.page.width) - (margin || 40) * 2;
  const x = margin || 40;
  opts = opts || {};
  y = checkPageBreak(doc, y, 18, margin || 40);

  let labelX = x;
  if (opts.brsrCore) {
    doc.rect(x, y + 1, 56, 11).fill(COLORS.amber);
    doc.fillColor(COLORS.black).font('Helvetica-Bold').fontSize(6)
       .text('BRSR Core', x + 2, y + 3, { width: 52, lineBreak: false });
    labelX = x + 60;
  } else if (opts.leadership) {
    doc.rect(x, y + 1, 64, 11).fill(COLORS.lightGreen);
    doc.fillColor(COLORS.green).font('Helvetica-Bold').fontSize(6)
       .text('[Leadership]', x + 2, y + 3, { width: 60, lineBreak: false });
    labelX = x + 68;
  }

  doc.fillColor(COLORS.midBlue).font('Helvetica-Bold').fontSize(9)
     .text(title, labelX, y, { width: contentWidth - (labelX - x) });
  return y + 16;
}

function drawField(doc, label, value, x, y, opts) {
  opts = opts || {};
  const pageWidth = opts.pageWidth || doc.page.width;
  const margin    = opts.margin    || 40;
  const contentWidth = opts.contentWidth || (pageWidth - margin * 2);
  const fontSize  = opts.fontSize  || 8;
  const labelW    = opts.labelWidth || Math.floor(contentWidth * 0.40);
  const valueW    = contentWidth - labelW - 4;

  y = checkPageBreak(doc, y, 14, margin);

  const displayVal = formatValue(value);
  const valH = doc.heightOfString(displayVal, { width: valueW, fontSize, lineBreak: true });
  const labH = doc.heightOfString(label + ':', { width: labelW, fontSize, lineBreak: true });
  const rowH = Math.max(valH, labH, 12);

  y = checkPageBreak(doc, y, rowH + 3, margin);

  doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(fontSize)
     .text(label + ':', x, y, { width: labelW, lineBreak: true });
  doc.fillColor(COLORS.black).font('Helvetica').fontSize(fontSize)
     .text(displayVal, x + labelW + 4, y, { width: valueW, lineBreak: true });

  return y + rowH + 3;
}

// ── Core table renderer ────────────────────────────────────────────────────────
// opts: { x, y, colWidths, headers, rows, headerFill, headerColor, altFill,
//         fontSize, headerFontSize, cellPadding, margin }
// Returns: final y after the table
function drawTable(doc, opts) {
  const {
    x,
    y: startY,
    colWidths,
    headers,
    rows,
    headerFill     = COLORS.navy,
    headerColor    = COLORS.white,
    altFill        = COLORS.lightGray,
    fontSize       = 8,
    headerFontSize = 8,
    cellPadding    = 4,
    margin         = 40,
  } = opts;

  const pageHeight = doc.page.height;
  let curY = startY;

  // Measure and draw the header row; returns next y
  function drawHeaderRow(yPos) {
    let hh = 14;
    headers.forEach((hdr, i) => {
      const th = doc.heightOfString(String(hdr || ''), {
        width: Math.max(1, colWidths[i] - cellPadding * 2),
        fontSize: headerFontSize,
        lineBreak: true,
      });
      hh = Math.max(hh, th + cellPadding * 2);
    });
    hh = Math.max(hh, 16);

    let cx = x;
    colWidths.forEach((w) => {
      doc.rect(cx, yPos, w, hh).fill(headerFill);
      cx += w;
    });
    cx = x;
    colWidths.forEach((w, i) => {
      doc.fillColor(headerColor).font('Helvetica-Bold').fontSize(headerFontSize)
         .text(String(headers[i] || ''), cx + cellPadding, yPos + cellPadding, {
           width: Math.max(1, w - cellPadding * 2),
           lineBreak: true,
         });
      cx += w;
    });
    return yPos + hh;
  }

  curY = checkPageBreak(doc, curY, 32, margin);
  curY = drawHeaderRow(curY);

  for (let ri = 0; ri < rows.length; ri++) {
    const rowData = rows[ri];

    // Measure row height
    let rowH = 14;
    colWidths.forEach((w, ci) => {
      const cellVal = rowData[ci] != null ? String(rowData[ci]) : '—';
      const th = doc.heightOfString(cellVal, {
        width: Math.max(1, w - cellPadding * 2),
        fontSize,
        lineBreak: true,
      });
      rowH = Math.max(rowH, th + cellPadding * 2);
    });
    rowH = Math.max(rowH, 14);

    // Page break — redraw header on new page
    if (curY + rowH > pageHeight - margin) {
      doc.addPage();
      curY = margin;
      curY = drawHeaderRow(curY);
    }

    const fill = ri % 2 === 0 ? altFill : COLORS.white;

    // Fill cells
    let cx = x;
    colWidths.forEach((w) => {
      doc.rect(cx, curY, w, rowH).fill(fill);
      cx += w;
    });
    // Stroke cells
    cx = x;
    colWidths.forEach((w) => {
      doc.save().strokeColor(COLORS.border).lineWidth(0.5);
      doc.rect(cx, curY, w, rowH).stroke();
      doc.restore();
      cx += w;
    });
    // Cell text
    cx = x;
    colWidths.forEach((w, ci) => {
      const cellVal = rowData[ci] != null ? String(rowData[ci]) : '—';
      doc.fillColor(COLORS.black).font('Helvetica').fontSize(fontSize)
         .text(cellVal, cx + cellPadding, curY + cellPadding, {
           width: Math.max(1, w - cellPadding * 2),
           lineBreak: true,
         });
      cx += w;
    });

    curY += rowH;
  }

  return curY + 4;
}

// Renders Section B's 9-column principle grid.
// gridData = object keyed by principleKey, then sub_row key
// principleKeys = ['p1'..'p9']
// subRows = array of { key, label } objects
function drawPrincipleGrid(doc, gridData, principleKeys, subRows, y, pageWidth, margin) {
  const contentWidth = (pageWidth || doc.page.width) - (margin || 40) * 2;
  const x = margin || 40;
  const labelColW = 140;
  const remaining = contentWidth - labelColW;
  const pColW = Math.floor(remaining / principleKeys.length);

  const headers   = ['', ...principleKeys.map(k => k.toUpperCase())];
  const colWidths = [labelColW, ...principleKeys.map(() => pColW)];

  const rows = subRows.map(sr => {
    const rowData = [sr.label];
    principleKeys.forEach(pk => {
      const val = (gridData || {})[pk] && (gridData[pk])[sr.key];
      rowData.push(formatValue(val));
    });
    return rowData;
  });

  return drawTable(doc, {
    x, y, colWidths, headers, rows,
    margin: margin || 40,
    fontSize: 7,
    headerFontSize: 7,
    cellPadding: 3,
  });
}

module.exports = {
  COLORS,
  formatValue,
  checkPageBreak,
  addPageNumber,
  drawSectionHeader,
  drawSubHeader,
  drawField,
  drawTable,
  drawPrincipleGrid,
};
