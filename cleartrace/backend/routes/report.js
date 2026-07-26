const express     = require('express');
const router      = express.Router();
const PDFDocument = require('pdfkit');
const db          = require('../db/database');
const requireRole = require('../middleware/roles');
const ds          = require('../lib/pdf-design-system');

// Water/waste/social/governance rows are user-typed metric values — there is
// no factor_source-equivalent column behind them, so they get the honest
// neutral tag rather than a fabricated calculation-source badge.
const REPORTED_VALUE_BADGE = { label: 'Reported value', variant: 'reported' };

// Small gray label line above a group of rows (e.g. "Water — Period: 2024-06").
function drawSubLabel(doc, margin, width, y, text) {
  y = ds.checkPageBreak(doc, y, 16, margin);
  doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(8.5).text(text, margin, y, { width });
  return y + 16;
}

// Category divider bar used inside Social/Governance sections, e.g.
// "Diversity & Inclusion" with its GRI code right-aligned.
function drawCategoryHeader(doc, margin, width, y, title, code) {
  const h = 20;
  y = ds.checkPageBreak(doc, y, h + 6, margin);
  doc.rect(margin, y, width, h).fill(ds.COLORS.slateBlueBg);
  doc.fillColor(ds.COLORS.tealDark).font(ds.F('heading')).fontSize(9.5)
     .text(title, margin + 10, y + 5, { width: width * 0.6, lineBreak: false });
  if (code) {
    doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(8)
       .text(code, margin + 10, y + 6, { align: 'right', width: width - 20, lineBreak: false });
  }
  return y + h + 6;
}

// One label/value row, with an optional provenance badge right-aligned.
// `badge` is either null or { label, variant } (see pdf-design-system).
function drawMetricRow(doc, margin, width, y, label, value, badge) {
  const rowH = 22;
  y = ds.checkPageBreak(doc, y, rowH + 4, margin);

  doc.rect(margin, y, width, rowH).fill(ds.COLORS.lightGray);
  doc.fillColor(ds.COLORS.ink).font(ds.F('body')).fontSize(9)
     .text(label, margin + 10, y + 6.5, { width: width * 0.45, lineBreak: false });

  const badgeRightX = margin + width - 10;
  const badgeY      = y + (rowH - 14) / 2;
  const badgeW      = badge
    ? ds.drawProvenanceBadge(doc, badge.label, badgeRightX, badgeY, { variant: badge.variant, align: 'right' })
    : 0;
  const valueLeftX  = margin + width * 0.45;
  const valueRightX = badge ? badgeRightX - badgeW - 10 : badgeRightX;

  doc.fillColor(ds.COLORS.ink).font(ds.F('bodyMedium')).fontSize(9)
     .text(value, valueLeftX, y + 6.5, { width: valueRightX - valueLeftX, align: 'right', lineBreak: false });

  return y + rowH + 4;
}

