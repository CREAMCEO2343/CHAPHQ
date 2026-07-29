// hud.js
//
// The visual language of the Investing pillar, kept in its own module so
// investing.js can stay about portfolios and trades rather than about
// SVG arc math. Used only by Investing today — it lives in components/
// because it's generic drawing code, not because the look is meant to
// spread.
//
// The look is a tactical heads-up display: everything is drawn as thin
// glowing gold line-art rather than filled shapes, numbers are monospace
// readouts, and the portfolio allocation is a targeting-reticle dial
// instead of a pie chart. It is deliberately contained — nothing here
// leaks into Gym, Food or School, which keep the standard card UI.
//
// Nothing in this file touches storage or knows what a holding is. It
// takes numbers and returns markup.

// Angle 0 is at 12 o'clock, sweeping clockwise, because that's how a
// dial reads. SVG's own 0° is at 3 o'clock, hence the -90.
function polar(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

// One donut segment, stroked (never filled) so it reads as line-art.
function arcPath(cx, cy, radius, startAngle, endAngle) {
  // A single arc command can't draw a full circle — back it off a hair
  // so a 100% allocation still renders.
  if (endAngle - startAngle >= 359.9) endAngle = startAngle + 359.9;
  const [x1, y1] = polar(cx, cy, radius, startAngle);
  const [x2, y2] = polar(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// ===== Ring geometry =====
const SIZE = 240;
const C = SIZE / 2;
const R_RING = 72; // the allocation arcs
const R_LABEL = 88; // percentage readouts, just outside the arcs
const R_TICK_IN = 98;
const R_TICK_OUT = 104;

// Gold at descending intensity — the segments are all the same hue, so
// the dial stays one material and reads as a single instrument rather
// than a bag of colored slices.
const SEGMENT_ALPHA = [1, 0.82, 0.66, 0.52, 0.4, 0.3, 0.22];

// The graduated ring of ticks around the outside. Every 5th is a major
// tick — pure instrument-face decoration, no data encoded.
function tickMarks() {
  return Array.from({ length: 60 }, (_, i) => {
    const angle = i * 6;
    const major = i % 5 === 0;
    const [x1, y1] = polar(C, C, major ? R_TICK_IN - 5 : R_TICK_IN, angle);
    const [x2, y2] = polar(C, C, R_TICK_OUT, angle);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      class="hud-ring__tick${major ? ' hud-ring__tick--major' : ''}" />`;
  }).join('');
}

// Corner brackets — the four L-shapes that frame a targeting reticle.
function cornerBrackets() {
  const m = 6; // margin from the edge
  const l = 20; // leg length
  const corners = [
    `M ${m} ${m + l} L ${m} ${m} L ${m + l} ${m}`,
    `M ${SIZE - m - l} ${m} L ${SIZE - m} ${m} L ${SIZE - m} ${m + l}`,
    `M ${SIZE - m} ${SIZE - m - l} L ${SIZE - m} ${SIZE - m} L ${SIZE - m - l} ${SIZE - m}`,
    `M ${m + l} ${SIZE - m} L ${m} ${SIZE - m} L ${m} ${SIZE - m - l}`,
  ];
  return corners.map((d) => `<path d="${d}" class="hud-ring__bracket" />`).join('');
}

/**
 * The allocation dial.
 *
 * @param {object}  options
 * @param {string}  options.id        Unique per ring on the page (gradient ids).
 * @param {Array}   options.segments  [{ label, percent }] — pass [] for standby.
 * @param {string}  options.centerValue  Big monospace readout in the middle.
 * @param {string}  options.centerLabel  Small caps label above it.
 * @param {string}  options.footnote     Small caps line below it.
 *
 * With no segments the dial renders in "standby": the track and reticle
 * are there, but nothing is plotted. That's the honest state before any
 * closing prices have been entered — an empty instrument, not a fake
 * reading.
 */
export function renderRing({ id, segments = [], centerValue, centerLabel = '', footnote = '' }) {
  const standby = segments.length === 0;

  let angle = 0;
  const arcs = [];
  const labels = [];

  segments.forEach((segment, i) => {
    const sweep = (segment.percent / 100) * 360;
    // A 1.5° gap keeps adjacent segments from reading as one long arc.
    const gap = sweep > 4 ? 1.5 : 0;
    const alpha = SEGMENT_ALPHA[Math.min(i, SEGMENT_ALPHA.length - 1)];

    arcs.push(
      `<path d="${arcPath(C, C, R_RING, angle + gap / 2, angle + sweep - gap / 2)}"
         class="hud-ring__arc" style="stroke-opacity:${alpha};" />`
    );

    // Only label slices with room to be read — below ~7% the text
    // collides with its neighbours and the dial turns to mush.
    if (segment.percent >= 7) {
      const [lx, ly] = polar(C, C, R_LABEL, angle + sweep / 2);
      labels.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="hud-ring__label"
           text-anchor="middle" dominant-baseline="middle">${segment.percent.toFixed(0)}%</text>`
      );
    }
    angle += sweep;
  });

  return `
    <svg class="hud-ring${standby ? ' hud-ring--standby' : ''}" viewBox="0 0 ${SIZE} ${SIZE}" role="img"
         aria-label="${centerLabel} ${centerValue}">
      <defs>
        <!-- Stop colors come from CSS classes rather than attributes so
             they can read the --hud-gold custom property. -->
        <linearGradient id="${id}-sweep" gradientUnits="userSpaceOnUse"
                        x1="${C}" y1="${C}" x2="${C}" y2="${C - R_RING - 6}">
          <stop offset="0%" class="hud-sweep-stop--head" />
          <stop offset="100%" class="hud-sweep-stop--tail" />
        </linearGradient>
      </defs>

      ${cornerBrackets()}
      <g class="hud-ring__ticks">${tickMarks()}</g>

      <circle cx="${C}" cy="${C}" r="${R_RING}" class="hud-ring__track" />
      <circle cx="${C}" cy="${C}" r="${R_RING - 14}" class="hud-ring__inner" />

      <g class="hud-ring__arcs">${arcs.join('')}</g>
      ${labels.join('')}

      <!-- The radar sweep: one rotation each time the dial is drawn, so
           it fires exactly when the numbers behind it change. -->
      <g class="hud-ring__sweep">
        <line x1="${C}" y1="${C}" x2="${C}" y2="${C - R_RING - 6}" stroke="url(#${id}-sweep)" stroke-width="2" />
      </g>

      ${centerLabel ? `<text x="${C}" y="${C - 20}" class="hud-ring__center-label" text-anchor="middle">${centerLabel}</text>` : ''}
      <text x="${C}" y="${C + 6}" class="hud-ring__center-value" text-anchor="middle">${centerValue}</text>
      ${footnote ? `<text x="${C}" y="${C + 28}" class="hud-ring__center-foot" text-anchor="middle">${footnote}</text>` : ''}
    </svg>
  `;
}

/**
 * Turns raw {label, value} pairs into ring segments: sorted big-to-small,
 * with everything past `maxSegments` folded into a single OTHER slice so
 * the dial never turns into a barcode.
 */
export function toSegments(entries, maxSegments = 6) {
  const positive = entries.filter((e) => e.value != null && e.value > 0);
  const total = positive.reduce((sum, e) => sum + e.value, 0);
  if (total <= 0) return [];

  const sorted = [...positive].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, maxSegments);
  const tail = sorted.slice(maxSegments);

  const segments = head.map((e) => ({ label: e.label, percent: (e.value / total) * 100 }));
  if (tail.length) {
    const tailValue = tail.reduce((sum, e) => sum + e.value, 0);
    segments.push({ label: `Other (${tail.length})`, percent: (tailValue / total) * 100 });
  }
  return segments;
}

// The legend under a dial: one line per segment, percentages in mono and
// right-aligned so the decimal points stack.
export function renderRingLegend(segments) {
  if (segments.length === 0) return '';
  return `
    <div class="hud-legend">
      ${segments
        .map(
          (segment, i) => `
            <div class="hud-legend__row">
              <span class="hud-legend__mark" style="opacity:${SEGMENT_ALPHA[Math.min(i, SEGMENT_ALPHA.length - 1)]};"></span>
              <span class="hud-legend__label">${segment.label}</span>
              <span class="hud-legend__value mono">${segment.percent.toFixed(1)}%</span>
            </div>
          `
        )
        .join('')}
    </div>
  `;
}
