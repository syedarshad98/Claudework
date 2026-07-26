'use strict';

// Shared PDFKit drawing primitives + palette for ClearTrace-generated reports.
// One source of truth for color/typography so individual report routes stop
// hardcoding hex values per section.
//
// Font files are resolved via require.resolve() against the installed
// @fontsource packages rather than a path built off __dirname or cwd, so
// resolution is identical in dev and on the deploy host regardless of the
// working directory the process was started from.
//
// NOTE: @fontsource ships .woff/.woff2 files, no .ttf. Registering the
// .woff2 variant does NOT throw in this pdfkit/fontkit version, but the
// glyphs render as blank whitespace — confirmed by rendering a test PDF to
// PNG. The plain .woff variant renders correctly. Use .woff only.

const COLORS = {
  tealDark:    '#0b3d33',
  teal:        '#1c7a5c',
  amber:       '#f2b84b',
  amberBg:     '#fdf1dc',
  amberDark:   '#a8681a', // readable-on-white variant of amber, for text/status labels
  slateBlue:   '#4a7fb5',
  slateBlueBg: '#e8eff7',
  ink:         '#1a2332',
  gray:        '#6b7280',
  lightGray:   '#f2f4f3',
  border:      '#dfe4e1',
  white:       '#ffffff',
  neutralBg:   '#eceeed',
  neutralText: '#4b5563',
};

const FONT_FILES = {
  'Poppins':          '@fontsource/poppins/files/poppins-latin-400-normal.woff',
  'Poppins-Medium':   '@fontsource/poppins/files/poppins-latin-500-normal.woff',
  'Poppins-Bold':     '@fontsource/poppins/files/poppins-latin-700-normal.woff',
  'Lora':             '@fontsource/lora/files/lora-latin-400-normal.woff',
  'Lora-Bold':        '@fontsource/lora/files/lora-latin-700-normal.woff',
};

// Logical role -> font name, resolved to the fallback map below when
// registration fails.
const FONT_ROLES = {
  body:          'Poppins',
  bodyMedium:    'Poppins-Medium',
  heading:       'Poppins-Bold',
  serif:         'Lora',
  serifBold:     'Lora-Bold',
};

const FALLBACK_ROLES = {
  body:          'Helvetica',
  bodyMedium:    'Helvetica-Bold',
  heading:       'Helvetica-Bold',
  serif:         'Helvetica',
  serifBold:     'Helvetica-Bold',
};

let customFontsAvailable = null; // null = not yet determined this process

// Registers the custom fonts on the given PDFDocument instance. Must be
// called once per `new PDFDocument()` — pdfkit fonts are per-document, not
// global. Falls back to Helvetica (and logs) if registration fails for any
// reason, so PDF generation never crashes over a font problem.
function registerFonts(doc) {
  try {
    for (const [name, pkgPath] of Object.entries(FONT_FILES)) {
      doc.registerFont(name, require.resolve(pkgPath));
    }
    customFontsAvailable = true;
  } catch (err) {
    console.error('pdf-design-system: font registration failed, falling back to Helvetica:', err.message);
    customFontsAvailable = false;
  }
  return customFontsAvailable;
}

// Resolves a logical font role ('body' | 'bodyMedium' | 'heading' | 'serif' |
// 'serifBold') to the actual registered font name, honoring fallback state.
function F(role) {
  const map = customFontsAvailable ? FONT_ROLES : FALLBACK_ROLES;
  return map[role] || FALLBACK_ROLES[role];
}

function checkPageBreak(doc, currentY, neededHeight, margin) {
  if (currentY + neededHeight > doc.page.height - margin) {
    doc.addPage();
    return margin;
  }
  return currentY;
}

// Truncates `text` with a trailing ellipsis so it fits `maxWidth` on one
// line. pdfkit's own `lineBreak:false` + `ellipsis:true` combination does
// not reliably single-line-truncate (confirmed by rendering — it still
// wraps), so this measures and cuts the string ourselves instead of
// trusting that option pair.
function truncateToFit(doc, text, maxWidth, opts) {
  opts = opts || {};
  const fontName      = opts.font || F('bodyMedium');
  const fontSize      = opts.fontSize || 8.5;
  const characterSpacing = opts.characterSpacing || 0;
  doc.font(fontName).fontSize(fontSize);

  if (doc.widthOfString(text, { characterSpacing }) <= maxWidth) return text;

  const ellipsis = '…';
  let lo = 0, hi = text.length, best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (doc.widthOfString(candidate, { characterSpacing }) <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, best).trimEnd() + ellipsis;
}

