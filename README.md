# EXIFScope
Scan a webpage for images and read their EXIF metadata (camera, exposure, date, GPS) without leaving the browser.

## Quick start (no install)

1. Open the page you want to scan.
2. Open DevTools → Console.
3. Paste the contents of [`EXIFScope.js`](./EXIFScope.js) and press Enter.

Results print as a table and are also stored in `window.__deepExifResults`.

Read the script before you paste it. Only run code in your console that you have read and trust.

## As a package

```bash
npm install exifsp
```

```js
import { analyzeExif, parseImageExif } from "exifsp";

// Browser only: scan the current page
const results = await analyzeExif({ logToConsole: true });

// Anywhere (including Node): parse an ArrayBuffer you already have
const exif = parseImageExif(arrayBuffer);
```

`analyzeExif` needs a browser (`window` and `document`). `parseImageExif` has no DOM dependency.

### Options for `analyzeExif`

| Option | Default | Description |
|---|---|---|
| `rangeBytes` | `131072` | Bytes requested per image when the server supports `Range` |
| `rootElement` | `document` | Document, element or shadow root to scan |
| `logToConsole` | `false` | Print the results with `console.table` |

### What each result contains

`index`, `type`, `location`, `url`, `dimensions`, `altText`, `cameraMake`, `cameraModel`, `dateTaken`, `exposure`, `aperture`, `iso`, `gpsCoordinates`, `status`, and `rawExif` (the parsed values, including focal length).

## What it finds

- `<img>` elements, including `srcset`
- `<source srcset>`
- CSS `background-image`, `list-style-image` and `border-image-source`, including `::before` and `::after`
- Elements inside open shadow roots
- `<video poster>` and SVG `<image>` (npm package only)

## What it reads

Make, model, date taken, exposure time, aperture, ISO, focal length and GPS coordinates, from JPEG, PNG and WebP files.

## Limitations

- HEIC, AVIF and TIFF are not supported.
- Cross-origin images must send CORS headers to be readable.
- Closed shadow roots, iframes and `data:` URIs are not scanned.
- Images are fetched by URL, so the servers hosting them see the requests.

## License

BSD 3-Clause. See [LICENSE](./LICENSE).

# Security Policy

## Reporting a vulnerability

Please don't open a public issue. Report it privately through GitHub's
"Report a vulnerability" button on the Security tab, or email <SomeoneMicroTest@hotmail.com>.

I'll reply as soon as I can.

## Supported versions

Only the latest release of `exifsp` gets fixes.
