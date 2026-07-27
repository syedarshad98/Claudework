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
//
// The fit-check itself uses heightOfString (± wraps to a second line?)
// rather than comparing widthOfString to maxWidth. Confirmed by rendering:
// with a non-zero characterSpacing, widthOfString and the width pdfkit
// actually wraps text() at do NOT agree — a candidate that widthOfString
// reports as fitting under maxWidth can still wrap to two lines when drawn
// with that same maxWidth, silently orphaning a character or two onto their
// own second line with no ellipsis in sight. heightOfString runs the same
// layout pass text() itself uses, so it can't disagree with the real draw.
function truncateToFit(doc, text, maxWidth, opts) {
  opts = opts || {};
  const fontName      = opts.font || F('bodyMedium');
  const fontSize      = opts.fontSize || 8.5;
  const characterSpacing = opts.characterSpacing || 0;
  doc.font(fontName).fontSize(fontSize);

  const oneLineHeight = doc.currentLineHeight() * 1.1; // small tolerance for rounding
  const fitsOneLine = (s) => doc.heightOfString(s, { width: maxWidth, characterSpacing, lineBreak: false }) <= oneLineHeight;

  if (fitsOneLine(text)) return text;

  const ellipsis = '…';
  let lo = 0, hi = text.length, best = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = text.slice(0, mid) + ellipsis;
    if (fitsOneLine(candidate)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, best).trimEnd() + ellipsis;
}

// ── Value + unit (shared baseline) ──────────────────────────────────────
// Draws a big number immediately followed by a smaller unit string, sitting
// on the same visual baseline — e.g. "1,234.56  tCO2e". pdfkit's own
// `continued: true` text-chaining (the obvious way to do this) does NOT
// reliably keep two very different font sizes on a shared baseline: the
// `baseline: 'alphabetic'` option on the continuation run positions it near
// the TOP of the first run's line box instead of at its actual baseline —
// confirmed only by rendering to PNG, where the unit floated up next to the
// label instead of sitting beside the number. Positioning the unit manually,
// offset by an ascender ratio empirically tuned against the Poppins family
// this app actually ships, avoids depending on that pdfkit behavior at all.
// Returns the pixel width the value text alone consumed (for callers that
// need to know where the value ends, independent of the unit).
const VALUE_UNIT_BASELINE_RATIO = 0.8;

function drawValueWithUnit(doc, x, y, value, unit, opts) {
  opts = opts || {};
  const valueFont  = opts.valueFont  || F('heading');
  const valueSize  = opts.valueSize  || 32;
  const valueColor = opts.valueColor || COLORS.ink;
  const unitFont   = opts.unitFont   || F('body');
  const unitSize   = opts.unitSize   || Math.round(valueSize * 0.28);
  const unitColor  = opts.unitColor  || COLORS.gray;
  const gap        = opts.gap != null ? opts.gap : 8;

  doc.font(valueFont).fontSize(valueSize);
  const valueWidth = doc.widthOfString(value);
  doc.fillColor(valueColor).text(value, x, y, { lineBreak: false });

  if (unit) {
    const unitY = y + (valueSize - unitSize) * VALUE_UNIT_BASELINE_RATIO;
    doc.font(unitFont).fontSize(unitSize).fillColor(unitColor)
       .text(unit, x + valueWidth + gap, unitY, { lineBreak: false });
  }

  return valueWidth;
}

