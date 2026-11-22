---
name: "SKYTRACE | Local Airspace"
description: "A local ADS-B observation dashboard built around positions received by one receiver."
colors:
  lavender-blush: "#f5e6e8"
  thistle: "#d5c6e0"
  lilac-ash: "#aaa1c8"
  dusty-mauve: "#967aa1"
  space-indigo: "#192a51"
  paper: "#fffafc"
  paper-deep: "#fbf7fa"
  ink-soft: "#51466b"
  ink-muted: "#625978"
  line: "#ded3e2"
  map-night: "#111827"
  map-land: "#171e2d"
  map-road: "#35405a"
  aircraft-amber: "#f3a34b"
  aircraft-coral: "#ff7066"
typography:
  display:
    fontFamily: '"Barlow Condensed", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.1em"
  headline:
    fontFamily: '"Barlow Condensed", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
  title:
    fontFamily: '"Barlow Condensed", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.035em"
rounded:
  sm: "7px"
  md: "8px"
  lg: "10px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  aircraft-heading:
    textColor: "{colors.space-indigo}"
    typography: "{typography.headline}"
  search-field:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "44px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.md}"
    width: "44px"
    height: "44px"
  map-action:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  aircraft-row:
    backgroundColor: "transparent"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.md}"
    padding: "8px 7px"
  aircraft-row-selected:
    backgroundColor: "{colors.lavender-blush}"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.md}"
    padding: "8px 7px"
  status-pill:
    backgroundColor: "#e8f0e9"
    textColor: "#405f4b"
    rounded: "{rounded.pill}"
    padding: "6px 8px"
  map-marker:
    backgroundColor: "transparent"
    textColor: "{colors.aircraft-amber}"
    rounded: "0"
    width: "44px"
    height: "44px"
  map-marker-selected:
    backgroundColor: "transparent"
    textColor: "{colors.aircraft-coral}"
    rounded: "0"
    width: "44px"
    height: "44px"
  selected-path:
    startColor: "{colors.aircraft-amber}"
    endColor: "{colors.aircraft-coral}"
    glow: "soft, offset, low-opacity"
  detail-image-placeholder:
    backgroundColor: "{colors.lavender-blush}"
    textColor: "{colors.space-indigo}"
    rounded: "{rounded.md}"
    padding: "14px"
  detail-fact:
    backgroundColor: "transparent"
    textColor: "{colors.space-indigo}"
    padding: "11px 0 10px"
---

# Design System: SKYTRACE

## Overview

**Creative North Star: "The Receiver's Field Chart"**

SKYTRACE is a quiet, map-led working surface for local ADS-B reception. A pale lavender interface frames a custom dark night chart, where standalone amber airplane silhouettes make received positions easy to scan. The aircraft list sits in a collapsible left rail; an aircraft detail drawer overlays the map only after a plane is selected.

The interface makes its evidence boundary visible: markers identify aircraft with received positions, and the selected route draws received fixes only. Selecting an aircraft from either the map or list opens its details and links its marker, row, and path. The drawer shows decoded fields and the latest available SNR; aircraft model and airport origin/destination are not supplied by the receiver. Map tile attribution remains visible in the map controls.

**Key Characteristics:**
- Lavender page chrome around a dark, muted night chart, with amber aircraft marks and a coral selected state.
- Barlow Condensed brand and display headings, with platform sans body copy.
- A single inline airplane silhouette identifies aircraft and selection.
- Technical labels and measurements use a compact monospace face.
- Observed paths and details stay bounded to data received by this receiver.

## Colors

The interface shell uses pale lavender and space indigo. The map uses deep navy surfaces with restrained blue-gray roads and lilac labels. Warm amber marks aircraft, coral marks the selected aircraft, and the selected received path transitions from amber to coral.

