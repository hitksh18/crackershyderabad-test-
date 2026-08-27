/**
 * Regenerates src/utils/invoiceAssets.js — the logo bitmap and the money font
 * that the invoice PDF embeds.
 *
 *   node scripts/build-invoice-assets.mjs
 *
 * Why generated instead of loaded at run time: generateInvoicePDF must stay
 * synchronous. printInvoicePDF opens a tab, and a browser only allows that in
 * the same task as the click that asked for it — the moment an `await` lands in
 * that path the popup blocker eats the print window. Baking the bytes into the
 * module keeps the whole call synchronous, and means an invoice reprinted years
 * from now looks identical without depending on a file still being served.
 *
 * The two inputs:
 *
 *   public/images/website/crackerhyderabadlogo.png — the shop's own logo, the
 *   same file the footer uses. Downscaled here and flattened onto white, since
 *   it prints on white paper and a PNG with no alpha channel needs no soft mask
 *   in the PDF.
 *
 *   scripts/assets/NotoSans-Money-{Regular,Bold}.ttf — Noto Sans (SIL Open Font
 *   License 1.1, https://fonts.google.com/specimen/Noto+Sans), subset to the
 *   sixteen characters a price can contain. jsPDF's built-in Helvetica is
 *   WinAnsi-encoded and has no U+20B9, which is why prices used to print as
 *   "Rs 375"; that missing glyph is the whole reason a font is embedded at all.
 *   Noto Sans has a real rupee sign, and its digits are tabular — all ten share
 *   one advance in both weights, so the Rate and Amount columns line up down the
 *   page and a bold total row still aligns with the regular rows above it.
 *
 *   Do not swap this for a font without first checking it actually has U+20B9.
 *   Most do not, and the obvious tests lie: a missing character renders as
 *   .notdef, which in many families has its own outline and a non-zero advance,
 *   so "is the glyph non-empty" and "is the width non-zero" both pass for a
 *   character that is absent. Compare the rupee's width against a character you
 *   know is outside the subset — if they match, you are measuring .notdef. Lato
 *   was requested and rejected this way: no rupee in either weight.
 *
 *   Regenerate the subsets with (note the old User-Agent: it makes Google Fonts
 *   answer with TrueType instead of woff2, which is what jsPDF can embed):
 *     curl -A "Mozilla/4.0" "https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&text=%E2%82%B90123456789%2C.%2F%20-"
 *   then download the two truetype URLs it prints.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOGO_SRC = path.join(HERE, '..', 'public', 'images', 'website', 'crackerhyderabadlogo.png');
const FONT_DIR = path.join(HERE, 'assets');
const OUT = path.join(HERE, '..', 'src', 'utils', 'invoiceAssets.js');

/*
 * 170px for a mark drawn 17mm wide — 254 dpi, so a laser printer resolves the
 * ring of small caps around the rim instead of mushing it. Larger is pure cost:
 * this file ends up in a JavaScript bundle, where every pixel is bytes a
 * customer downloads.
 */