// ── Hero metric ──────────────────────────────────────────────────────────
// A dominant label + big number + unit, sharing one typographic scale so
// the cover page and the Executive Summary's own hero total never drift
// apart into two different "big number" treatments. Returns the y position
// just past the metric (before any accent rule the caller adds).
function drawHeroMetric(doc, opts) {
  const {
    x, y, width,
    label,
    value,
    unit,
    valueFontSize = 64,
    unitFontSize  = 18,
    labelFontSize = 11,
    labelColor    = COLORS.gray,
    valueColor    = COLORS.ink,
    unitColor     = COLORS.gray,
  } = opts;

  let cursorY = y;
  if (label) {
    doc.fillColor(labelColor).font(F('bodyMedium')).fontSize(labelFontSize)
       .text(String(label).toUpperCase(), x, cursorY, { characterSpacing: 1, width });
    cursorY += labelFontSize + 7;
  }

  drawValueWithUnit(doc, x, cursorY, String(value), unit, {
    valueFont: F('heading'), valueSize: valueFontSize, valueColor,
    unitFont:  F('body'),    unitSize:  unitFontSize,   unitColor,
  });
  cursorY += valueFontSize + 6;

  return cursorY;
}

// ── Cover page ───────────────────────────────────────────────────────────
// Full teal banner across the top third, company + title inside it, an
// amber accent rule, then a large headline metric and metadata below on
// white. Leaves the document positioned at the top of a fresh page after
// (caller should doc.addPage() next for the highlights/executive summary).
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
  const bannerHeight  = pageHeight * 0.34;

  doc.rect(0, 0, pageWidth, bannerHeight).fill(COLORS.tealDark);
  doc.rect(0, bannerHeight, pageWidth, 6).fill(COLORS.amber);

  doc.fillColor(COLORS.white).font(F('bodyMedium')).fontSize(11)
     .text('CLEARTRACE', margin, bannerHeight * 0.24, { characterSpacing: 2 });

  doc.fillColor(COLORS.white).font(F('heading')).fontSize(28)
     .text(reportTitle, margin, bannerHeight * 0.24 + 20, { width: contentWidth });

  doc.fillColor(COLORS.amber).font(F('serifBold')).fontSize(15)
     .text(companyName || 'Your Organisation', margin, bannerHeight * 0.24 + 58, { width: contentWidth });

  if (period) {
    doc.fillColor(COLORS.white).font(F('body')).fontSize(10)
       .text(period, margin, bannerHeight * 0.24 + 84, { width: contentWidth });
  }

  // ── Headline metric, below the banner — the dominant element on the page ─
  let y = bannerHeight + 42;
  y = drawHeroMetric(doc, {
    x: margin, y, width: contentWidth,
    label: headlineLabel,
    value: headlineValue,
    unit:  headlineUnit,
    valueFontSize: 76,
    unitFontSize:  20,
  });
  y += 8;

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

// ── Scope strip ──────────────────────────────────────────────────────────
// A single slim bar divided into N equal segments (one per scope) — the
// v2 "demoted" treatment for Scope 1/2/3, replacing three full-height
// drawStatCard cards with a supporting strip that sits beneath a dominant
// hero metric instead of competing with it. Same badge-reserve-before-label
// discipline as drawStatCard, so a long scope label still can't run behind
// a badge pill. Returns { bottom }.
function drawScopeStrip(doc, opts) {
  const {
    x, y, width, height = 52,
    segments, // [{ label, value, unit, accentColor, badge }]
    fillColor = COLORS.lightGray,
  } = opts;

  const n    = segments.length;
  const segW = width / n;

  doc.rect(x, y, width, height).fill(fillColor);

  segments.forEach((seg, i) => {
    const segX     = x + i * segW;
    const padX     = 14;
    const contentX = segX + padX;
    const contentW = segW - padX * 2;

    const dotSize = 7;
    doc.rect(contentX, y + 14, dotSize, dotSize).fill(seg.accentColor || COLORS.teal);

    let badgeReserve = 0;
    if (seg.badge) {
      badgeReserve = measureBadgeWidth(doc, seg.badge.label, 6.5) + 6;
    }

    const labelX     = contentX + dotSize + 6;
    const labelWidth = Math.max(10, contentW - dotSize - 6 - badgeReserve);
    const labelText  = truncateToFit(doc, String(seg.label).toUpperCase(), labelWidth, { fontSize: 7.5, characterSpacing: 0.4 });
    doc.fillColor(COLORS.gray).font(F('bodyMedium')).fontSize(7.5)
       .text(labelText, labelX, y + 13.5, { width: labelWidth, characterSpacing: 0.4, lineBreak: false });

    drawValueWithUnit(doc, contentX, y + 27, String(seg.value), seg.unit, {
      valueFont: F('heading'), valueSize: 17,  valueColor: COLORS.ink,
      unitFont:  F('body'),    unitSize:  8.5, unitColor:  COLORS.gray,
      gap: 3,
    });

    if (seg.badge) {
      drawProvenanceBadge(doc, seg.badge.label, segX + segW - 10, y + 11, {
        variant: seg.badge.variant, align: 'right', fontSize: 6.5, height: 13,
      });
    }

    if (i > 0) {
      doc.moveTo(segX, y + 8).lineTo(segX, y + height - 8).lineWidth(0.75).strokeColor(COLORS.border).stroke();
    }
  });

  return { bottom: y + height };
}

