---
name: Seamscape
description: Wallpaper that lines up across your monitors, laid out as a press proof.
colors:
  paper: "#f7f7f4"
  paper-deep: "#ecece7"
  sheet-white: "#ffffff"
  registration-ink: "#111111"
  ink-soft: "#45484d"
  rule: "#111111"
  rule-soft: "#d4d4ce"
  field-line: "#85888c"
  process-cyan: "#0089c7"
  process-magenta: "#d1006c"
  process-yellow: "#ffe500"
  yellow-lit: "#fff6a3"
  yellow-drop: "#fffbd1"
  error-red: "#b3261e"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(30px, 3.2vw, 40px)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 125"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  step-number:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    fontVariation: "'wdth' 125"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    fontVariation: "'wdth' 112"
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  control:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
  slug:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.04em"
  mono:
    fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace"
    fontSize: "13px"
rounded:
  hair: "2px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  gutter: "clamp(16px, 3vw, 40px)"
  ticket: "540px"
components:
  button:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.registration-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.hair}"
    padding: "0 16px"
    height: "38px"
  button-quiet:
    textColor: "{colors.registration-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.hair}"
    padding: "0 16px"
    height: "38px"
  button-primary:
    backgroundColor: "{colors.registration-ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.hair}"
    padding: "0 22px"
    height: "44px"
  input:
    backgroundColor: "{colors.sheet-white}"
    textColor: "{colors.registration-ink}"
    rounded: "{rounded.hair}"
    padding: "0 10px"
    height: "34px"
  page-number:
    backgroundColor: "{colors.registration-ink}"
    textColor: "{colors.paper}"
    padding: "0 6px"
    height: "24px"
  ticket-row-lit:
    backgroundColor: "{colors.yellow-lit}"
  proof-sheet:
    backgroundColor: "{colors.sheet-white}"
---

# Design System: Seamscape

## Overview

**Creative North Star: "The Press Proof"**

Seamscape is laid out like a print shop's proof: a job ticket on the left, an imposition sheet on the right. Each monitor is a trimmed page on that sheet. Crop marks sit outside every corner, the picture bleeds faintly past each trim to show what the bezels hide, and magenta dimension lines state every gap in millimetres. The proof is the argument; nothing on the page claims accuracy that the sheet does not show.

The material is proof paper and registration-black ink. Structure comes from 1px hairline rules, not from cards, panels, or shadows. Density is that of a working document: compact rows, tabular figures, plain labels. Colour is rationed as a printer rations process inks: each of cyan, magenta, and yellow has exactly one job, and black carries the text. The CMYK colour bar along the top edge is the brand mark.

The user rejected gamer RGB/neon styling and generic SaaS styling (grey card stacks with one blue accent); both stay out.

**Key Characteristics:**
- Paper ground, white proof sheet, black hairline rules in place of containers.
- Process colours with single jobs: cyan acts, magenta measures, yellow highlights.
- One typeface, Archivo, used at two widths: wide for the wordmark and step numbers, normal for everything else.
- Tabular figures everywhere; real units (mm) on every measurement.
- Near-square corners (2px) and no drop shadows.

## Colors

A restrained proof-room palette: warm off-white paper, near-black ink, and three process colours used only for their assigned jobs.

### Primary
- **Process Cyan** (process-cyan): interaction and focus. Focus outlines, link underlines, the hover ring on buttons, the hover underline on the primary button, and the Guides lines drawn across the proof sheet.

### Secondary
- **Process Magenta** (process-magenta): measurement only. Gap dimension lines, witness lines, dimension labels on the proof, and the gap marks in the Gaps list.

### Tertiary
- **Process Yellow** (process-yellow): highlight and selection. The 3px frame around the highlighted page on the proof (frame only, no fill) and `::selection`.
- **Yellow Lit** (yellow-lit): the background of the ticket row whose page is highlighted.
- **Yellow Drop** (yellow-drop): the proof sheet's tint while a file is dragged over it.