const LOGO_PX = 170;

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const readChunks = (buf) => {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  const out = [];
  let p = 8;
  while (p < buf.length) {
    const length = buf.readUInt32BE(p);
    out.push({ type: buf.subarray(p + 4, p + 8).toString('latin1'), data: buf.subarray(p + 8, p + 8 + length) });
    p += 12 + length;
  }
  return out;
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

/** Decode a non-interlaced 8-bit RGBA PNG. Enough for our own logo, not general. */
function decodeRGBA(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  const [depth, colorType, , , interlace] = [ihdr[8], ihdr[9], ihdr[10], ihdr[11], ihdr[12]];
  if (depth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unsupported PNG (depth ${depth}, colorType ${colorType}, interlace ${interlace})`);
  }

  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const bpp = 4;
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);

  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const filter = raw[p];
    p += 1;
    const line = raw.subarray(p, p + stride);
    p += stride;
    const row = y * stride;
    const above = row - stride;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? px[row + i - bpp] : 0;
      const b = y > 0 ? px[above + i] : 0;
      const c = y > 0 && i >= bpp ? px[above + i - bpp] : 0;
      const v = line[i];
      px[row + i] =
        (filter === 0 ? v
          : filter === 1 ? v + a
          : filter === 2 ? v + b
          : filter === 3 ? v + ((a + b) >> 1)
          : filter === 4 ? v + paeth(a, b, c)
          : (() => { throw new Error(`bad row filter ${filter}`); })()) & 0xff;
    }
  }

  return { w, h, px };
}

/** Tightest box that holds every pixel the eye can see, so margin costs nothing. */
function opaqueBounds({ w, h, px }) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (px[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('logo is fully transparent');
  // Square it off around the centre so the round mark is not squashed.
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x0: Math.max(0, Math.round(cx - side / 2)),
    y0: Math.max(0, Math.round(cy - side / 2)),
    side: Math.min(side, w, h),
  };
}

/**
 * Box-average down to `size`, compositing onto white.
 *
 * Averaging happens on alpha-premultiplied channels: the pixels just outside
 * the rim are transparent *black*, and averaging them raw would draw a grey
 * halo around the whole badge.
 */
function resizeOntoWhite(src, box, size) {
  const out = Buffer.alloc(size * size * 3);
  const edge = (i) => box.x0 + Math.floor((i * box.side) / size);
  const edgeY = (i) => box.y0 + Math.floor((i * box.side) / size);

  for (let ty = 0; ty < size; ty += 1) {
    const sy0 = edgeY(ty);
    const sy1 = Math.max(edgeY(ty + 1), sy0 + 1);
    for (let tx = 0; tx < size; tx += 1) {
      const sx0 = edge(tx);
      const sx1 = Math.max(edge(tx + 1), sx0 + 1);

      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let n = 0;
      for (let y = sy0; y < sy1; y += 1) {
        for (let x = sx0; x < sx1; x += 1) {
          const i = (y * src.w + x) * 4;
          const a = src.px[i + 3] / 255;
          r += src.px[i] * a;
          g += src.px[i + 1] * a;
          b += src.px[i + 2] * a;
          alpha += a;
          n += 1;
        }
      }

      const white = 255 * (1 - alpha / n);
      const o = (ty * size + tx) * 3;
      out[o] = Math.min(255, Math.round(r / n + white));
      out[o + 1] = Math.min(255, Math.round(g / n + white));
      out[o + 2] = Math.min(255, Math.round(b / n + white));
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** Encode 8-bit RGB, picking the cheapest row filter — the usual encoder heuristic. */
function encodeRGB(px, size) {
  const bpp = 3;
  const stride = size * bpp;
  const rows = [];

  for (let y = 0; y < size; y += 1) {
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best = null;

    for (let filter = 0; filter <= 4; filter += 1) {
      const line = Buffer.alloc(stride);
      for (let i = 0; i < stride; i += 1) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const v = cur[i];
        line[i] =
          (filter === 0 ? v
            : filter === 1 ? v - a
            : filter === 2 ? v - b
            : filter === 3 ? v - ((a + b) >> 1)
            : v - paeth(a, b, c)) & 0xff;
      }
      // Sum of absolute *signed* bytes: the standard proxy for how well the
      // row will deflate, without deflating all five to find out.
      let cost = 0;
      for (let i = 0; i < stride; i += 1) cost += line[i] < 128 ? line[i] : 256 - line[i];
      if (!best || cost < best.cost) best = { cost, filter, line };
    }

    rows.push(Buffer.concat([Buffer.from([best.filter]), best.line]));
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour, no alpha
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const source = decodeRGBA(fs.readFileSync(LOGO_SRC));
const bounds = opaqueBounds(source);
const logoPng = encodeRGB(resizeOntoWhite(source, bounds, LOGO_PX), LOGO_PX);
const logoB64 = logoPng.toString('base64');

const fontRegular = fs.readFileSync(path.join(FONT_DIR, 'NotoSans-Money-Regular.ttf')).toString('base64');
const fontBold = fs.readFileSync(path.join(FONT_DIR, 'NotoSans-Money-Bold.ttf')).toString('base64');

const banner = `/**
 * GENERATED FILE — do not edit by hand.
 * Run \`node scripts/build-invoice-assets.mjs\` to rebuild from the logo in
 * public/images/website/ and the fonts in scripts/assets/. That script explains
 * why these are baked in rather than fetched.
 *
 * MONEY_FONT_* is Noto Sans, SIL Open Font License 1.1, subset to
 * " ,-./0123456789₹". Only those sixteen characters exist in it — see money()
 * in pdfGenerator.js, which is the only place allowed to build a string drawn
 * in this font. Attribution: scripts/assets/NOTICE.txt, licence: OFL.txt.
 */`;

fs.writeFileSync(
  OUT,
  `${banner}

/** ${LOGO_PX}x${LOGO_PX} RGB PNG, flattened onto white, cropped to the badge. */
export const LOGO_PNG_BASE64 =
  '${logoB64}';

export const LOGO_PNG_DATA_URL = \`data:image/png;base64,\${LOGO_PNG_BASE64}\`;

export const MONEY_FONT_REGULAR_BASE64 =
  '${fontRegular}';

export const MONEY_FONT_BOLD_BASE64 =
  '${fontBold}';
`,
  'utf8'
);

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(`logo      ${bounds.side}px crop -> ${LOGO_PX}px  ${kb(logoPng.length)} png, ${kb(logoB64.length)} base64`);
console.log(`font 400  ${kb(fontRegular.length)} base64`);
console.log(`font 700  ${kb(fontBold.length)} base64`);
console.log(`wrote     ${path.relative(path.join(HERE, '..'), OUT)}`);