// ── Cover page ───────────────────────────────────────────────────────────
// Full teal banner across the top third, company + title inside it, an
// amber accent rule, then a large headline metric and metadata below on
// white. Leaves the document positioned at the top of a fresh page after
// (caller should doc.addPage() next for the executive summary).
function drawCoverPage(doc, opts) {
  const {
    reportTitle    = 'ESG Summary Report',
    companyName,
    period,
    headlineLabel  = 'Total GHG Emissions',
    headlineValue,
    headlineUnit   = 'tCO2e',
    generatedDate,
    margin = 50,
  } = opts;

  const pageWidth    = doc.page.width;
  const pageHeight    = doc.page.height;
  const contentWidth  = pageWidth - margin * 2;
  const bannerHeight  = pageHeight * 0.38;

  doc.rect(0, 0, pageWidth, bannerHeight).fill(COLORS.tealDark);
  doc.rect(0, bannerHeight, pageWidth, 6).fill(COLORS.amber);

  doc.fillColor(COLORS.white).font(F('bodyMedium')).fontSize(11)
     .text('CLEARTRACE', margin, bannerHeight * 0.28, { characterSpacing: 2 });

  doc.fillColor(COLORS.white).font(F('heading')).fontSize(30)
     .text(reportTitle, margin, bannerHeight * 0.28 + 22, { width: contentWidth });

  doc.fillColor(COLORS.amber).font(F('serifBold')).fontSize(16)
     .text(companyName || 'Your Organisation', margin, bannerHeight * 0.28 + 62, { width: contentWidth });

  if (period) {
    doc.fillColor(COLORS.white).font(F('body')).fontSize(10)
       .text(period, margin, bannerHeight * 0.28 + 90, { width: contentWidth });
  }

  // ── Headline metric, below the banner ─────────────────────────────────
  let y = bannerHeight + 50;
  doc.fillColor(COLORS.gray).font(F('bodyMedium')).fontSize(11)
     .text(headlineLabel.toUpperCase(), margin, y, { characterSpacing: 1 });
  y += 18;
  doc.fillColor(COLORS.ink).font(F('heading')).fontSize(48)
     .text(String(headlineValue), margin, y, { continued: true })
     .font(F('body')).fontSize(16).fillColor(COLORS.gray)
     .text(`  ${headlineUnit}`, { baseline: 'alphabetic' });
  y += 66;

  doc.moveTo(margin, y).lineTo(margin + 120, y).lineWidth(3).strokeColor(COLORS.amber).stroke();
  y += 20;

  if (generatedDate) {
    doc.fillColor(COLORS.gray).font(F('body')).fontSize(9)
       .text(`Generated ${generatedDate}`, margin, y);
  }

  // Footer strap — kept well clear of maxY() so it can't trip pdfkit's
  // own bottom-of-page check and silently spill onto a fresh blank page.
  doc.fillColor(COLORS.gray).font(F('body')).fontSize(8)
     .text('ClearTrace ESG Intelligence Platform', margin, pageHeight - margin - 24, {
       width: contentWidth, align: 'center',
     });
}

// ── Section header ──────────────────────────────────────────────────────
// Teal bar with a small amber tab on the left edge. Returns the y position
// just below the header, ready for content.
function drawSectionHeader(doc, title, y, opts) {
  opts = opts || {};
  const margin       = opts.margin || 50;
  const pageWidth     = opts.pageWidth || doc.page.width;
  const contentWidth  = pageWidth - margin * 2;
  const height        = opts.height || 26;

  y = checkPageBreak(doc, y, height + 4, margin);

  doc.rect(margin, y, contentWidth, height).fill(COLORS.teal);
  doc.rect(margin, y, 5, height).fill(COLORS.amber);
  doc.fillColor(COLORS.white).font(F('heading')).fontSize(11)
     .text(title, margin + 16, y + height / 2 - 5, { width: contentWidth - 28, lineBreak: false });

  return y + height + 12;
}

