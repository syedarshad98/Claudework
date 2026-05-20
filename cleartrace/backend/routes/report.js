const express     = require('express');
const router      = express.Router();
const PDFDocument = require('pdfkit');
const db          = require('../db/database');
const requireRole = require('../middleware/roles');

// GET /api/report
// Streams a PDF ESG summary report for the authenticated company
router.get('/', requireRole('admin', 'editor'), async (req, res) => {
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

    // Collect distinct factor sources used in this report period
    let factorFooter = 'DEFRA 2023 (UK)';
    try {
      const sourceRows = await db.query(
        `SELECT DISTINCT factor_source FROM emissions_entries
          WHERE company_id=$1 AND factor_source IS NOT NULL`,
        [companyId]
      );
      const sources = sourceRows.rows.map(r => r.factor_source);
      if (sources.length > 0) {
        const parts = [];
        const hasDefra = sources.some(s => s.startsWith('DEFRA'));
        const ceaSources = sources.filter(s => s.startsWith('CEA'));
        if (hasDefra || ceaSources.length === 0) parts.push('DEFRA 2023 (UK)');
        for (const cs of ceaSources) {
          parts.push(`${cs} (India Grid, CEA CO₂ Baseline Database)`);
        }
        factorFooter = parts.join('; ');
      }
    } catch (_) { /* column may not exist on older deployments — keep default */ }

    const scopes     = scopeRows.rows;
    const frameworks = fwRows.rows;
    const totals     = entryRows.rows[0];

    const totalCO2e = parseFloat(totals.total_co2e).toFixed(2);
    const entries   = parseInt(totals.cnt);

    // ── ESG score (mirrors kpi.js logic) ─────────────────────────────────
    const aligned   = frameworks.filter(f => f.status === 'aligned').length;
    const partial   = frameworks.filter(f => f.status === 'partial').length;
    const dataScore = Math.min(40, Math.round(entries / 25 * 40));
    const fwScore   = Math.min(20, Math.round(aligned * 5 + partial * 2.5));
    const baseEnv   = Math.min(60, dataScore + fwScore);

    let waterScore = 0;
    let waterData  = null;
    try {
      const wRow = await db.query('SELECT 1 FROM water_metrics WHERE company_id=$1 LIMIT 1', [companyId]);
      if (wRow.rows.length) {
        waterScore = 5;
        const wPeriod = await db.query('SELECT period FROM water_metrics WHERE company_id=$1 ORDER BY period DESC LIMIT 1', [companyId]);
        if (wPeriod.rows.length) {
          const wp = wPeriod.rows[0].period;
          const wMetrics = await db.query('SELECT category, metric_key, metric_value FROM water_metrics WHERE company_id=$1 AND period=$2', [companyId, wp]);
          waterData = { period: wp, rows: wMetrics.rows };
        }
      }
    } catch (_) { /* table may not exist yet */ }

    let wasteScore = 0;
    let wasteData  = null;
    try {
      const wsRow = await db.query('SELECT 1 FROM waste_metrics WHERE company_id=$1 LIMIT 1', [companyId]);
      if (wsRow.rows.length) {
        wasteScore = 5;
        const wsPeriod = await db.query('SELECT period FROM waste_metrics WHERE company_id=$1 ORDER BY period DESC LIMIT 1', [companyId]);
        if (wsPeriod.rows.length) {
          const wsp = wsPeriod.rows[0].period;
          const wsMetrics = await db.query('SELECT category, metric_key, metric_value FROM waste_metrics WHERE company_id=$1 AND period=$2', [companyId, wsp]);
          wasteData = { period: wsp, rows: wsMetrics.rows };
        }
      }
    } catch (_) { /* table may not exist yet */ }

    const envScore = Math.min(70, baseEnv + waterScore + wasteScore);

    let socialScore = 0;
    let socialData  = null;
    try {
      const sRow = await db.query(
        'SELECT 1 FROM social_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (sRow.rows.length) {
        socialScore = 15;
        const sPeriod = await db.query(
          'SELECT period FROM social_metrics WHERE company_id=$1 ORDER BY period DESC LIMIT 1', [companyId]
        );
        if (sPeriod.rows.length) {
          const sp = sPeriod.rows[0].period;
          const sMetrics = await db.query(
            'SELECT category, metric_key, metric_value, metric_text FROM social_metrics WHERE company_id=$1 AND period=$2',
            [companyId, sp]
          );
          socialData = { period: sp, rows: sMetrics.rows };
        }
      }
    } catch (_) { /* table may not exist yet */ }

    let govScore = 0;
    let govData  = null;
    try {
      const gRow = await db.query(
        'SELECT 1 FROM governance_metrics WHERE company_id = $1 LIMIT 1', [companyId]
      );
      if (gRow.rows.length) {
        govScore = 15;
        const gPeriod = await db.query(
          'SELECT period FROM governance_metrics WHERE company_id=$1 ORDER BY period DESC LIMIT 1', [companyId]
        );
        if (gPeriod.rows.length) {
          const gp = gPeriod.rows[0].period;
          const gMetrics = await db.query(
            'SELECT category, metric_key, metric_value, metric_text FROM governance_metrics WHERE company_id=$1 AND period=$2',
            [companyId, gp]
          );
          govData = { period: gp, rows: gMetrics.rows };
        }
      }
    } catch (_) { /* table may not exist yet */ }

    const esgScore  = Math.min(100, envScore + socialScore + govScore);
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

    // ── Water & Waste Metrics ─────────────────────────────────────────────
    doc.moveDown(2);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Water & Waste');
    doc.moveDown(0.4);

    const WATER_BLUE = '#1e6a9f';
    const WASTE_GREEN = '#2d7a4f';

    if ((!waterData || !waterData.rows.length) && (!wasteData || !wasteData.rows.length)) {
      doc.fillColor(GREY).font('Helvetica').fontSize(10)
         .text('No water/waste data recorded for this period.');
    } else {
      if (waterData && waterData.rows.length) {
        doc.fillColor(GREY).font('Helvetica').fontSize(9).text(`Water — Period: ${waterData.period}`);
        doc.moveDown(0.3);
        for (const r of waterData.rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toLocaleString() : '—';
          const rowY = doc.y;
          doc.rect(50, rowY, WIDTH, 20).fill(LIGHT).stroke('#e5e7eb');
          doc.fillColor(DARK).font('Helvetica').fontSize(9)
             .text(r.metric_key.replace(/_/g, ' '), 60, rowY + 6, { width: WIDTH * 0.6 });
          doc.fillColor(WATER_BLUE).font('Helvetica-Bold').fontSize(9)
             .text(val, 60, rowY + 6, { align: 'right', width: WIDTH - 20 });
          doc.moveDown(1.1);
        }
        doc.moveDown(0.3);
      }
      if (wasteData && wasteData.rows.length) {
        doc.fillColor(GREY).font('Helvetica').fontSize(9).text(`Waste — Period: ${wasteData.period}`);
        doc.moveDown(0.3);
        for (const r of wasteData.rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toLocaleString() : '—';
          const rowY = doc.y;
          doc.rect(50, rowY, WIDTH, 20).fill(LIGHT).stroke('#e5e7eb');
          doc.fillColor(DARK).font('Helvetica').fontSize(9)
             .text(r.metric_key.replace(/_/g, ' '), 60, rowY + 6, { width: WIDTH * 0.6 });
          doc.fillColor(WASTE_GREEN).font('Helvetica-Bold').fontSize(9)
             .text(val, 60, rowY + 6, { align: 'right', width: WIDTH - 20 });
          doc.moveDown(1.1);
        }
      }
    }

    // ── Social Metrics ────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Social Metrics');
    doc.moveDown(0.4);

    if (!socialData || !socialData.rows.length) {
      doc.fillColor(GREY).font('Helvetica').fontSize(10).text('No social data recorded yet.');
    } else {
      doc.fillColor(GREY).font('Helvetica').fontSize(9).text(`Period: ${socialData.period}`);
      doc.moveDown(0.3);

      // Group by category
      const socialByCategory = {};
      for (const r of socialData.rows) {
        if (!socialByCategory[r.category]) socialByCategory[r.category] = [];
        socialByCategory[r.category].push(r);
      }

      const socialGriMap = { 'Diversity & Inclusion': 'GRI 405', 'Health & Safety': 'GRI 403', 'Supply Chain': 'GRI 414' };

      for (const [cat, rows] of Object.entries(socialByCategory)) {
        const gri = socialGriMap[cat] || '';
        const catY = doc.y;
        doc.rect(50, catY, WIDTH, 22).fill('#e8f5f0').stroke('#c3d9d0');
        doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(10).text(cat, 60, catY + 6);
        if (gri) doc.fillColor(GREY).font('Helvetica').fontSize(8).text(gri, 60, catY + 6, { align: 'right', width: WIDTH - 20 });
        doc.moveDown(1.2);

        for (const r of rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toString() : (r.metric_text || '—');
          const rowY2 = doc.y;
          doc.rect(50, rowY2, WIDTH, 20).fill(LIGHT).stroke('#e5e7eb');
          doc.fillColor(DARK).font('Helvetica').fontSize(9).text(r.metric_key.replace(/_/g, ' '), 60, rowY2 + 6, { width: WIDTH * 0.6 });
          doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9).text(val, 60, rowY2 + 6, { align: 'right', width: WIDTH - 20 });
          doc.moveDown(1.1);
        }
        doc.moveDown(0.3);
      }
    }

    // ── Governance Metrics ────────────────────────────────────────────────
    doc.moveDown(1);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(14).text('Governance Metrics');
    doc.moveDown(0.4);

    if (!govData || !govData.rows.length) {
      doc.fillColor(GREY).font('Helvetica').fontSize(10).text('No governance data recorded yet.');
    } else {
      doc.fillColor(GREY).font('Helvetica').fontSize(9).text(`Period: ${govData.period}`);
      doc.moveDown(0.3);

      const govByCategory = {};
      for (const r of govData.rows) {
        if (!govByCategory[r.category]) govByCategory[r.category] = [];
        govByCategory[r.category].push(r);
      }

      const govGriMap = { 'Board Composition': 'GRI 102', 'Anti-Bribery & Ethics': 'GRI 205' };

      for (const [cat, rows] of Object.entries(govByCategory)) {
        const gri = govGriMap[cat] || '';
        const catY = doc.y;
        doc.rect(50, catY, WIDTH, 22).fill('#eef0f8').stroke('#c5cce0');
        doc.fillColor('#3b5bdb').font('Helvetica-Bold').fontSize(10).text(cat, 60, catY + 6);
        if (gri) doc.fillColor(GREY).font('Helvetica').fontSize(8).text(gri, 60, catY + 6, { align: 'right', width: WIDTH - 20 });
        doc.moveDown(1.2);

        for (const r of rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toString() : (r.metric_text || '—');
          const rowY2 = doc.y;
          doc.rect(50, rowY2, WIDTH, 20).fill(LIGHT).stroke('#e5e7eb');
          doc.fillColor(DARK).font('Helvetica').fontSize(9).text(r.metric_key.replace(/_/g, ' '), 60, rowY2 + 6, { width: WIDTH * 0.6 });
          doc.fillColor('#3b5bdb').font('Helvetica-Bold').fontSize(9).text(val, 60, rowY2 + 6, { align: 'right', width: WIDTH - 20 });
          doc.moveDown(1.1);
        }
        doc.moveDown(0.3);
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(50 + WIDTH, doc.y).stroke(GREY);
    doc.moveDown(0.4);
    doc.fillColor(GREY).font('Helvetica').fontSize(8)
       .text(
         `This report was generated by the ClearTrace ESG Intelligence Platform. ` +
         `Emission factors: ${factorFooter}. ` +
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
