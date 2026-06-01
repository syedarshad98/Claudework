'use strict';

const {
  COLORS, formatValue, checkPageBreak,
  drawSectionHeader, drawSubHeader, drawField,
  drawTable, drawPrincipleGrid,
} = require('./brsr-pdf-helpers');

const SECTION_A_FIELDS = require('./brsr-section-a-fields');
const { SECTION_B_FIELDS, PRINCIPLES } = require('./brsr-section-b-fields');
const P1_FIELDS = require('./brsr-p1-fields');
const P2_FIELDS = require('./brsr-p2-fields');
const P3_FIELDS = require('./brsr-p3-fields');
const P4_FIELDS = require('./brsr-p4-fields');
const P5_FIELDS = require('./brsr-p5-fields');
const P6_FIELDS = require('./brsr-p6-fields');
const P7_FIELDS = require('./brsr-p7-fields');
const P8_FIELDS = require('./brsr-p8-fields');
const P9_FIELDS = require('./brsr-p9-fields');

const PRINCIPLE_KEYS = PRINCIPLES.map(p => p.key);

// ── Column maps ───────────────────────────────────────────────────────────────

const SA_COL_MAP = {
  cin: 'cin', year_of_incorporation: 'year_of_incorporation',
  registered_address: 'registered_office_address', corporate_address: 'corporate_address',
  contact_email: 'email', contact_telephone: 'telephone', website: 'website',
  paid_up_capital_inr: 'paid_up_capital_inr_cr', turnover_inr: 'turnover_inr_cr',
  net_worth_inr: 'net_worth_inr_cr',
};

const SB_COL_MAP = {
  director_statement: 'director_statement', highest_authority: 'highest_authority',
  board_committee: 'board_committee', board_committee_details: 'board_committee_details',
};

const P6_COL_MAP = {
  scope1_current: 'ghg_scope1_tco2e', scope2_current: 'ghg_scope2_tco2e',
  scope3_current: 'ghg_scope3_tco2e', water_consumption_current: 'total_water_consumed_m3',
  ghg_intensity_per_rupee_current: 'ghg_intensity_per_crore_inr',
  energy_intensity_per_rupee_current: 'energy_intensity_per_crore_inr',
  water_intensity_per_rupee_current: 'water_intensity_per_crore_inr',
  waste_intensity_per_rupee_current: 'waste_intensity_per_crore_inr',
};

const P1_COL_MAP = {
  e4_anti_corruption: 'e4_anti_corruption', e4_policy_url: 'e4_policy_url',
  e7_corrective_actions: 'e7_corrective_actions', l2_board_conflict: 'l2_board_conflict',
};

const P2_COL_MAP = {
  e2_sustainable_sourcing: 'e2_sustainable_sourcing', e2_sourcing_pct: 'e2_sourcing_pct',
  e3_reclaim_processes: 'e3_reclaim_processes', e4_epr_applicable: 'e4_epr_applicable',
  e4_epr_details: 'e4_epr_details',
};

const P3_COL_MAP = {
  e3_accessibility: 'e3_accessibility', e4_equal_opportunity: 'e4_equal_opportunity',
  e4_policy_url: 'e4_policy_url', e10_ohs_implemented: 'e10_ohs_implemented',
  e10_ohs_coverage: 'e10_ohs_coverage', e10_hazard_processes: 'e10_hazard_processes',
  e10_worker_reporting: 'e10_worker_reporting', e10_medical_access: 'e10_medical_access',
  e12_safe_workplace: 'e12_safe_workplace', e14_health_safety_pct: 'e14_health_safety_pct',
  e14_working_conditions_pct: 'e14_working_conditions_pct',
  e15_corrective_actions: 'e15_corrective_actions',
  l1_life_insurance_employees: 'l1_life_insurance_employees',
  l1_life_insurance_workers: 'l1_life_insurance_workers',
  l2_statutory_dues: 'l2_statutory_dues', l4_transition_assistance: 'l4_transition_assistance',
  l5_health_safety_vc_pct: 'l5_health_safety_vc_pct',
  l5_working_conditions_vc_pct: 'l5_working_conditions_vc_pct',
  l6_corrective_actions: 'l6_corrective_actions',
};

const P4_COL_MAP = {
  e1_identification_process: 'e1_identification_process',
  l1_board_consultation: 'l1_board_consultation', l2_stakeholder_input: 'l2_stakeholder_input',
  l3_vulnerable_groups: 'l3_vulnerable_groups',
};

