export interface ExifGPS {
  latitude: number;
  longitude: number;
}

export interface RawExifData {
  make?: string | null;
  model?: string | null;
  date?: string | null;
  dateOriginal?: string | null;
  exposureTime?: number | null;
  fNumber?: number | null;
  iso?: number | null;
  focalLength?: number | null;
  gps?: ExifGPS;
}

export interface ImageResult {
  index: number;
  type: string;
  location: string;
  url: string;
  dimensions: string;
  altText: string;
  cameraMake: string;
  cameraModel: string;
  dateTaken: string;
  exposure: string;
  aperture: string;
  iso: string;
  gpsCoordinates: string;
  status: string;
  rawExif?: RawExifData | null;
}

export interface AnalyzeOptions {
  rangeBytes?: number;
  rootElement?: Document | Element | ShadowRoot;
  logToConsole?: boolean;
}

export interface ImageSource {
  type: string;
  where: string;
  src: string;
  img: HTMLImageElement | null;
}

const TYPE_SIZES: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1,
  7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8
};

interface IFDEntry {
  type: number;
  count: number;
  offset: number;
}

type ExifScalar = number | null;
type ExifValue = string | Uint8Array | ExifScalar | ExifScalar[];

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export function parseImageExif(arrayBuffer: ArrayBuffer): RawExifData | null {
  if (!arrayBuffer || arrayBuffer.byteLength < 12) return null;

  const view = new DataView(arrayBuffer);
  let exifOffset: number | null = null;
  let isLittleEndian = false;

  const magic16 = view.getUint16(0, false);
  const magic32 = view.getUint32(0, false);

  if (magic16 === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);

      if (marker === 0xff) {
        offset += 1;
        continue;
      }

      if (marker === 0xda || marker === 0xd9) break;

      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }

      const length = view.getUint16(offset + 2, false);
      if (length < 2 || offset + 2 + length > view.byteLength) break;

      if (marker === 0xe1 && length >= 8) {
        const app1Start = offset + 4;
        if (
          app1Start + 6 <= view.byteLength &&
          view.getUint32(app1Start, false) === 0x45786966 &&
          view.getUint16(app1Start + 4, false) === 0x0000
        ) {
          exifOffset = app1Start + 6;
          break;
        }
      }
      offset += 2 + length;
    }
  }
  else if (magic32 === 0x89504e47) {
    if (view.byteLength < 8 || view.getUint32(4, false) !== 0x0d0a1a0a) return null;
    let offset = 8;
    while (offset + 8 <= view.byteLength) {
      const chunkLength = view.getUint32(offset, false);
      const chunkType = view.getUint32(offset + 4, false);
      if (offset + 12 + chunkLength > view.byteLength) break;

      if (chunkType === 0x65584966) {
        exifOffset = offset + 8;
        break;
      }
      offset += 12 + chunkLength;
    }
  }
  else if (magic32 === 0x52494646) {
    if (view.byteLength < 12 || view.getUint32(8, false) !== 0x57454250) return null;
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const chunkType = view.getUint32(offset, false);
      const chunkLength = view.getUint32(offset + 4, true);
      if (offset + 8 + chunkLength > view.byteLength) break;

      if (chunkType === 0x45584946) {
        exifOffset = offset + 8;
        if (
          exifOffset + 6 <= view.byteLength &&
          view.getUint32(exifOffset, false) === 0x45786966 &&
          view.getUint16(exifOffset + 4, false) === 0x0000
        ) {
          exifOffset += 6;
        }
        break;
      }
      offset += 8 + chunkLength + (chunkLength & 1);
    }
  } else {
    return null;
  }

  if (exifOffset === null || exifOffset < 0 || exifOffset + 8 > view.byteLength) {
    return null;
  }

  const endianMarker = view.getUint16(exifOffset, false);
  if (endianMarker === 0x4949) {
    isLittleEndian = true;
  } else if (endianMarker === 0x4d4d) {
    isLittleEndian = false;
  } else {
    return null;
  }

  if (view.getUint16(exifOffset + 2, isLittleEndian) !== 0x002a) return null;

  const firstIFDOffset = view.getUint32(exifOffset + 4, isLittleEndian);
  if (firstIFDOffset === 0) return null;

  const base = exifOffset;

  const safeGetUint16 = (ptr: number) =>
    Number.isInteger(ptr) && ptr >= 0 && ptr + 2 <= view.byteLength
      ? view.getUint16(ptr, isLittleEndian)
      : null;

  const safeGetUint32 = (ptr: number) =>
    Number.isInteger(ptr) && ptr >= 0 && ptr + 4 <= view.byteLength
      ? view.getUint32(ptr, isLittleEndian)
      : null;

  function decodeOne(p: number, type: number): ExifScalar {
    switch (type) {
      case 1: return view.getUint8(p);
      case 6: return view.getInt8(p);
      case 3: return view.getUint16(p, isLittleEndian);
      case 8: return view.getInt16(p, isLittleEndian);
      case 4: return view.getUint32(p, isLittleEndian);
      case 9: return view.getInt32(p, isLittleEndian);
      case 5: {
        const num = view.getUint32(p, isLittleEndian);
        const den = view.getUint32(p + 4, isLittleEndian);
        return den === 0 ? null : num / den;
      }
      case 10: {
        const num = view.getInt32(p, isLittleEndian);
        const den = view.getInt32(p + 4, isLittleEndian);
        return den === 0 ? null : num / den;
      }
      case 11: return view.getFloat32(p, isLittleEndian);
      case 12: return view.getFloat64(p, isLittleEndian);
      default: return null;
    }
  }

  function readValue(offset: number, type: number, count: number): ExifValue {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 0) return null;
    const unit = TYPE_SIZES[type];
    if (!unit) return null;
    const totalBytes = unit * count;
    if (!Number.isSafeInteger(totalBytes) || offset + totalBytes > view.byteLength) return null;

    if (type === 2) {
      let out = "";
      for (let i = 0; i < count; i++) {
        const ch = view.getUint8(offset + i);
        if (ch === 0) break;
        out += String.fromCharCode(ch);
      }
      return out.trim();
    }

    if (type === 7) {
      return new Uint8Array(arrayBuffer.slice(offset, offset + count));
    }

    if (count === 1) return decodeOne(offset, type);

    const values: ExifScalar[] = new Array(count);
    for (let i = 0; i < count; i++) {
      values[i] = decodeOne(offset + i * unit, type);
    }
    return values;
  }

  function parseIFD(ifdOffset: number) {
    const tags: Record<number, IFDEntry> = {};
    if (!Number.isInteger(ifdOffset) || ifdOffset < 0) return tags;

    const absoluteOffset = base + ifdOffset;
    const numEntries = safeGetUint16(absoluteOffset);
    if (numEntries === null || numEntries === 0) return tags;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = absoluteOffset + 2 + i * 12;
      if (entryOffset + 12 > view.byteLength) break;

      const tag = safeGetUint16(entryOffset);
      const type = safeGetUint16(entryOffset + 2);
      const count = safeGetUint32(entryOffset + 4);

      if (tag === null || type === null || count === null) continue;

      const unit = TYPE_SIZES[type];
      if (!unit) continue;

      const totalBytes = unit * count;
      if (!Number.isSafeInteger(totalBytes)) continue;

      let valueOffset: number;
      if (totalBytes > 4) {
        const ptr = safeGetUint32(entryOffset + 8);
        if (ptr === null) continue;
        valueOffset = base + ptr;
      } else {
        valueOffset = entryOffset + 8;
      }

      if (valueOffset < 0 || valueOffset > view.byteLength) continue;

      tags[tag] = { type, count, offset: valueOffset };
    }
    return tags;
  }

  const readEntry = (entry?: IFDEntry): string | Uint8Array | number | null => {
    if (!entry) return null;
    const value = readValue(entry.offset, entry.type, entry.count);
    if (Array.isArray(value)) return value.length ? value[0] : null;
    return value;
  };

  const metadata: RawExifData = {};
  const ifd0 = parseIFD(firstIFDOffset);

  metadata.make = asString(readEntry(ifd0[0x010f]));
  metadata.model = asString(readEntry(ifd0[0x0110]));
  metadata.date = asString(readEntry(ifd0[0x0132]));

  const exifPtr = asNumber(readEntry(ifd0[0x8769]));
  if (exifPtr !== null) {
    const exifIFD = parseIFD(exifPtr);
    metadata.dateOriginal = asString(readEntry(exifIFD[0x9003]));
    metadata.exposureTime = asNumber(readEntry(exifIFD[0x829a]));
    metadata.fNumber = asNumber(readEntry(exifIFD[0x829d]));
    metadata.iso = asNumber(readEntry(exifIFD[0x8827]));
    metadata.focalLength = asNumber(readEntry(exifIFD[0x920a]));
  }

  const gpsPtr = asNumber(readEntry(ifd0[0x8825]));
  if (gpsPtr !== null) {
    const gpsIFD = parseIFD(gpsPtr);

    const parseGPSCoord = (tag: number): number | null => {
      const entry = gpsIFD[tag];
      if (!entry || entry.type !== 5 || entry.count < 3) return null;
      const values = readValue(entry.offset, entry.type, entry.count);
      if (!Array.isArray(values) || values.length < 3) return null;

      const [deg, min, sec] = values;
      if (deg == null || min == null || sec == null) return null;
      if (![deg, min, sec].every(v => Number.isFinite(v))) return null;

      return deg + min / 60 + sec / 3600;
    };

    const lat = parseGPSCoord(0x0002);
    const lon = parseGPSCoord(0x0004);
    const latRef = (asString(readEntry(gpsIFD[0x0001])) ?? "N").toUpperCase().replace(/\0/g, "");
    const lonRef = (asString(readEntry(gpsIFD[0x0003])) ?? "E").toUpperCase().replace(/\0/g, "");

    if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
      metadata.gps = {
        latitude: latRef === "S" ? -lat : lat,
        longitude: lonRef === "W" ? -lon : lon
      };
    }
  }

  return metadata;
}

