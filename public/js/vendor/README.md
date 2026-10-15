# Vendored libraries

Served from this site only (the CSP allows no other hosts). Do not edit these
files; replace them with a newer release instead.

| File | Source | License |
| --- | --- | --- |
| `opencv.js` | `@techstark/opencv-js` 4.10.0-release.1 (`dist/opencv.js`), a build of OpenCV 4.10 for the browser with the WebAssembly inlined | Apache 2.0, see `LICENSE-opencv.txt` |
| `qrcode.mjs` | `qrcode-generator` 2.0.4 by Kazuhiko Arase (`dist/qrcode.mjs`) | MIT, see the header of the file and `LICENSE-qrcode.txt` |

`opencv.js` is about 10 MB and is loaded only by `capture.html`, after the
user picks a photo. It needs `'unsafe-eval'` and `'wasm-unsafe-eval'` in
`script-src`: Emscripten's embind builds its function wrappers with
`new Function`. `public/_headers` grants both on the capture page only.