const P5_COL_MAP = {
  e4_focal_point: 'e4_focal_point', e5_grievance_mechanism: 'e5_grievance_mechanism',
  e7_adverse_consequences: 'e7_adverse_consequences', e8_hr_agreements: 'e8_hr_agreements',
  e9_child_labour_pct: 'e9_child_labour_pct', e9_forced_labour_pct: 'e9_forced_labour_pct',
  e9_sexual_harassment_pct: 'e9_sexual_harassment_pct',
  e9_discrimination_pct: 'e9_discrimination_pct', e9_wages_pct: 'e9_wages_pct',
  e9_others_pct: 'e9_others_pct', e10_corrective_actions: 'e10_corrective_actions',
  l1_business_process_changes: 'l1_business_process_changes',
  l2_hr_due_diligence: 'l2_hr_due_diligence',
  l3_accessibility_visitors: 'l3_accessibility_visitors',
  l5_vc_corrective_actions: 'l5_vc_corrective_actions',
};

const P7_COL_MAP = { e1_affiliations_count: 'e1_affiliations_count' };

const P8_COL_MAP = {
  e3_community_grievance: 'e3_community_grievance',
  l3_preferential_procurement: 'l3_preferential_procurement',
  l3_vulnerable_groups: 'l3_vulnerable_groups', l3_procurement_pct: 'l3_procurement_pct',
};

const P9_COL_MAP = {
  e1_complaint_mechanism: 'e1_complaint_mechanism',
  e5_cybersecurity_policy: 'e5_cybersecurity_policy', e5_policy_url: 'e5_policy_url',
  e6_corrective_actions: 'e6_corrective_actions', l1_info_channels: 'l1_info_channels',
  l2_consumer_education: 'l2_consumer_education',
  l3_disruption_mechanism: 'l3_disruption_mechanism',
  l4_product_info_beyond: 'l4_product_info_beyond',
};

// ── Value extractors ──────────────────────────────────────────────────────────

function saExtract(data, key) {
  const col = SA_COL_MAP[key];
  if (col) return data[col] ?? null;
  return (data.disclosures || {})[key] ?? null;
}

function sbExtract(data, key) {
  const col = SB_COL_MAP[key];
  if (col) return data[col] ?? null;
  return (data.policy_grid || {})[key] ?? null;
}

function p6Extract(data, key) {
  const col = P6_COL_MAP[key];
  if (col) return data[col] ?? null;
  return (data.disclosures || {})[key] ?? null;
}

function namedExtract(colMap) {
  return (data, key) => {
    const col = colMap[key];
    if (col) return data[col] ?? null;
    return data[key] ?? null;
  };
}

// ── Table renderers ───────────────────────────────────────────────────────────

const SPECIALIST_TYPES = new Set([
  'specialist_table', 'water_withdrawal_table', 'air_emissions_table',
  'waste_table', 'waste_recovery_table', 'waste_disposal_table',
]);

function renderSpecialistTable(doc, field, value, y, pageWidth, margin) {
  const schema = field.table_schema;
  if (!schema || !schema.rows || !schema.columns) return y;
  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const labelW = Math.min(180, Math.floor(contentWidth * 0.32));
  const colW   = Math.floor((contentWidth - labelW) / schema.columns.length);

  const headers   = ['', ...schema.columns.map(c => c.label)];
  const colWidths = [labelW, ...schema.columns.map(() => colW)];
  const data      = (value && typeof value === 'object' && !Array.isArray(value)) ? value : {};

  const rows = schema.rows.map(row => {
    const rv = data[row.key] || {};
    return [
      row.label,
      ...schema.columns.map(col => formatValue(rv[col.key])),
    ];
  });

  return drawTable(doc, { x, y, colWidths, headers, rows, margin, fontSize: 7, headerFontSize: 7, cellPadding: 3 });
}

function renderDynamicTable(doc, field, value, y, pageWidth, margin) {
  const cols = field.columns;
  if (!cols || !Array.isArray(cols)) return y;
  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const baseW    = Math.floor(contentWidth / cols.length);
  const extra    = contentWidth - baseW * cols.length;
  const colWidths = cols.map((_, i) => i === 0 ? baseW + extra : baseW);
  const headers  = cols.map(c => c.label);
  const arr      = Array.isArray(value) ? value : [];
  const rows     = arr.length
    ? arr.map(row => cols.map(col => formatValue(row[col.key])))
    : [cols.map(() => '—')];

  return drawTable(doc, { x, y, colWidths, headers, rows, margin, fontSize: 7, headerFontSize: 7, cellPadding: 3 });
}