// ── Highlight block ─────────────────────────────────────────────────────
// A single-stat "insight card" for the Highlights page: eyebrow label, a
// large computed number (optional — omit `value` for a genuine empty/
// fallback state, e.g. "no prior period yet"), a bold one-line headline,
// and a wrapped body paragraph. Height is measured from the actual body
// text before drawing, so callers with different-length empty-state vs
// populated-state copy don't need to hand-tune card heights themselves.
// Returns { bottom }.
function drawHighlightBlock(doc, opts) {
  const {
    x, y: startY, width,
    accentColor = COLORS.teal,
    fillColor   = COLORS.lightGray,
    eyebrow, value, valueUnit, headline, body, footnote,
    margin = 50,
  } = opts;

  const padX = 18, padY = 16;
  const contentWidth = width - padX * 2;

  doc.font(F('body')).fontSize(9.5);
  const bodyHeight = body ? doc.heightOfString(body, { width: contentWidth, lineGap: 2 }) : 0;

  let blockHeight = padY * 2;
  if (eyebrow)      blockHeight += 15;
  if (value != null) blockHeight += 46;
  if (headline)      blockHeight += 18;
  blockHeight += bodyHeight;
  if (footnote)       blockHeight += 16;

  const y = checkPageBreak(doc, startY, blockHeight + 10, margin);

  doc.rect(x, y, width, blockHeight).fill(fillColor);
  doc.rect(x, y, width, 4).fill(accentColor);

  let cy = y + padY;
  if (eyebrow) {
    doc.fillColor(COLORS.gray).font(F('bodyMedium')).fontSize(9)
       .text(String(eyebrow).toUpperCase(), x + padX, cy, { characterSpacing: 1, width: contentWidth });
    cy += 15;
  }

  if (value != null) {
    drawValueWithUnit(doc, x + padX, cy, String(value), valueUnit, {
      valueFont: F('heading'), valueSize: 32, valueColor: COLORS.ink,
      unitFont:  F('body'),    unitSize:  13, unitColor:  COLORS.gray,
      gap: 6,
    });
    cy += 46;
  }

  if (headline) {
    doc.fillColor(COLORS.tealDark).font(F('heading')).fontSize(10.5)
       .text(headline, x + padX, cy, { width: contentWidth });
    cy += 18;
  }

  if (body) {
    doc.fillColor(COLORS.neutralText).font(F('body')).fontSize(9.5)
       .text(body, x + padX, cy, { width: contentWidth, lineGap: 2 });
    cy += bodyHeight;
  }

  if (footnote) {
    doc.fillColor(COLORS.gray).font(F('body')).fontSize(8)
       .text(footnote, x + padX, cy + 2, { width: contentWidth });
  }

  return { bottom: y + blockHeight };
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
  drawHeroMetric,
  drawValueWithUnit,
  drawSectionHeader,
  drawStatCard,
  drawScopeStrip,
  drawHighlightBlock,
  drawProvenanceBadge,
  measureBadgeWidth,
  truncateToFit,
  classifyFactorSource,
};