// ── Stat card ────────────────────────────────────────────────────────────
// Colored top border, small caps label, large number, optional unit and
// optional provenance badge in the corner. Returns { bottom } — the y
// coordinate just past the card, for stacking layouts.
function drawStatCard(doc, opts) {
  const {
    x, y, width, height = 74,
    label,
    value,
    unit,
    accentColor = COLORS.teal,
    fillColor = COLORS.lightGray,
    badge = null, // optional { label, variant } — drawn top-right, label width shrinks to make room
  } = opts;

  doc.rect(x, y, width, height).fill(fillColor);
  doc.rect(x, y, width, 4).fill(accentColor);

  const padX = 12;

  // Reserve room for the badge (if any) BEFORE laying out the label, so a
  // long scope name can never run under/behind the pill — this is exactly
  // the kind of overlap that only shows up once rendered, not in code.
  let badgeReserve = 0;
  if (badge) {
    badgeReserve = measureBadgeWidth(doc, badge.label) + 8;
  }

  const labelWidth = width - padX * 2 - badgeReserve;
  const labelText  = truncateToFit(doc, String(label).toUpperCase(), labelWidth, { fontSize: 8.5, characterSpacing: 0.5 });
  doc.fillColor(COLORS.gray).font(F('bodyMedium')).fontSize(8.5)
     .text(labelText, x + padX, y + 14, { width: labelWidth, characterSpacing: 0.5, lineBreak: false });

  doc.fillColor(COLORS.ink).font(F('heading')).fontSize(22)
     .text(String(value), x + padX, y + 30, { width: width - padX * 2, lineBreak: false });

  if (unit) {
    doc.fillColor(COLORS.gray).font(F('body')).fontSize(8)
       .text(unit, x + padX, y + height - 16, { width: width - padX * 2 });
  }

  if (badge) {
    drawProvenanceBadge(doc, badge.label, x + width - 8, y + 8, { variant: badge.variant, align: 'right' });
  }

  return { bottom: y + height };
}

// ── Provenance badge ────────────────────────────────────────────────────
// Small rounded pill. `variant` selects the color:
//   'defra'    — teal   (DEFRA-sourced factor)
//   'cea'      — slate-blue (CEA / regional grid factor)
//   'custom'   — amber  (non-standard / user-supplied factor)
//   'reported' — neutral gray ("Reported value" — no calculation source,
//                e.g. water/waste/social/governance entries)
const BADGE_VARIANTS = {
  defra:    { fill: COLORS.teal,        text: COLORS.white },
  cea:      { fill: COLORS.slateBlue,   text: COLORS.white },
  custom:   { fill: COLORS.amberBg,     text: COLORS.tealDark, border: COLORS.amber },
  reported: { fill: COLORS.neutralBg,   text: COLORS.neutralText },
};

// Maps a raw factor_source string (e.g. "DEFRA 2023 (UK)") to a badge
// variant + short label. Falls back to 'custom' for anything unrecognized.
function classifyFactorSource(factorSource) {
  if (!factorSource) return { label: 'Reported value', variant: 'reported' };
  const s = String(factorSource);
  if (/^DEFRA/i.test(s)) return { label: 'DEFRA', variant: 'defra' };
  if (/^CEA/i.test(s))   return { label: 'CEA',   variant: 'cea' };
  return { label: s.length > 18 ? s.slice(0, 17) + '…' : s, variant: 'custom' };
}

// Pill width for a given badge label, without drawing it — lets a caller
// (e.g. drawStatCard) reserve layout space for a badge before it's placed.
function measureBadgeWidth(doc, text, fontSize) {
  fontSize = fontSize || 7;
  doc.font(F('bodyMedium')).fontSize(fontSize);
  return doc.widthOfString(text) + 7 * 2;
}

// Draws the badge and returns its width. `align: 'right'` treats `x` as the
// right edge and draws leftward instead.
function drawProvenanceBadge(doc, text, x, y, opts) {
  opts = opts || {};
  const variant = BADGE_VARIANTS[opts.variant] ? opts.variant : 'reported';
  const style    = BADGE_VARIANTS[variant];
  const fontSize = opts.fontSize || 7;
  const padX     = 7;
  const height   = opts.height || 14;

  doc.font(F('bodyMedium')).fontSize(fontSize);
  const textWidth = doc.widthOfString(text);
  const width     = textWidth + padX * 2;
  const drawX     = opts.align === 'right' ? x - width : x;

  doc.roundedRect(drawX, y, width, height, height / 2).fill(style.fill);
  if (style.border) {
    doc.roundedRect(drawX, y, width, height, height / 2).lineWidth(0.75).strokeColor(style.border).stroke();
  }
  doc.fillColor(style.text).font(F('bodyMedium')).fontSize(fontSize)
     .text(text, drawX + padX, y + (height - fontSize) / 2 - 1, { width: textWidth, lineBreak: false });

  return width;
}

module.exports = {
  COLORS,
  F,
  registerFonts,
  checkPageBreak,
  drawCoverPage,
  drawSectionHeader,
  drawStatCard,
  drawProvenanceBadge,
  measureBadgeWidth,
  truncateToFit,
  classifyFactorSource,
};