function renderMatrixHeadcount(doc, field, value, y, pageWidth, margin) {
  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const labelW  = Math.min(190, Math.floor(contentWidth * 0.35));
  const dataW   = Math.floor((contentWidth - labelW) / 5);
  const colWidths = [labelW, dataW, dataW, dataW, dataW, dataW];
  const headers   = ['Category', 'Total', 'Male', 'Male %', 'Female', 'Female %'];
  const data = (value && typeof value === 'object') ? value : {};

  const rows = (field.rows || []).map(row => {
    const rv     = data[row.key] || {};
    const total  = rv.total  != null ? Number(rv.total)  : null;
    const male   = rv.male   != null ? Number(rv.male)   : null;
    const female = rv.female != null ? Number(rv.female) : null;
    const malePct   = (male   != null && total) ? ((male   / total) * 100).toFixed(1) + '%' : '—';
    const femalePct = (female != null && total) ? ((female / total) * 100).toFixed(1) + '%' : '—';
    return [row.label, formatValue(total), formatValue(male), malePct, formatValue(female), femalePct];
  });

  return drawTable(doc, { x, y, colWidths, headers, rows, margin, fontSize: 7, headerFontSize: 7, cellPadding: 3 });
}

function renderMatrixWomenRep(doc, field, value, y, pageWidth, margin) {
  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const labelW  = Math.min(220, Math.floor(contentWidth * 0.40));
  const dataW   = Math.floor((contentWidth - labelW) / 3);
  const colWidths = [labelW, dataW, dataW, dataW];
  const headers   = ['Category', 'Total', 'Female No.', 'Female %'];
  const data = (value && typeof value === 'object') ? value : {};

  const rows = (field.rows || []).map(row => {
    const rv     = data[row.key] || {};
    const total  = rv.total  != null ? Number(rv.total)  : null;
    const female = rv.female != null ? Number(rv.female) : null;
    const pct    = (female != null && total) ? ((female / total) * 100).toFixed(1) + '%' : '—';
    return [row.label, formatValue(total), formatValue(female), pct];
  });

  return drawTable(doc, { x, y, colWidths, headers, rows, margin, fontSize: 7, headerFontSize: 7, cellPadding: 3 });
}

function renderMatrixTurnover(doc, field, value, y, pageWidth, margin) {
  const data = (value && typeof value === 'object') ? value : {};
  const fySet = new Set();
  (field.rows || []).forEach(row => {
    Object.keys(data[row.key] || {}).forEach(k => fySet.add(k));
  });
  const fys = Array.from(fySet).sort().reverse().slice(0, 3);
  if (!fys.length) {
    return drawField(doc, field.label, '—', margin, y, { pageWidth, margin, contentWidth: pageWidth - margin * 2 });
  }

  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const labelW = Math.min(150, Math.floor(contentWidth * 0.25));
  const subW   = Math.floor((contentWidth - labelW) / (fys.length * 3));
  const colWidths = [labelW, ...fys.flatMap(() => [subW, subW, subW])];
  const headers   = ['Category', ...fys.flatMap(fy => [`${fy} M`, `${fy} F`, `${fy} T`])];

  const rows = (field.rows || []).map(row => {
    const rv = data[row.key] || {};
    const cells = [row.label];
    fys.forEach(fy => {
      const fv    = rv[fy] || {};
      const male   = fv.male   != null ? Number(fv.male)   : null;
      const female = fv.female != null ? Number(fv.female) : null;
      const total  = (male != null && female != null) ? (male + female) : null;
      cells.push(formatValue(male), formatValue(female), formatValue(total));
    });
    return cells;
  });

  return drawTable(doc, { x, y, colWidths, headers, rows, margin, fontSize: 7, headerFontSize: 7, cellPadding: 3 });
}

// ── Generic category + field renderer ────────────────────────────────────────

function noData(doc, y, pageWidth, margin) {
  doc.fillColor(COLORS.gray).font('Helvetica').fontSize(8)
     .text('No data entered for this section.', margin, y, { width: pageWidth - margin * 2 });
  return y + 14;
}