const DEFAULT_RANGE_BYTES = 131072;

const SKIP_STYLE_TAGS = new Set([
  "SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD", "NOSCRIPT", "BR"
]);

const fmtExposure = (t?: number | null): string => {
  if (t == null || !Number.isFinite(t)) return "N/A";
  if (t <= 0) return `${t}s`;
  if (t >= 1) return `${Number(t.toFixed(1))}s`;
  if (t >= 0.3) return `${Number(t.toFixed(1))}s`;
  return `1/${Math.round(1 / t)}s`;
};

function parseSrcset(value: string): string[] {
  const urls: string[] = [];
  const n = value.length;
  let i = 0;

  while (i < n) {
    while (i < n && /[\s,]/.test(value[i])) i++;
    if (i >= n) break;

    const start = i;
    while (i < n && !/\s/.test(value[i])) i++;
    let url = value.slice(start, i);

    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
    } else {
      while (i < n && value[i] !== ",") i++;
    }

    if (url) urls.push(url);
  }

  return urls;
}

function collectElements(
  root: Document | Element | ShadowRoot,
  inShadow: boolean,
  hostTag: string,
  out: Array<{ el: Element; where: string }>,
  visited: Set<Element>
) {
  if (typeof root.querySelectorAll !== "function") return out;

  const elements = root.querySelectorAll("*");
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (visited.has(el)) continue;
    visited.add(el);

    out.push({ el, where: inShadow ? `shadow <${hostTag}>` : "document" });

    if (el.shadowRoot) {
      collectElements(el.shadowRoot, true, el.tagName.toLowerCase(), out, visited);
    }
  }
  return out;
}

