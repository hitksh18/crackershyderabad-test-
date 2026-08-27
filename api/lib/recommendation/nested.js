'use strict';

/* ---------------------------------------------------------------------------
   Firestore document shape normalisation.

   Depending on how a nested map was written (dotted string keys vs FieldPath
   vs genuine nested objects), a read can come back with:
     • categoryPrefs.rockets                  – literal dotted key (gRPC)
     • categoryPrefs.`kids special`           – backtick-escaped segment
     • categoryPrefs: { rockets: ... }        – genuine nested object (REST)
   This helper collapses all three representations into a plain nested map.
   ------------------------------------------------------------------------- */

/**
 * Extract a child map for a dotted prefix (e.g. 'categoryPrefs' or 'days').
 * Handles literal dotted keys, backtick-escaped segments and genuine nested
 * objects. Only direct children are surfaced; deeper paths are joined back
 * with a dot.
 */
function extractNestedMap(root, prefix) {
  const out = {};

  if (!root || typeof root !== 'object') return out;

  const direct = root[prefix];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    Object.assign(out, direct);
  }

  const prefixDot = `${prefix}.`;
  for (const [key, value] of Object.entries(root)) {
    if (!key.startsWith(prefixDot)) continue;
    const remainder = key.slice(prefixDot.length);
    const segments = remainder.split('.').map(unescapeSegment);
    const childKey = segments[0];
    if (!childKey) continue;
    if (segments.length === 1) {
      out[childKey] = value;
    } else {
      // Deeper nesting: keep as best-effort dotted key.
      out[segments.join('.')] = value;
    }
  }

  return out;
}

function unescapeSegment(segment) {
  return String(segment).replace(/^`+|`+$/g, '');
}

module.exports = { extractNestedMap };