function renderCategories(doc, fieldDefs, extractFn, data, y, pageWidth, margin) {
  const x = margin;
  const contentWidth = pageWidth - margin * 2;
  const fieldOpts = { pageWidth, margin, contentWidth };

  for (const cat of fieldDefs) {
    y = checkPageBreak(doc, y, 22, margin);
    y = drawSubHeader(doc, cat.label, y, pageWidth, margin, {
      brsrCore:   !!cat.brsr_core,
      leadership: !!cat.leadership,
    });

    for (const field of cat.fields) {
      const value = extractFn(data, field.key);

      if (field.type === 'principle_grid') {
        y = checkPageBreak(doc, y, 22, margin);
        doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(7.5)
           .text(field.label, x, y, { width: contentWidth });
        y += 12;
        y = drawPrincipleGrid(doc, value, PRINCIPLE_KEYS, field.sub_rows, y, pageWidth, margin);

      } else if (SPECIALIST_TYPES.has(field.type)) {
        y = checkPageBreak(doc, y, 20, margin);
        doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(7.5)
           .text(field.label, x, y, { width: contentWidth });
        y += 11;
        y = renderSpecialistTable(doc, field, value, y, pageWidth, margin);

      } else if (field.type === 'dynamic_table') {
        y = checkPageBreak(doc, y, 20, margin);
        doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(7.5)
           .text(field.label, x, y, { width: contentWidth });
        y += 11;
        y = renderDynamicTable(doc, field, value, y, pageWidth, margin);

      } else if (field.type === 'matrix') {
        y = checkPageBreak(doc, y, 20, margin);
        doc.fillColor(COLORS.gray).font('Helvetica-Bold').fontSize(7.5)
           .text(field.label, x, y, { width: contentWidth });
        y += 11;
        const hasData = value && typeof value === 'object' && Object.keys(value).length > 0;
        if (!hasData) {
          doc.fillColor(COLORS.gray).font('Helvetica').fontSize(8)
             .text('No data entered', x, y, { width: contentWidth });
          y += 13;
        } else if (field.matrix_type === 'headcount') {
          y = renderMatrixHeadcount(doc, field, value, y, pageWidth, margin);
        } else if (field.matrix_type === 'women_rep') {
          y = renderMatrixWomenRep(doc, field, value, y, pageWidth, margin);
        } else if (field.matrix_type === 'turnover') {
          y = renderMatrixTurnover(doc, field, value, y, pageWidth, margin);
        } else {
          y = drawField(doc, field.label, JSON.stringify(value), x, y, fieldOpts);
        }

      } else {
        // text / textarea / number / currency / select / multiselect / etc.
        y = drawField(doc, field.label, value, x, y, fieldOpts);
      }
    }

    y += 6;
  }

  return y;
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderSectionA(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'SECTION A — General Disclosures', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, SECTION_A_FIELDS, saExtract, data, y, pageWidth, margin);
}

function renderSectionB(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'SECTION B — Management and Process Disclosures', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, SECTION_B_FIELDS, sbExtract, data, y, pageWidth, margin);
}

function renderP1(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 1 — Ethics, Transparency & Accountability', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P1_FIELDS, namedExtract(P1_COL_MAP), data, y, pageWidth, margin);
}

function renderP2(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 2 — Sustainable Products & Services', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P2_FIELDS, namedExtract(P2_COL_MAP), data, y, pageWidth, margin);
}

function renderP3(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 3 — Employee Well-being', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P3_FIELDS, namedExtract(P3_COL_MAP), data, y, pageWidth, margin);
}

function renderP4(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 4 — Stakeholder Responsiveness', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P4_FIELDS, namedExtract(P4_COL_MAP), data, y, pageWidth, margin);
}

function renderP5(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 5 — Human Rights', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P5_FIELDS, namedExtract(P5_COL_MAP), data, y, pageWidth, margin);
}

function renderP6(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 6 — Environment', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P6_FIELDS, p6Extract, data, y, pageWidth, margin);
}

function renderP7(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 7 — Policy Advocacy', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P7_FIELDS, namedExtract(P7_COL_MAP), data, y, pageWidth, margin);
}

function renderP8(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 8 — Inclusive Growth', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P8_FIELDS, namedExtract(P8_COL_MAP), data, y, pageWidth, margin);
}

function renderP9(doc, data, y, pageWidth, margin) {
  y = drawSectionHeader(doc, 'PRINCIPLE 9 — Consumer Responsibility', y, pageWidth, margin);
  if (!data || !Object.keys(data).length) return noData(doc, y, pageWidth, margin);
  return renderCategories(doc, P9_FIELDS, namedExtract(P9_COL_MAP), data, y, pageWidth, margin);
}

module.exports = {
  renderSectionA, renderSectionB,
  renderP1, renderP2, renderP3, renderP4, renderP5,
  renderP6, renderP7, renderP8, renderP9,
};