### Primary
- **Aircraft Amber** (#f3a34b): Unselected aircraft silhouettes and the start of a selected path.
- **Aircraft Coral** (#ff7066): The selected aircraft silhouette and end of its received path.
- **Dusty Mauve** (#967aa1): Focus outlines and subtle interface emphasis.

### Secondary
- **Lavender Blush** (#f5e6e8): Page chrome, selected aircraft row, and signal-quality card.
- **Thistle** (#d5c6e0): Quiet marker and count-badge surfaces, plus soft outlines around selected or placeholder content.

### Tertiary
- **Lilac Ash** (#aaa1c8): Quiet receiver-status accents and map controls.

### Neutral
- **Space Indigo** (#192a51): Main text, structural framing, aircraft glyphs, and map controls.
- **Map Night** (#111827): Dark chart base.
- **Map Land** (#171e2d): Low-contrast land surfaces.
- **Map Road** (#35405a): Muted roads and secondary linework.
- **Paper** (#fffafc): Side rails and floating map panels.
- **Paper Deep** (#fbf7fa): Page and search-field ground.
- **Ink Soft** (#51466b): Map-label text.
- **Ink Muted** (#625978): Secondary labels, receiver context, and explanatory notes.
- **Line** (#ded3e2): Light dividers and control borders.

**The Chart Palette Rule.** Keep lavender in the interface shell and the map night-dark; use warm amber and coral only for aircraft and their selected received path.

## Typography

**Display Font:** Barlow Condensed (bundled locally at weights 600 and 700 under the included SIL Open Font License), with the platform sans stack as fallback.
**Body Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
**Label/Mono Font:** `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace`

**Character:** Barlow Condensed gives the SKYTRACE lockup and display headings a compact aeronautical-chart voice. Platform sans keeps body copy and controls familiar, while monospace gives ICAO identifiers, timestamps, telemetry, and measurements an instrument-readout quality.

### Hierarchy
- **Display** (weight 700, 15px, line-height 0.95, letter-spacing 0.1em): SKYTRACE wordmark in the header; its secondary lockup text uses weight 600.
- **Headline** (weight 700, 22px, line-height 1.1): Selected-aircraft callsign.
- **Title** (weight 700, 20px, line-height 1.15): Aircraft and detail-rail headings; the map title uses 18px on wider layouts and 16px on mobile. The overlapping-aircraft chooser uses weight 600 at 15px.
- **Body** (weight 400, 13px, line-height 1.55): Search text, detail explanations, and empty-state guidance.
- **Label** (weight 400, 12px, letter-spacing 0.035em): Compact receiver, identifier, time, and measurement metadata; the brand and receiver context use uppercase.

**The Barlow Display Rule.** Use bundled Barlow Condensed for the brand and display headings; keep body copy and controls in platform sans, and use the monospace stack for ICAO identifiers, timestamps, telemetry, and measurements.

## Layout

The desktop workspace sits below a 73px header and uses a collapsible aircraft rail beside a flexible map. The rail is 225–275px wide and collapses to a 64px edge tab. The detail drawer is hidden at startup; on aircraft selection it overlays the map at the right, leaving the map visible beneath it. At widths below 960px, the list and map share the workspace with page scrolling. Below 680px, the map leads at about 56dvh, the aircraft list sits below it, and the details drawer becomes a bottom sheet. Map controls remain visible when the drawer opens wherever the viewport allows.

Use a compact 4px-based rhythm, with 8px, 12px, 16px, and 24px intervals recurring in controls, cards, and rail spacing. Map overlays sit within the chart area; the bottom map attribution remains visible on desktop and tablet layouts.

## Elevation & Depth

The dashboard is mostly flat: paper rails and the lavender map ground are separated by fine borders and tonal contrast. Soft indigo-tinted shadows lift only map overlays, map controls, markers, and map popups. Selected list rows and detail placeholders rely on color and border changes rather than elevation.

### Shadow Vocabulary
- **Map overlay** (`box-shadow: 0 3px 12px rgba(25,42,81,.08)`): Map title and fit action.
- **Aircraft marker**: A subtle drop shadow on the standalone silhouette keeps it legible against detailed chart linework.
- **Map popup** (`box-shadow: 0 4px 14px rgba(25,42,81,.14)`): The overlapping-aircraft chooser.

**The Quiet Overlay Rule.** Keep the rails flat; use soft shadows to separate controls and aircraft marks from the detailed map beneath them.

## Shapes

Controls and cards use gently rounded corners (7–12px); the brand mark uses a 10px corner. Map aircraft are freestanding silhouettes without circles or badges. List glyphs, count/status pills, and image placeholders can use rounded surfaces. Thin lavender-gray borders organize surfaces without turning the dashboard into a grid of heavy boxes. Keyboard focus is called out with a 3px dusty-mauve outline and 3px offset.

## Components

### Buttons
- **Character:** Small, functional map and data actions use outline-first styling.
- **Shape:** Fit and locate actions use a 7px radius; icon-only refresh and clear controls use 8px.
- **Action buttons:** Paper ground, space-indigo text, a light line or thistle border, and 44px minimum height. Fit traffic has a soft map-overlay shadow; center-on-aircraft spans the details rail.
- **Icon buttons:** Transparent at rest with a 44px hit area; hover fills with lavender blush and shifts the border toward lilac ash.
- **Hover / Focus:** Hover states tint the surface. Keyboard focus uses the shared 3px dusty-mauve outline.

### Chips
- **Style:** Count and receiver-state labels are compact; the aircraft count and selected detail status use pill corners (99px).
- **State:** Live, stale, waiting, and error states change the dot or pill treatment. Keep the state label visible so color is not the only signal.

### Cards / Containers
- **Corner Style:** Aircraft rows and detail image placeholders use 8px corners; map panels use 8px.
- **Background:** Rails use paper; map overlays use a lightly translucent paper surface; the selected row and image placeholder use lavender blush.
- **Shadow Strategy:** Rails and rows stay flat. Refer to Elevation & Depth for map overlay and marker shadows.
- **Border:** Use the light line for separators and thistle around selected rows or the image placeholder.
- **Internal Padding:** Aircraft rows are compact (8px 7px); map-title panels use 11–13px; the image placeholder uses 14px.

### Inputs / Fields
- **Style:** The callsign/ICAO search field is 44px high on a paper-deep surface with a light border and 7px corners. Its search icon and keyboard hint stay quiet.
- **Focus:** Focus changes the field to paper and shifts its border to dusty mauve. The global focus outline remains available to keyboard users.
- **Error / Disabled:** No custom search error state is present; disabled fit traffic lowers contrast and removes the active cursor.

### Navigation
- **Style:** The 73px top bar carries the SKYTRACE lockup, receiver context, connection state, and last-update time. It has a paper surface and a fine lower divider rather than a multi-link navigation menu.
- **Mobile:** At 680px and below, the brand mark and name remain; the secondary brand line and last-update block hide, and receiver context is removed from the header.

### Aircraft Marker

The standalone inline-SVG airplane silhouette is the signature map component. It sits in a transparent 44px hit target, uses amber at rest and coral when selected, and has a soft drop shadow against the dark map. Hover scales it slightly. The selected marker, aircraft row, and received path share one selection state. The selected path transitions from amber to coral with a restrained glow. Stale markers are softened with reduced opacity. The silhouette is a UI glyph, not an aircraft image.

### Selected-Aircraft Details

The details drawer is hidden until an aircraft is selected from the map or list. It overlays the right side of the map on desktop and becomes a bottom sheet on mobile. It starts with a signal-quality card showing the latest decoded-message SNR, followed by the callsign, ICAO, status, and a two-column fact grid of locally decoded values. Model and airport origin/destination are omitted because they are not in the received ADS-B data.

## Do's and Don'ts

### Do:
- **Do** keep the interface shell lavender and the map dark; reserve amber and coral for aircraft and the selected received path.
- **Do** synchronize the selected aircraft's row, map marker, and received path.
- **Do** show `N/A` for unavailable values and label the image slot `N/A · not in received data`.
- **Do** describe path, duration, and distance as observed or received by this receiver; retain the received-fixes-only note.
- **Do** keep map-tile attribution visible where the map is shown.

### Don't:
- **Don't** imply a complete flight, full traffic coverage, or positions that were not received; do not fill gaps in a path.
- **Don't** replace the aircraft-image placeholder with an unsourced or generated aircraft photograph.
- **Don't** present observed duration or distance as a whole-flight measurement.
- **Don't** use color alone to distinguish live, stale, waiting, or error states.
