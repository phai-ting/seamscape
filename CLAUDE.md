# Seamscape

Seamscape uses one photo of your desk to measure the gaps between your monitors, then adjusts your wallpaper so it lines up across the screens.

Live at: https://seamscape.phaiting.com (Cloudflare Workers with static assets).

The full product spec is in `docs/SPEC.md`. Read it before starting a new feature.

## Core principles

- **Static site, almost no backend.** Everything runs in the browser. The one server piece is the live phone-to-desktop relay (SPEC, Phase 3): a Durable Object in the same Worker that only passes on end-to-end encrypted messages and stores nothing. Everything must keep working without it.
- **Privacy by design.** The calibration photo and the user's wallpaper image never leave the device. Do not upload them anywhere.
- **No accounts, no database.** A calibration profile is stored in the URL fragment (after `#`) so it is never sent to the server. Users bookmark it.
- **Plain web platform first.** Prefer vanilla HTML/CSS/JS (ES modules). Add a build step (e.g. Vite) only if it clearly pays for itself. Load OpenCV.js lazily, only on the capture page.

## Key technical facts

- Multi-screen info and full-screen windows on each monitor come from the **Window Management API** (Chrome/Edge only, needs a permission prompt). Firefox/Safari need a fallback: manual layout entry, or the user drags a window to each monitor and goes full screen.
- Browser sizes are in CSS pixels. Multiply by `devicePixelRatio` for native resolution.
- Camera access and Window Management both require HTTPS (Cloudflare provides it; use `localhost` in dev).
- Geometry math: each screen shows corner fiducials (ArUco/AprilTag-style) at known pixel positions. A homography per screen maps photo coordinates to that screen's pixel coordinates; gaps and offsets are expressed in screen pixels, which also handles mixed pixel densities.
- Output formats:
  - Windows: one image covering the bounding box of all monitors, applied with "Span". Handle negative coordinates (monitors above/left of primary).
  - macOS: one image per display, named to match the monitor numbers shown during calibration (e.g. `seamscape-2-left.png`).
  - Linux: provide both spanned and per-monitor images.
  - Deliver as a single ZIP with a short how-to-apply note per OS.

## Repo layout (target)

```
public/            static site served by Cloudflare
  index.html       desktop entry: calibration + wallpaper builder
  capture.html     phone capture page (opened via QR)
  calibrate.html   one monitor's calibration pattern (opened by index.html)
  js/              ES modules
  js/vendor/       OpenCV.js and the QR generator, self-hosted
  css/
worker/            Worker script: the live-link relay (Durable Object) only
docs/SPEC.md       product spec and phased plan
wrangler.jsonc     Cloudflare Workers config (static assets + relay)
```

## Deploy

Cloudflare Workers with static assets, connected to this GitHub repo. Pushing to the main branch deploys. Custom domain: `seamscape.phaiting.com`.

Local dev: `npx wrangler dev` (or any static server on localhost).

## Working conventions

- Keep the math (homography, gap calculation, crop layout) in pure, testable modules separate from DOM code, and write unit tests for it.
- Test layouts include: side-by-side, three monitors, mixed resolutions, a portrait monitor, and a monitor above/left of the primary (negative coordinates).
