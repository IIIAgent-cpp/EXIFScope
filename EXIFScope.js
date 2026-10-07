(async () => {
  const TYPE_SIZES = {
    1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1,
    7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8
  };

  const RANGE_BYTES = 131072;

  function parseImageExif(arrayBuffer) {
    if (!arrayBuffer || arrayBuffer.byteLength < 12) return null;

    const view = new DataView(arrayBuffer);

    let exifOffset = null;
    let isLittleEndian = false;

    const magic16 = view.getUint16(0, false);
    const magic32 = view.getUint32(0, false);

    if (magic16 === 0xFFD8) {
      let offset = 2;

      while (offset + 4 <= view.byteLength) {
        if (view.getUint8(offset) !== 0xFF) break;

        const marker = view.getUint8(offset + 1);

        if (marker === 0xDA || marker === 0xD9) break;

        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
          offset += 2;
          continue;
        }

        const length = view.getUint16(offset + 2, false);
        if (length < 2 || offset + 2 + length > view.byteLength) break;

        if (marker === 0xE1 && length >= 8) {
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

    } else if (magic32 === 0x89504E47) {
      if (
        view.byteLength < 8 ||
        view.getUint32(4, false) !== 0x0D0A1A0A
      ) {
        return null;
      }

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

    } else if (magic32 === 0x52494646) {
      if (
        view.byteLength < 12 ||
        view.getUint32(8, false) !== 0x57454250
      ) {
        return null;
      }

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

    if (
      exifOffset === null ||
      exifOffset < 0 ||
      exifOffset + 8 > view.byteLength
    ) {
      return null;
    }

    const endianMarker = view.getUint16(exifOffset, false);

    if (endianMarker === 0x4949) {
      isLittleEndian = true;
    } else if (endianMarker === 0x4D4D) {
      isLittleEndian = false;
    } else {
      return null;
    }

    if (
      view.getUint16(exifOffset + 2, isLittleEndian) !== 0x002A
    ) {
      return null;
    }

    const firstIFDOffset =
      view.getUint32(exifOffset + 4, isLittleEndian);

    if (firstIFDOffset === 0) return null;

    const base = exifOffset;

    const safeGetUint16 = (ptr) =>
      Number.isInteger(ptr) &&
      ptr >= 0 &&
      ptr + 2 <= view.byteLength
        ? view.getUint16(ptr, isLittleEndian)
        : null;

    const safeGetUint32 = (ptr) =>
      Number.isInteger(ptr) &&
      ptr >= 0 &&
      ptr + 4 <= view.byteLength
        ? view.getUint32(ptr, isLittleEndian)
        : null;

    function decodeOne(p, type) {
      switch (type) {
        case 1:
          return view.getUint8(p);

        case 6:
          return view.getInt8(p);

        case 3:
          return view.getUint16(p, isLittleEndian);

        case 8:
          return view.getInt16(p, isLittleEndian);

        case 4:
          return view.getUint32(p, isLittleEndian);

        case 9:
          return view.getInt32(p, isLittleEndian);

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

        case 11:
          return view.getFloat32(p, isLittleEndian);

        case 12:
          return view.getFloat64(p, isLittleEndian);

        default:
          return null;
      }
    }

    function readValue(offset, type, count) {
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(count) ||
        count < 0
      ) {
        return null;
      }

      const unit = TYPE_SIZES[type];
      if (!unit) return null;

      const totalBytes = unit * count;

      if (
        !Number.isSafeInteger(totalBytes) ||
        offset + totalBytes > view.byteLength
      ) {
        return null;
      }

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
        return new Uint8Array(
          arrayBuffer.slice(offset, offset + count)
        );
      }

      if (count === 1) {
        return decodeOne(offset, type);
      }

      const values = new Array(count);

      for (let i = 0; i < count; i++) {
        values[i] = decodeOne(
          offset + i * unit,
          type
        );
      }

      return values;
    }

    function parseIFD(ifdOffset) {
      const tags = {};

      if (
        !Number.isInteger(ifdOffset) ||
        ifdOffset < 0
      ) {
        return tags;
      }

      const absoluteOffset = base + ifdOffset;

      const numEntries = safeGetUint16(absoluteOffset);

      if (numEntries === null || numEntries === 0) {
        return tags;
      }

      for (let i = 0; i < numEntries; i++) {
        const entryOffset =
          absoluteOffset + 2 + i * 12;

        if (entryOffset + 12 > view.byteLength) break;

        const tag = safeGetUint16(entryOffset);
        const type = safeGetUint16(entryOffset + 2);
        const count = safeGetUint32(entryOffset + 4);

        if (
          tag === null ||
          type === null ||
          count === null
        ) {
          continue;
        }

        const unit = TYPE_SIZES[type];
        if (!unit) continue;

        const totalBytes = unit * count;

        if (!Number.isSafeInteger(totalBytes)) {
          continue;
        }

        let valueOffset;

        if (totalBytes > 4) {
          const ptr = safeGetUint32(entryOffset + 8);

          if (ptr === null) continue;

          valueOffset = base + ptr;
        } else {
          valueOffset = entryOffset + 8;
        }

        if (
          valueOffset < 0 ||
          valueOffset > view.byteLength
        ) {
          continue;
        }

        tags[tag] = {
          type,
          count,
          offset: valueOffset
        };
      }

      return tags;
    }

    const readEntry = (entry) => {
      if (!entry) return null;

      const value = readValue(
        entry.offset,
        entry.type,
        entry.count
      );

      return Array.isArray(value)
        ? value.length
          ? value[0]
          : null
        : value;
    };

    const metadata = {};

    const ifd0 = parseIFD(firstIFDOffset);

    metadata.make = readEntry(ifd0[0x010F]);
    metadata.model = readEntry(ifd0[0x0110]);
    metadata.date = readEntry(ifd0[0x0132]);

    const exifPtr = readEntry(ifd0[0x8769]);

    if (
      exifPtr !== null &&
      exifPtr !== undefined
    ) {
      const exifIFD = parseIFD(exifPtr);

      metadata.dateOriginal =
        readEntry(exifIFD[0x9003]);

      metadata.exposureTime =
        readEntry(exifIFD[0x829A]);

      metadata.fNumber =
        readEntry(exifIFD[0x829D]);

      metadata.iso =
        readEntry(exifIFD[0x8827]);

      metadata.focalLength =
        readEntry(exifIFD[0x920A]);
    }

    const gpsPtr = readEntry(ifd0[0x8825]);

    if (
      gpsPtr !== null &&
      gpsPtr !== undefined
    ) {
      const gpsIFD = parseIFD(gpsPtr);

      function parseGPSCoord(tag) {
        const entry = gpsIFD[tag];

        if (
          !entry ||
          entry.type !== 5 ||
          entry.count < 3
        ) {
          return null;
        }

        const values = readValue(
          entry.offset,
          entry.type,
          entry.count
        );

        if (
          !Array.isArray(values) ||
          values.length < 3
        ) {
          return null;
        }

        const [deg, min, sec] = values;

        if (
          [deg, min, sec].some(
            (v) => v === null || !Number.isFinite(v)
          )
        ) {
          return null;
        }

        return deg + min / 60 + sec / 3600;
      }

      const lat = parseGPSCoord(0x0002);
      const lon = parseGPSCoord(0x0004);

      const latRef =
        String(readEntry(gpsIFD[0x0001]) || "N").toUpperCase();

      const lonRef =
        String(readEntry(gpsIFD[0x0003]) || "E").toUpperCase();

      if (
        Number.isFinite(lat) &&
        Number.isFinite(lon)
      ) {
        metadata.gps = {
          latitude: latRef === "S" ? -lat : lat,
          longitude: lonRef === "W" ? -lon : lon
        };
      }
    }

    return metadata;
  }

  async function fetchExif(url) {
    try {
      const res = await fetch(url, {
        headers: {
          Range: `bytes=0-${RANGE_BYTES - 1}`
        }
      });

      if (res.ok) {
        const buf = await res.arrayBuffer();
        const exif = parseImageExif(buf);

        if (exif || res.status !== 206) {
          return {
            exif,
            error: null
          };
        }
      }
    } catch (e) {
    }

    try {
      const res = await fetch(url);

      if (!res.ok) {
        return {
          exif: null,
          error: `HTTP ${res.status}`
        };
      }

      const buf = await res.arrayBuffer();

      return {
        exif: parseImageExif(buf),
        error: null
      };
    } catch (e) {
      return {
        exif: null,
        error: "CORS Blocked / Network Error"
      };
    }
  }

  const fmtExposure = (t) => {
    if (t == null || !Number.isFinite(t)) {
      return "N/A";
    }

    if (t <= 0) {
      return `${t}s`;
    }

    return t < 1
      ? `1/${Math.round(1 / t)}s`
      : `${t}s`;
  };

  function collectElements(
    root,
    inShadow,
    hostTag,
    out
  ) {
    for (const el of root.querySelectorAll("*")) {
      out.push({
        el,
        where: inShadow
          ? `shadow <${hostTag}>`
          : "document"
      });

      if (el.shadowRoot) {
        collectElements(
          el.shadowRoot,
          true,
          el.tagName.toLowerCase(),
          out
        );
      }
    }

    return out;
  }

  const CSS_PROPS = [
    ["backgroundImage", "background-image"],
    ["listStyleImage", "list-style-image"],
    ["borderImageSource", "border-image-source"]
  ];

  const PSEUDOS = [
    null,
    "::before",
    "::after"
  ];

  const urlRe =
    /url\(\s*(['"]?)(.*?)\1\s*\)/g;

  const elements =
    collectElements(
      document,
      false,
      "",
      []
    );

  const sources = [];
  const seen = new Set();

  let skippedNoSrc = 0;
  let skippedData = 0;

  function addSource(type, where, src, img = null) {
    if (!src) return;

    let absolute;

    try {
      absolute = new URL(
        src,
        window.location.href
      ).href;
    } catch (e) {
      absolute = src;
    }

    if (absolute.startsWith("data:")) {
      skippedData++;
      return;
    }

    const key = `${type}|${absolute}|${where}`;

    if (seen.has(key)) return;

    seen.add(key);

    sources.push({
      type,
      where,
      src: absolute,
      img
    });
  }

  for (const { el, where } of elements) {
    if (el.tagName === "IMG") {
      const src =
        el.currentSrc ||
        el.src ||
        el.getAttribute("src");

      if (!src) {
        skippedNoSrc++;
      } else {
        addSource(
          "img",
          where,
          src,
          el
        );
      }
    }

    if (typeof el.srcset === "string" && el.srcset.trim()) {
      const candidates =
        el.srcset
          .split(",")
          .map(x => x.trim())
          .filter(Boolean);

      for (const candidate of candidates) {
        const match =
          candidate.match(
            /^(\S+)(?:\s+.*)?$/
          );

        if (!match) continue;

        const url = match[1];

        addSource(
          "img srcset",
          where,
          url,
          el
        );
      }
    }

    for (const pseudo of PSEUDOS) {
      let cs;

      try {
        cs = getComputedStyle(
          el,
          pseudo
        );
      } catch (e) {
        continue;
      }

      for (const [prop, cssName] of CSS_PROPS) {
        const value = cs[prop];

        if (
          !value ||
          value === "none"
        ) {
          continue;
        }

        for (const m of value.matchAll(urlRe)) {
          const raw = m[2];

          if (!raw) continue;

          const type =
            `css ${cssName}${pseudo ? " " + pseudo : ""}`;

          addSource(
            type,
            where,
            raw,
            null
          );
        }
      }
    }
  }

  const results = [];
  const cache = new Map();

  for (const [idx, s] of sources.entries()) {
    const absoluteUrl = s.src;

    if (!cache.has(absoluteUrl)) {
      cache.set(
        absoluteUrl,
        await fetchExif(absoluteUrl)
      );
    }

    const {
      exif,
      error
    } = cache.get(absoluteUrl);

    results.push({
      Index: idx + 1,
      Type: s.type,
      Location: s.where,
      URL: absoluteUrl,

      Dimensions: s.img
        ? `${s.img.naturalWidth || s.img.width || "?"}x${s.img.naturalHeight || s.img.height || "?"}px`
        : "N/A",

      AltText:
        s.img?.alt || "N/A",

      CameraMake:
        exif?.make || "N/A",

      CameraModel:
        exif?.model || "N/A",

      DateTaken:
        exif?.dateOriginal ||
        exif?.date ||
        "N/A",

      Exposure:
        fmtExposure(
          exif?.exposureTime
        ),

      Aperture:
        exif?.fNumber != null
          ? `f/${exif.fNumber}`
          : "N/A",

      ISO:
        exif?.iso ?? "N/A",

      GPS_Coordinates:
        exif?.gps
          ? `${exif.gps.latitude.toFixed(6)}, ${exif.gps.longitude.toFixed(6)}`
          : "N/A",

      Status:
        error
          ? `Failed (${error})`
          : exif
            ? "Metadata Parsed"
            : "No Metadata Found"
    });
  }

  console.group(
    `Image Metadata Analysis (${results.length} processed)`
  );

  console.table(results);

  if (skippedNoSrc) {
    console.log(
      `Skipped ${skippedNoSrc} image(s) with no src.`
    );
  }

  if (skippedData) {
    console.log(
      `Skipped ${skippedData} data: URI image(s).`
    );
  }

  console.log(
    "Note: remote images may be blocked by CORS or stripped of EXIF metadata. " +
    "Closed shadow roots and iframes are not scanned."
  );

  console.groupEnd();

  window.__deepExifResults = results;
})();