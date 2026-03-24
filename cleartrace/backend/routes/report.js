const express = require('express');
const router  = express.Router();
const PDFDocument = require('pdfkit');
const db      = require('../db/database');

// GET /api/report
// Streams a PDF ESG summary report for the authenticated company
router.get('/', async (req, res) => {
  const companyId = req.companyId;
  const year      = new Date().getFullYear();

  try {
    // ── Fetch data ────────────────────────────────────────────────────────
    // ── Fetch company name ────────────────────────────────────────────────
    const companyRow = await db.query(
      'SELECT name FROM companies WHERE id = $1',
      [companyId]
    );
    const companyName = companyRow.rows[0]?.name || 'Your Organisation';

    const [scopeRows, fwRows, entryRows] = await Promise.all([
      db.query(
        `SELECT scope,
                COALESCE(SUM(co2e_tonnes), 0) AS total_co2e,
                COALESCE(SUM(amount), 0)       AS total_amount
           FROM emissions_entries
          WHERE company_id = $1
          GROUP BY scope
          ORDER BY scope`,
        [companyId]
      ),
      db.query(
        `SELECT framework, status
           FROM framework_status
          WHERE company_id = $1
          ORDER BY framework`,
        [companyId]
      ),
      db.query(
        `SELECT COUNT(*) AS cnt,
                COALESCE(SUM(co2e_tonnes), 0) AS total_co2e
           FROM emissions_entries
          WHERE company_id = $1`,
        [companyId]
      ),
    ]);

    const scopes     = scopeRows.rows;
    const frameworks = fwRows.rows;
    const totals     = entryRows.rows[0];

    const totalCO2e = parseFloat(totals.total_co2e).toFixed(2);
    const entries   = parseInt(totals.cnt);

    // ── ESG score (mirrors kpi.js logic) ─────────────────────────────────
    const aligned = frameworks.filter(f => f.status === 'aligned').length;
    const partial = frameworks.filter(f => f.status === 'partial').length;
    const dataScore = Math.min(50, Math.round(entries / 25 * 50));
    const fwScore   = Math.round(aligned * 12.5 + partial * 6.25);
    const esgScore  = Math.min(100, dataScore + fwScore);
    const esgRating = esgScore >= 80 ? 'A' : esgScore >= 60 ? 'B' : esgScore >= 40 ? 'C' : 'D';

    // ── Build PDF ─────────────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ClearTrace-ESG-Report-${year}.pdf"`
    );
    doc.pipe(res);

    const GREEN  = '#1a7f5a';
    const DARK   = '#1a2332';
    const GREY   = '#6b7280';
    const LIGHT  = '#f0f4f0';
    const WIDTH  = doc.page.width  - 100;

    // ── Cover / header ────────────────────────────────────────────────────
    doc.rect(50, 50, WIDTH, 80).fill(GREEN);
    doc.fillColor('#ffffff')
       .font('Helvetica-Bold').fontSize(22)
       .text('ClearTrace', 70, 68)
       .font('Helvetica').fontSize(11)
       .text('ESG Intelligence Platform', 70, 94);

    doc.fillColor('#ffffff')
       .font('Helvetica-Bold').fontSize(13)
       .text(`ESG Summary Report — ${year}`, 70, 68, { align: 'right', width: WIDTH - 20 })
       .font('Helvetica').fontSize(9)
       .text(companyName, 70, 90, { align: 'right', width: WIDTH - 20 })
       .text(`Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`,
             70, 102, { align: 'right', width: WIDTH - 20 });

    // ── ESG Score ─────────────────────────────────────────────────────────
    doc.moveDown(4);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('ESG Performance Score', 50);
    doc.moveDown(0.4);

    doc.rect(50, doc.y, WIDTH, 60).fill(LIGHT);
    const scoreY = doc.y + 10;
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(32).text(`${esgScore}`, 70, scoreY);
    doc.fillColor(GREY).font('Helvetica').fontSize(10)
       .text(`Rating: ${esgRating}`, 70, scoreY + 36)
       .text(`${entries} data entries recorded`, 180, scoreY + 10)
       .text(`Total GHG emissions: ${totalCO2e} tCO₂e`, 180, scoreY + 28);

    // ── Emissions by Scope ────────────────────────────────────────────────
    doc.moveDown(5);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Emissions by Scope');
    doc.moveDown(0.4);

    const scopeLabels = { 1: 'Scope 1 — Direct', 2: 'Scope 2 — Energy', 3: 'Scope 3 — Value Chain' };
    const colW = WIDTH / 3;

    [1, 2, 3].forEach((s, i) => {
      const row = scopes.find(r => parseInt(r.scope) === s);
      const co2 = row ? parseFloat(row.total_co2e).toFixed(2) : '0.00';
      const x   = 50 + i * colW;
      doc.rect(x + 2, doc.y, colW - 4, 60).fill(i % 2 === 0 ? LIGHT : '#ffffff').stroke('#e5e7eb');
      const boxY = doc.y - 60;
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10)
         .text(scopeLabels[s], x + 8, boxY + 8, { width: colW - 16 });
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(20)
         .text(`${co2}`, x + 8, boxY + 24, { width: colW - 16 });
      doc.fillColor(GREY).font('Helvetica').fontSize(8)
         .text('tCO₂e', x + 8, boxY + 46, { width: colW - 16 });
    });

    // ── Framework Status ──────────────────────────────────────────────────
    doc.moveDown(5.5);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Reporting Framework Status');
    doc.moveDown(0.4);

    const fwNames = { GRI: 'Global Reporting Initiative', TCFD: 'Task Force on Climate Disclosures', SASB: 'Sustainability Accounting Standards', LOCAL: 'Local / Regulatory' };
    const statusColors = { aligned: GREEN, partial: '#d97706', not_started: '#9ca3af' };
    const statusLabels = { aligned: 'Aligned', partial: 'Partial', not_started: 'Not started' };

    if (frameworks.length === 0) {
      doc.fillColor(GREY).font('Helvetica').fontSize(10).text('No framework data recorded yet.');
    } else {
      frameworks.forEach(fw => {
        const rowY = doc.y;
        doc.rect(50, rowY, WIDTH, 28).fill(LIGHT).stroke('#e5e7eb');
        doc.fillColor(DARK).font('Helvetica-Bold').fontSize(10)
           .text(fw.framework, 60, rowY + 8);
        doc.fillColor(GREY).font('Helvetica').fontSize(9)
           .text(fwNames[fw.framework] || fw.framework, 120, rowY + 10);
        const col = statusColors[fw.status] || GREY;
        const lbl = statusLabels[fw.status]  || fw.status;
        doc.fillColor(col).font('Helvetica-Bold').fontSize(9)
           .text(lbl, 60, rowY + 8, { align: 'right', width: WIDTH - 20 });
        doc.moveDown(1.4);
      });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(50 + WIDTH, doc.y).stroke(GREY);
    doc.moveDown(0.4);
    doc.fillColor(GREY).font('Helvetica').fontSize(8)
       .text(
         `This report was generated by the ClearTrace ESG Intelligence Platform. ` +
         `Emission factors based on DEFRA 2023 guidelines. ` +
         `© ${year} ClearTrace`,
         50, doc.y, { align: 'center', width: WIDTH }
       );

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
});

module.exports = router;