// One framework-status row (GRI/TCFD/SASB/LOCAL), status right-aligned.
function drawFrameworkRow(doc, margin, width, y, fw, fwNames, statusStyles) {
  const rowH = 26;
  y = ds.checkPageBreak(doc, y, rowH + 4, margin);

  doc.rect(margin, y, width, rowH).fill(ds.COLORS.lightGray);
  doc.fillColor(ds.COLORS.tealDark).font(ds.F('heading')).fontSize(9.5)
     .text(fw.framework, margin + 10, y + 8, { width: 60, lineBreak: false });
  doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(8.5)
     .text(fwNames[fw.framework] || fw.framework, margin + 75, y + 9, { width: width * 0.45, lineBreak: false });

  const st = statusStyles[fw.status] || statusStyles.not_started;
  doc.fillColor(st.color).font(ds.F('bodyMedium')).fontSize(9)
     .text(st.label, margin + 10, y + 8, { align: 'right', width: width - 20, lineBreak: false });

  return y + rowH + 4;
}

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
    let distinctSources = [];
    try {
      const sourceRows = await db.query(
        `SELECT DISTINCT factor_source FROM emissions_entries
          WHERE company_id=$1 AND factor_source IS NOT NULL`,
        [companyId]
      );
      const sources = sourceRows.rows.map(r => r.factor_source);
      distinctSources = sources;
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
    ds.registerFonts(doc);

    const margin = 50;
    const WIDTH  = doc.page.width - margin * 2;

    // ── Cover page ───────────────────────────────────────────────────────
    ds.drawCoverPage(doc, {
      companyName,
      period: `Reporting Year ${year}`,
      headlineValue: totalCO2e,
      generatedDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    });

    // ── Executive Summary ────────────────────────────────────────────────
    doc.addPage();
    let y = margin;
    y = ds.drawSectionHeader(doc, 'Executive Summary', y);

    const scoreCard = ds.drawStatCard(doc, {
      x: margin, y, width: WIDTH, height: 70,
      label: `ESG Performance Score  —  Rating ${esgRating}`,
      value: String(esgScore),
      unit: `${entries} data entries recorded  ·  ${totalCO2e} tCO2e total`,
      accentColor: ds.COLORS.teal,
    });
    y = scoreCard.bottom + 20;

    y = ds.drawSectionHeader(doc, 'Emissions by Scope', y);

    const scopeLabels  = { 1: 'Scope 1 — Direct', 2: 'Scope 2 — Energy', 3: 'Scope 3 — Value Chain' };
    const scopeAccents = { 1: ds.COLORS.teal, 2: ds.COLORS.slateBlue, 3: ds.COLORS.amber };
    const cardGap  = 12;
    const cardW    = (WIDTH - cardGap * 2) / 3;

    // Honest per-card provenance: badge only when the scope actually has
    // entries, using the same distinct-source list already computed above
    // (no new aggregation — just reused for display).
    const scopeBadge = (hasData) => {
      if (!hasData || distinctSources.length === 0) return null;
      if (distinctSources.length === 1) return ds.classifyFactorSource(distinctSources[0]);
      return { label: 'Multiple sources', variant: 'custom' };
    };

    let scopeCardBottom = y;
    [1, 2, 3].forEach((s, i) => {
      const row = scopes.find(r => parseInt(r.scope) === s);
      const co2 = row ? parseFloat(row.total_co2e).toFixed(2) : '0.00';
      const x   = margin + i * (cardW + cardGap);
      const card = ds.drawStatCard(doc, {
        x, y, width: cardW,
        label: scopeLabels[s], value: co2, unit: 'tCO2e',
        accentColor: scopeAccents[s],
        badge: scopeBadge(parseFloat(co2) > 0),
      });
      scopeCardBottom = card.bottom;
    });
    y = scopeCardBottom + 24;

    // ── Reporting Framework Status ───────────────────────────────────────
    y = ds.drawSectionHeader(doc, 'Reporting Framework Status', y);

    const fwNames = { GRI: 'Global Reporting Initiative', TCFD: 'Task Force on Climate Disclosures', SASB: 'Sustainability Accounting Standards', LOCAL: 'Local / Regulatory' };
    const statusStyles = {
      aligned:     { color: ds.COLORS.teal,      label: 'Aligned' },
      partial:     { color: ds.COLORS.amberDark, label: 'Partial' },
      not_started: { color: ds.COLORS.gray,       label: 'Not started' },
    };

    if (frameworks.length === 0) {
      y = ds.checkPageBreak(doc, y, 16, margin);
      doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(10).text('No framework data recorded yet.', margin, y);
      y += 20;
    } else {
      frameworks.forEach(fw => {
        y = drawFrameworkRow(doc, margin, WIDTH, y, fw, fwNames, statusStyles);
      });
    }
    y += 12;

    // ── Water & Waste ─────────────────────────────────────────────────────
    y = ds.drawSectionHeader(doc, 'Water & Waste', y);

    const hasWater = waterData && waterData.rows.length;
    const hasWaste = wasteData && wasteData.rows.length;

    if (!hasWater && !hasWaste) {
      y = ds.checkPageBreak(doc, y, 16, margin);
      doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(10)
         .text('No water/waste data recorded for this period.', margin, y);
      y += 20;
    } else {
      if (hasWater) {
        y = drawSubLabel(doc, margin, WIDTH, y, `Water — Period: ${waterData.period}`);
        for (const r of waterData.rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toLocaleString() : '—';
          y = drawMetricRow(doc, margin, WIDTH, y, r.metric_key.replace(/_/g, ' '), val, REPORTED_VALUE_BADGE);
        }
        y += 8;
      }
      if (hasWaste) {
        y = drawSubLabel(doc, margin, WIDTH, y, `Waste — Period: ${wasteData.period}`);
        for (const r of wasteData.rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toLocaleString() : '—';
          y = drawMetricRow(doc, margin, WIDTH, y, r.metric_key.replace(/_/g, ' '), val, REPORTED_VALUE_BADGE);
        }
      }
    }
    y += 12;

    // ── Social Metrics ───────────────────────────────────────────────────
    y = ds.drawSectionHeader(doc, 'Social Metrics', y);

    if (!socialData || !socialData.rows.length) {
      y = ds.checkPageBreak(doc, y, 16, margin);
      doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(10).text('No social data recorded yet.', margin, y);
      y += 20;
    } else {
      y = drawSubLabel(doc, margin, WIDTH, y, `Period: ${socialData.period}`);

      const socialByCategory = {};
      for (const r of socialData.rows) {
        if (!socialByCategory[r.category]) socialByCategory[r.category] = [];
        socialByCategory[r.category].push(r);
      }
      const socialGriMap = { 'Diversity & Inclusion': 'GRI 405', 'Health & Safety': 'GRI 403', 'Supply Chain': 'GRI 414' };

      for (const [cat, rows] of Object.entries(socialByCategory)) {
        y = drawCategoryHeader(doc, margin, WIDTH, y, cat, socialGriMap[cat]);
        for (const r of rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toString() : (r.metric_text || '—');
          y = drawMetricRow(doc, margin, WIDTH, y, r.metric_key.replace(/_/g, ' '), val, REPORTED_VALUE_BADGE);
        }
        y += 8;
      }
    }
    y += 12;

    // ── Governance Metrics ───────────────────────────────────────────────
    y = ds.drawSectionHeader(doc, 'Governance Metrics', y);

    if (!govData || !govData.rows.length) {
      y = ds.checkPageBreak(doc, y, 16, margin);
      doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(10).text('No governance data recorded yet.', margin, y);
      y += 20;
    } else {
      y = drawSubLabel(doc, margin, WIDTH, y, `Period: ${govData.period}`);

      const govByCategory = {};
      for (const r of govData.rows) {
        if (!govByCategory[r.category]) govByCategory[r.category] = [];
        govByCategory[r.category].push(r);
      }
      const govGriMap = { 'Board Composition': 'GRI 102', 'Anti-Bribery & Ethics': 'GRI 205' };

      for (const [cat, rows] of Object.entries(govByCategory)) {
        y = drawCategoryHeader(doc, margin, WIDTH, y, cat, govGriMap[cat]);
        for (const r of rows) {
          const val = r.metric_value !== null ? parseFloat(r.metric_value).toString() : (r.metric_text || '—');
          y = drawMetricRow(doc, margin, WIDTH, y, r.metric_key.replace(/_/g, ' '), val, REPORTED_VALUE_BADGE);
        }
        y += 8;
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────
    y = ds.checkPageBreak(doc, y, 40, margin);
    y += 8;
    doc.moveTo(margin, y).lineTo(margin + WIDTH, y).lineWidth(0.75).strokeColor(ds.COLORS.border).stroke();
    y += 12;
    doc.fillColor(ds.COLORS.gray).font(ds.F('body')).fontSize(8)
       .text(
         `This report was generated by the ClearTrace ESG Intelligence Platform. ` +
         `Emission factors: ${factorFooter}. ` +
         `© ${year} ClearTrace`,
         margin, y, { align: 'center', width: WIDTH }
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
