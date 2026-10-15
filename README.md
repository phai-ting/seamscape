# Seamscape

Wallpaper that lines up across your monitors. Seamscape measures (or lets you enter) the gaps between your screens and crops your picture so it looks like one continuous view through the "window panes" of your monitors.

Live at https://seamscape.phaiting.com. Everything runs in the browser; pictures never leave your computer.

## Status

- Phase 1: desktop wallpaper builder with manual gap entry, live preview, layout saved in the URL fragment, and a per-OS ZIP download.
- Phase 2: camera calibration. The desktop shows a marker pattern on every monitor (a QR code on the primary), the phone page measures one photo with OpenCV.js, and the result comes back as a short code or a `#p=` link.

- Phase 3: live link. When the phone has measured, the desktop page updates by itself through a small relay (a Durable Object in this Worker); the code and link stay as the fallback.

Phase 4 (polish) is next. See [docs/SPEC.md](docs/SPEC.md).

## How calibration works

1. **Gaps → Show calibration screens.** With the Window Management API (Chrome, Edge) the page fills its own screen and opens a placed window on each other screen; each window needs one click to go full screen. Browsers allow one pop-up per click, so blocked windows get a button on the pattern. Without the API, the user opens one window per monitor and drags it into place; a window that lands on a screen of the wrong size says so.
2. Each pattern has eight markers (4 × 4-bit ArUco-style codes, 64 in the dictionary, ids `(monitor − 1) × 8 + position`), a magenta line on the exact lit edge, and the monitor number. The primary's QR code opens `/capture#s=…` with the screen list: a version, then `WxH+X+Y@mm` per monitor (resolution, OS position, and physical width from step 1's diagonal). The QR code only appears once every other calibration window reports, over a BroadcastChannel, that it shows its markers.
3. **The phone** decodes the photo locally, finds markers (OpenCV.js thresholds and traces contours; corner refinement and decoding are plain JS), fits a homography per screen from marker corners, and maps every screen into the primary's pixel space. Monitor sizes come from step 1, not the photo (a monitor angled towards the seat looks bigger than it is). Each gap and offset is measured where two monitors meet, from fits of the markers along the two facing edges (close to flat even on curved screens), scaled by those edges' lengths. It tells the user what to fix: a monitor that is missing, cut off on a side, hard to read, ordered differently from the OS settings, or (as a note) bigger or smaller next to its neighbour than the two diagonals allow.
4. **Live link:** the desktop makes a random 128-bit key and puts it in the QR code's fragment (`&k=…`), which never reaches a server. Both pages derive the relay session id from it (SHA-256) and open a WebSocket to `/relay/<id>`. After every good photo the phone seals `{ screen list, profile }` with AES-GCM under that key and sends it; the relay passes the box on without being able to open it and stores nothing. The desktop opens it, checks it is for this calibration, applies it, closes the calibration windows, and confirms to the phone.
5. **Fallback handoff** without the relay: a short Crockford base32 code (13 characters for three monitors) that carries only the measured gaps and offsets plus a checksum tied to the screen list, or a profile link. The desktop that showed the patterns keeps the screen list in `sessionStorage` to decode the code.

OpenCV.js is about 10 MB and loads only on the capture page, when the user goes to take a photo. Its embind glue needs `'unsafe-eval'` as well as `'wasm-unsafe-eval'`; `public/_headers` grants both on `/capture` only.

## Develop

No build step and no dependencies. The site is plain ES modules in `public/`.

```bash
npm test          # unit tests for the layout math (Node's built-in test runner)
npm run dev       # npx wrangler dev, serves public/ on localhost
```

Any static server on `localhost` works too (the Window Management API needs a secure context), but only `wrangler dev` runs the live-link relay; without it the page falls back to the typed code.

## Layout

```
public/
  index.html        desktop page
  css/style.css
  js/
    layout.js       monitors, adjacency, physical canvas (pure)
    crop.js         picture fit, pan/zoom, crop rects, output plan (pure)
    profile.js      profile <-> URL fragment (pure)
    fiducials.js    marker dictionary and marker placement (pure)
    homography.js   homography fit, robust per-marker fit (pure)
    measure.js      markers -> measured layout + photo feedback (pure)
    handoff.js      QR screen list, short code, profile assembly (pure)
    detect.js       marker detection (OpenCV.js passed in; refinement and decoding pure)
    pattern.js      draws a calibration pattern and QR code
    calibration.js  calibration windows on every monitor (desktop)
    calibrate-window.js  the per-monitor calibration window
    capture.js      phone page wiring
    vendor/         OpenCV.js 4.10, qrcode-generator 2.0.4 (see vendor/README.md)
    zip.js          stored ZIP writer + CRC-32 (pure)
    howto.js        HOW-TO-APPLY text and ZIP manifest (pure)
    screens.js      Window Management API + fallback
    testpattern.js  built-in alignment pattern
    export.js       renders images and builds the ZIP
    relay-crypto.js live-link key, session id, AES-GCM seal/unseal (pure)
    relay.js        live-link WebSocket with keep-alive and retries
    app.js          page wiring
  calibrate.html    one monitor's calibration pattern
  capture.html      phone page, opened from the QR code
  _headers          security headers (CSP)
worker/
  index.js          Worker: /relay/<id> WebSockets to the Relay Durable Object; all else static
  protocol.js       what the relay passes on (pure)
test/               node:test unit tests; detect.test.js runs OpenCV.js on a rendered photo
wrangler.jsonc      Cloudflare Workers static assets
```

## Deploy

Pushing to `main` deploys through the Cloudflare Workers GitHub integration. Manual: `npm run deploy`.
