# Seamscape: Product Spec

## Problem

When a wallpaper spans several monitors, the computer treats the screens as touching. In reality there are bezels and physical gaps, so lines and horizons in the image break and shift between screens. Existing tools (Superpaper, DisplayFusion, NVIDIA Surround / AMD Eyefinity bezel correction) can compensate, but users must measure and enter offsets by hand.

## Idea

Measure the physical layout automatically from one phone photo, then crop the user's image so it looks like one continuous picture seen through the "window panes" of the monitors. The parts of the image that fall behind bezels and gaps are hidden, the way a window frame hides part of a view.

## User flow

1. **Open the site on the desktop** (`seamscape.phaiting.com`). The page reads the monitor setup from the browser: number of displays, resolutions, scaling, and arrangement.
2. **Show calibration screens.** One click fills every monitor edge to edge with a bright pattern: corner markers, a large monitor number, and a border marking the exact edge of the lit area. The primary screen's pattern includes a QR code.
3. **Scan with the phone.** The QR code opens `capture.html` on the phone (no app install). The QR payload includes the desktop's screen list (resolution of each monitor and its number) so the phone knows what it is looking at.
4. **Take one photo** from the normal seated viewing position, so angled monitors are measured as the user actually sees them. The page checks the shot immediately and gives feedback ("Monitor 3 is cut off, step back").
5. **Compute geometry on the phone** with OpenCV.js: detect markers, compute a homography per screen, measure gaps and vertical offsets in screen-pixel units.
6. **Hand the result back to the desktop** (see "Phone-to-desktop handoff").
7. **Review the layout.** The desktop shows a to-scale diagram of the monitors with measured gaps and offsets. The user can nudge values.
8. **Bookmark the profile.** The desktop shows a link with the geometry in the URL fragment: "Bookmark this link to skip calibration next time."
9. **Pick an image** from the computer. A preview shows it across the physical layout with hidden areas shaded. The user can drag to reposition and zoom.
10. **Download** a ZIP with the right files for their OS (auto-detected, others available) plus apply instructions.

## Phone-to-desktop handoff

Phase 1 (no server): the phone builds a short `seamscape.phaiting.com/#...` link containing the geometry and offers:
- the share sheet (Web Share API) for AirDrop, Messages, email, etc.
- a short code the user can type into the desktop page
- copy link

Phase 3 (optional): live link through a small relay in the same Cloudflare Worker (a Durable Object holding a WebSocket session). The QR code carries a session ID. When the phone finishes, the desktop updates automatically. Keep the Phase 1 handoff as the fallback.

## Geometry model

- Each monitor `i` has native resolution `(w_i, h_i)` and an OS position in the virtual desktop.
- Fiducials are drawn at known pixel positions near each screen's corners and edges.
- From the photo, compute homography `H_i` mapping photo coordinates to monitor `i` pixel coordinates.
- Choose a reference monitor (the primary). Map every monitor's corners into the reference monitor's pixel space. This yields each monitor's physical position and scale relative to the reference, including gaps, vertical offsets, and pixel-density differences.
- The result is a "physical canvas": a single coordinate space where each monitor is a rectangle with its true position and size.
- Profile encoding: a compact versioned format (e.g. base64url of a small JSON or binary struct) in the URL fragment. Include a version number.

### Known limits

- Monitors angled inward are not coplanar. Measuring from the seated position gives the correct result for that viewpoint. A later version could model angles explicitly.
- Wide-angle phone lenses distort straight lines. Recommend the main lens; use enough markers to detect and reject bad fits.
- Glare and moiré can break detection. Give clear retake guidance.

## Wallpaper rendering

- Fit the user's image onto the physical canvas (cover by default; user can pan/zoom).
- For each monitor, crop the region under that monitor's rectangle and scale it to the monitor's native resolution.
- Windows: assemble crops into one image laid out in OS virtual-desktop coordinates (bounding box of all monitors), for "Span" mode.
- macOS: one image per monitor.
- Linux: both forms.
- Build the ZIP in the browser (e.g. JSZip or fflate) and include `HOW-TO-APPLY.txt`.

## Browser support

- Full flow: Chrome / Edge desktop (Window Management API).
- Fallback for Firefox / Safari desktop: the user enters or confirms the layout manually, or moves one calibration window to each monitor by hand.
- Phone: any modern mobile browser with camera access.

## Phased plan

**Phase 1: Wallpaper builder with manual layout.**
Desktop page that reads screens (Window Management API with fallback), lets the user enter gaps by hand, previews, and downloads per-OS output. Profile-in-URL. This alone is useful and validates the rendering math.

**Phase 2: Camera calibration.**
Calibration patterns on every monitor, QR to the capture page, OpenCV.js detection, homography and gap solving, share-link handoff, and a review screen.

**Phase 3: Live link.**
Durable Object WebSocket relay so the desktop updates automatically.

**Phase 4: Polish.**
Saved multiple profiles, an alignment test pattern for checking results, better onboarding, perspective handling for angled monitors.

## Hosting

Cloudflare Workers with static assets, deployed from GitHub. Custom domain `seamscape.phaiting.com` on the `phaiting.com` zone in the user's Cloudflare account. Static asset requests are free.