### Neutral
- **Proof Paper** (paper): the page ground, and text on ink-filled elements.
- **Paper Deep** (paper-deep): pressed button state, code blocks, scrollbar track.
- **Sheet White** (sheet-white): the proof sheet, buttons, inputs.
- **Registration Ink** (registration-ink): all primary text, step numbers, page numbers, the primary button, crop marks, and registration targets.
- **Ink Soft** (ink-soft): secondary text: ledes, hints, units, column labels, the slug line.
- **Rule** (rule): the 1px structural hairlines between sections and steps.
- **Rule Soft** (rule-soft): row dividers inside lists (ticket rows, gap rows, file lists).
- **Field Line** (field-line): resting border of inputs and selects.
- **Error Red** (error-red): error status text only.

### Named Rules
**The One Job Rule.** Each process colour does exactly one job. Cyan never measures, magenta is never interactive, yellow never carries text. If a new element needs colour, it takes the colour of its job or stays ink.

**The Colour Bar Rule.** The CMYK colour bar (10px high, along the top edge) is the brand mark. Its swatches are printer's control-strip tints (solids, 50% tints, red, green, blue, 20% black) and live only in the bar; they are not UI colours.

**The Quiet Test Pattern Rule.** The built-in test pattern avoids process cyan and magenta so it can never be mistaken for a guide or a dimension. It uses greys, orange, green, and indigo on a neutral sky and ground.

## Typography

**Display Font:** Archivo, wide cut (variable width at 125%), with system-ui fallback
**Body Font:** Archivo, normal width, with system-ui fallback
**Label/Mono Font:** ui-monospace / Cascadia Mono / Consolas, for code in the apply guides only

**Character:** One self-hosted variable grotesque (weight 100-900, width 62-125%) doing everything. The width axis is the only display device: the wordmark and step numbers go wide; the working UI stays at normal width. Tabular figures are on globally so numbers line up in the ticket.

### Hierarchy
- **Display** (800, clamp(30px, 3.2vw, 40px), line-height 1, width 125%): the Seamscape wordmark in the masthead. Nowhere else.
- **Headline** (650, 22px, line-height 1.2): step headings, set on a baseline with the step number.
- **Step number** (800, 22px, width 125%): the numerals 1-5 in front of each step heading, ink.
- **Title** (700, 17px, width 112%): per-OS headings in the apply guides.
- **Body** (400, 15px, line-height 1.5): running text; ledes cap at 60ch, guide text at 64ch.
- **Control** (600, 14px): button labels; field labels at 500, 14px.
- **Label** (600, 11px, 0.06em, uppercase): ticket column headers and the folded-row field labels on phones.
- **Slug** (500, 12px, 0.04em, uppercase): the slug line of page sizes under the proof sheet.

### Named Rules
**The Two Widths Rule.** Width 125% is reserved for the wordmark and step numbers; everything a user reads to operate the tool is at normal width.

**The Tabular Rule.** Figures are tabular everywhere, including canvas labels on the proof, which are drawn in Archivo (600 or 700, 12px) once the web font has loaded.

## Layout

A two-column workspace. Left: the job ticket, a fixed 540px column holding the steps Screens, Gaps, and Download, separated by hairlines, with the primary Download ZIP button at the end. Right: the proof sheet (step 3, Picture) filling the remaining width, sticky to the top of the viewport, with its toolbar above and the slug line below. Below the workspace, a second band splits into the apply guides (fluid) and the saved-layout link (280-420px), again divided by a hairline.

Horizontal padding is a single fluid gutter (clamp(16px, 3vw, 40px)). Steps pad 26px top, 28px bottom. Inside steps the rhythm is small and tight: 6, 8, 10, 12, and 14px gaps between controls and rows.

Responsive behaviour: at 980px and below the workspace stacks to one column in the order Screens, Gaps, Picture, Download, and the sheet stops being sticky. At 560px and below the ticket header hides and each monitor row folds onto two lines with its own uppercase labels: number, resolution, position, remove on the first line; diagonal and primary on the second, with the Primary cell aligned to the Diag cell.

## Elevation & Depth

