# Seamscape

Wallpaper that lines up across your monitors. Seamscape measures (or lets you enter) the gaps between your screens and crops your picture so it looks like one continuous view through the "window panes" of your monitors.

Live at https://seamscape.phaiting.com. Everything runs in the browser; pictures never leave your computer.

## Status

Phase 1 (this): desktop wallpaper builder with manual gap entry, live preview, layout saved in the URL fragment, and a per-OS ZIP download. Camera calibration is Phase 2. See [docs/SPEC.md](docs/SPEC.md).

## Develop

No build step and no dependencies. The site is plain ES modules in `public/`.

```bash
npm test          # unit tests for the layout math (Node's built-in test runner)
npm run dev       # npx wrangler dev, serves public/ on localhost
```

Any static server on `localhost` works too (the Window Management API needs a secure context).

## Layout

```
public/
  index.html        desktop page
  css/style.css
  js/
    layout.js       monitors, adjacency, physical canvas (pure)
    crop.js         picture fit, pan/zoom, crop rects, output plan (pure)
    profile.js      profile <-> URL fragment (pure)
    zip.js          stored ZIP writer + CRC-32 (pure)
    howto.js        HOW-TO-APPLY text and ZIP manifest (pure)
    screens.js      Window Management API + fallback
    testpattern.js  built-in alignment pattern
    export.js       renders images and builds the ZIP
    app.js          page wiring
  _headers          security headers (CSP)
test/               node:test unit tests
wrangler.jsonc      Cloudflare Workers static assets
```

## Deploy

Pushing to `main` deploys through the Cloudflare Workers GitHub integration. Manual: `npm run deploy`.
