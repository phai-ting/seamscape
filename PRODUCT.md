# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People with two or more monitors, often of mixed sizes, resolutions, or orientations, sometimes stacked or angled, who want one picture to run straight across all of them. No narrower niche. They use Seamscape once to set up their layout and again whenever they change wallpaper, on the desktop computer whose screens they are measuring.

## Product Purpose

When a wallpaper spans several monitors, the OS treats the screens as touching, so lines and horizons break across bezels and gaps. Seamscape measures the physical layout and crops the picture so it reads as one continuous view seen through the monitors, the way a window frame hides part of a view. Success: the user downloads files, applies them, and the lines run straight across the gaps.

## Positioning

Existing tools (Superpaper, DisplayFusion, GPU bezel correction) make users measure and type offsets themselves. Seamscape runs entirely in the browser with no install, and its camera calibration measures the layout from one phone photo.

## Operating Context

- The desktop page: detect or enter screens, measure gaps with the phone or enter them in millimetres, place a picture in a live preview, download a ZIP per OS (Windows span image, macOS per-display images, Linux both), then apply it using on-screen steps that match the ZIP's HOW-TO-APPLY.txt.
- The layout is saved in the URL fragment; users bookmark that link to skip setup next time.
- Screen detection uses the Window Management API (Chrome/Edge); Firefox/Safari users add monitors by hand.
- The phone page (capture) is used once per calibration, standing or sitting at the desk: take a photo, read the feedback, retake if needed, then send the code or link. The photo stays on the phone.

## Capabilities and Constraints

- Static site on Cloudflare Workers static assets; plain HTML/CSS/ES modules, no build step, no accounts. The only server code is the live-link relay, which cannot read what it relays.
- Strict CSP: scripts, styles, and fonts only from the site itself; no third-party hosts. The phone page alone allows eval and WebAssembly for OpenCV.js.
- The calibration photo and the user's picture never leave the device.
- Camera calibration: the desktop shows a marker pattern on every monitor; the phone page (opened from a QR code) measures one photo with OpenCV.js and hands the layout back as a short typed code or a link. No server is involved.
- Live link: when the phone has measured, the desktop page updates by itself through a relay in the same Worker. The relay passes on only end-to-end encrypted measurements (the key never reaches the server) and stores nothing; the code and link remain as the fallback.

## Brand Commitments

- Name: Seamscape. No logo, colours, or typefaces are fixed yet.
- The privacy promise ("your pictures never leave your computer") stays visible.

## Evidence on Hand

- No testimonials, user counts, or press exist; none may be invented.
- A built-in test pattern stands in for a user picture in the preview.

## Product Principles

1. The tool is the page: setup, preview, and download stay quick to reach and quick to use.
2. Show the result, not a claim: the preview is the proof that the picture lines up.
3. Private by construction: nothing the user adds leaves the browser.
4. Plain words and real units: millimetres and steps a non-technical person can follow.