Flat. There are no drop shadows anywhere. Depth is expressed as print expresses it: a white sheet on paper ground with a 1px ink rule, the faint bleed (18% opacity) of the picture beyond each trimmed page, and ink-filled folios. Inset box-shadows appear only as state indicators on buttons (a 1px cyan inner ring on hover, a 3px cyan inner underline on the primary button's hover); they are rules, not lift.

### Named Rules
**The Hairline Rule.** Separation is a 1px ink rule (or a soft rule inside lists), never a card, panel, or shadow.

## Shapes

Near-square everywhere: 2px corners on buttons, inputs, and selects; 0 on the sheet, page numbers, and rules. The proof's own geometry is the signature form: crop marks (12px long, offset 4px from each trim corner), registration targets (a 7px-radius circle crossed by 24px hairlines) centred in the left and right sheet margins, and drafting-style dimension lines with end ticks. Icons are inline stroked SVG at 18px, 1.6 stroke, round caps.

## Components

### Buttons
Plain, tactile, typeset like ticket controls.
- **Shape:** near-square (2px), 1px ink border.
- **Default:** white with ink text, 38px tall, 0 16px padding.
- **Quiet:** same border and size, transparent background.
- **Primary:** ink fill, paper text, 44px tall, 0 22px padding, 15px. Used once: Download ZIP.
- **Hover / Focus:** default buttons take a cyan border plus 1px cyan inner ring; the primary deepens to pure black with a 3px cyan inner underline. Pressed goes to paper-deep. Focus is a 2px cyan outline offset 2px. Transitions are 120ms ease-out, removed under reduced motion.
- **Icon button:** 32px square, borderless at rest, ink border on hover.

### Inputs / Fields
- **Style:** white, 1px field-line border, 2px corners, 34px tall; numeric inputs in the ticket drop their spinners.
- **Focus:** 2px cyan outline at 0 offset, border goes to ink. Hover darkens the border to ink.
- **Error:** status text in error red; fields do not change colour.

### Job Ticket (signature)
The monitor list as a ruled table: an ink rule above, a heavy-ruled uppercase header row, rows divided by soft rules. Each row leads with an ink page-number folio (24px, paper numeral). The row whose page is highlighted on the proof is lit in yellow-lit.

### Proof Sheet (signature)
A white sheet with a 1px ink border holding the canvas. On it: faint bleed, crop marks and registration targets in ink, trimmed pages at full strength, ink folios in each page's top-left corner, magenta gap dimensions with white labels on magenta, an optional set of seven cyan Guides hairlines, and a 3px process-yellow frame (no fill) around the highlighted page. The sheet tints yellow-drop while a file is dragged over it. Under it, the slug line lists page count, sheet size in mm, each monitor, and the gaps.

### Calibration Pattern
What each monitor shows during calibration, drawn on a canvas at native pixels. Sheet-white ground; eight ink markers (6 × 6 cells, four corners and four edge midpoints, inset two cells from the lit edge); a magenta line along the exact lit edge (it is a measurement); the monitor number in the wide cut (800, 125%) as on step numbers, a headline at 650, and soft-ink instructions. The primary adds an ink QR code beside the number. Nothing else may sit near a marker, and the pointer hides while the pattern shows.

### Phone Capture Page
The same paper, colour bar, masthead, and step numbering as the desktop, in one column. Detected markers and screen outlines are drawn over the photo in magenta (they are measurements), with ink folios at each screen's corner; the photo is lightened so the marks read. Per-monitor results use ticket rows with folios; failures are error red. The measured layout is a small proof with magenta gap labels. The handoff code is set large in Archivo 700 with tracking, between two ink rules.

### Colour Bar (brand mark)
A 10px strip of twelve equal swatches across the top edge, decorative and hidden from assistive tech.

## Do's and Don'ts

### Do:
- **Do** separate regions with 1px ink rules and list rows with soft rules.
- **Do** give every process colour only its job: cyan for interaction, focus, and Guides; magenta for gap and trim measurement; yellow for highlight and selection.
- **Do** state measurements in millimetres with tabular figures, drawn as dimension lines on the proof.
- **Do** keep corners at 2px or square.
- **Do** keep the privacy line visible in the masthead.

### Don't:
- **Don't** use cards, panels, or drop shadows to group content.
- **Don't** use cyan or magenta in the test pattern or in any picture-like content on the sheet.
- **Don't** fill the highlighted page with yellow; the highlight is a 3px frame only.
- **Don't** use the colour bar's swatch tints as UI colours.
- **Don't** drift into gamer RGB/neon or a grey-card SaaS look with a single blue accent.
- **Don't** set operating UI text in the wide cut; it belongs to the wordmark and step numbers.