async function readBytes(
  res: Response,
  limit: number
): Promise<{ buf: ArrayBuffer; truncated: boolean }> {
  if (!res.body) {
    return { buf: await res.arrayBuffer(), truncated: false };
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let finished = false;

  while (total < limit) {
    const result = await reader.read();
    if (result.done) {
      finished = true;
      break;
    }
    const remaining = limit - total;
    const chunk =
      result.value.byteLength > remaining
        ? result.value.subarray(0, remaining)
        : result.value;
    chunks.push(chunk);
    total += chunk.byteLength;
  }

  if (!finished) {
    await reader.cancel();
  }

  const merged = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    merged.set(chunk, pos);
    pos += chunk.byteLength;
  }

  return { buf: merged.buffer as ArrayBuffer, truncated: !finished };
}

async function fetchExif(
  url: string,
  rangeBytes: number
): Promise<{ exif: RawExifData | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${rangeBytes - 1}` }
    });

    if (res.ok) {
      const { buf, truncated } = await readBytes(res, rangeBytes);
      const exif = parseImageExif(buf);
      if (exif || (res.status !== 206 && !truncated)) {
        return { exif, error: null };
      }
    }
  } catch {
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { exif: null, error: `HTTP ${res.status}` };
    }
    const buf = await res.arrayBuffer();
    return { exif: parseImageExif(buf), error: null };
  } catch (err) {
    if (err instanceof TypeError) {
      return { exif: null, error: "CORS Blocked / Network Error" };
    }
    return {
      exif: null,
      error: err instanceof Error ? err.message : "Unknown Error"
    };
  }
}

export async function analyzeExif(options: AnalyzeOptions = {}): Promise<ImageResult[]> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("analyzeExif() must be run in a browser environment.");
    return [];
  }

  const rangeBytes = options.rangeBytes ?? DEFAULT_RANGE_BYTES;
  const rootElement = options.rootElement ?? document;
  const logToConsole = options.logToConsole ?? false;

  const CSS_PROPS: Array<[keyof CSSStyleDeclaration, string]> = [
    ["backgroundImage", "background-image"],
    ["listStyleImage", "list-style-image"],
    ["borderImageSource", "border-image-source"]
  ];

  const PSEUDOS = [null, "::before", "::after"];
  const urlRe = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

  const elements: Array<{ el: Element; where: string }> = [];
  const visited = new Set<Element>();
  if (rootElement instanceof Element) {
    visited.add(rootElement);
    elements.push({ el: rootElement, where: "document" });
    if (rootElement.shadowRoot) {
      collectElements(rootElement.shadowRoot, true, rootElement.tagName.toLowerCase(), elements, visited);
    }
  }
  collectElements(rootElement, false, "", elements, visited);
  const sources: ImageSource[] = [];
  const seen = new Set<string>();

  function addSource(type: string, where: string, src: string, img: HTMLImageElement | null = null) {
    if (!src) return;
    let absolute: string;
    try {
      absolute = new URL(src, window.location.href).href;
    } catch {
      absolute = src;
    }

    if (absolute.startsWith("data:")) return;

    const key = `${type}|${absolute}|${where}`;
    if (seen.has(key)) return;
    seen.add(key);

    sources.push({ type, where, src: absolute, img });
  }

  for (const { el, where } of elements) {
    if (el instanceof HTMLImageElement) {
      const src = el.currentSrc || el.src || el.getAttribute("src");
      if (src) addSource("img", where, src, el);

      const srcset = el.getAttribute("srcset");
      if (srcset && srcset.trim()) {
        for (const url of parseSrcset(srcset)) {
          addSource("img srcset", where, url, el);
        }
      }
    } else if (el instanceof HTMLSourceElement) {
      const srcset = el.getAttribute("srcset");
      if (srcset && srcset.trim()) {
        for (const url of parseSrcset(srcset)) {
          addSource("source srcset", where, url, null);
        }
      }
    } else if (el instanceof HTMLVideoElement) {
      if (el.poster) addSource("video poster", where, el.poster, null);
    } else if (el instanceof SVGImageElement) {
      const href = el.href.baseVal;
      if (href) addSource("svg image", where, href, null);
    }

    if (SKIP_STYLE_TAGS.has(el.tagName)) continue;

    for (const pseudo of PSEUDOS) {
      let cs: CSSStyleDeclaration;
      try {
        cs = window.getComputedStyle(el, pseudo);
      } catch {
        continue;
      }

      for (const [prop, cssName] of CSS_PROPS) {
        const value = cs[prop] as string;
        if (!value || value === "none") continue;

        for (const m of value.matchAll(urlRe)) {
          if (m[2]) {
            const type = `css ${cssName}${pseudo ? " " + pseudo : ""}`;
            addSource(type, where, m[2], null);
          }
        }
      }
    }
  }

  const results: ImageResult[] = [];
  const cache = new Map<string, { exif: RawExifData | null; error: string | null }>();

  for (let idx = 0; idx < sources.length; idx++) {
    const s = sources[idx];

    if (!cache.has(s.src)) {
      cache.set(s.src, await fetchExif(s.src, rangeBytes));
    }

    const cachedReq = cache.get(s.src);
    const exif = cachedReq?.exif || null;
    const error = cachedReq?.error || null;

    results.push({
      index: idx + 1,
      type: s.type,
      location: s.where,
      url: s.src,
      dimensions: s.img
        ? `${s.img.naturalWidth || s.img.width || "?"}x${s.img.naturalHeight || s.img.height || "?"}px`
        : "N/A",
      altText: s.img?.alt || "N/A",
      cameraMake: exif?.make || "N/A",
      cameraModel: exif?.model || "N/A",
      dateTaken: exif?.dateOriginal || exif?.date || "N/A",
      exposure: fmtExposure(exif?.exposureTime),
      aperture: exif?.fNumber != null ? `f/${Number(exif.fNumber.toFixed(1))}` : "N/A",
      iso: exif?.iso ? String(exif.iso) : "N/A",
      gpsCoordinates: exif?.gps
        ? `${exif.gps.latitude.toFixed(6)}, ${exif.gps.longitude.toFixed(6)}`
        : "N/A",
      status: error ? `Failed (${error})` : exif ? "Metadata Parsed" : "No Metadata Found",
      rawExif: exif
    });
  }

  if (logToConsole) {
    console.group(`Deep EXIF Analysis (${results.length} processed)`);
    console.table(results);
    console.groupEnd();
  }

  return results;
}
