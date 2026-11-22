# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is the project owner, learning how ADS-B reception, GNU Radio processing, data handling, and web mapping fit together. A secondary audience is a potential interviewer viewing a project demonstration.

## Product Purpose

The project receives nearby 1090 MHz ADS-B messages with a personal RTL-SDR setup and presents decoded aircraft observations in a local browser dashboard. Success means the owner can understand and demonstrate the path from received signal to aircraft details and observed tracks. A 3D replay is a future project milestone, not a current dashboard capability.

## Positioning

This is a personal, educational receiver dashboard whose aircraft observations come from the owner's SDR and processing chain. It is not an internet-fed flight-tracking service, and the displayed tracks represent reports actually received rather than inferred paths.

## Operating Context

The owner runs the receiver, GNU Radio flowgraph, Python subscriber, and local web server on a personal computer, then views the dashboard in a browser. The receiver uses an RTL-SDR Blog V4L and dipole antenna. GNU Radio and existing ADS-B blocks are part of the learning workflow. The dashboard reads a local JSON snapshot; map tiles load from an external map service. The project may be shown to a potential interviewer as a working demonstration.

## Capabilities and Constraints

- The current dashboard polls `aircraft_snapshot_live.json`, plots aircraft with valid positions, shows received path points, and presents available aircraft details when selected.
- The redesigned map should use distinct, clickable airplane markers. Selecting a marker should reveal that aircraft’s observed path and a detail panel.
- The requested detail panel includes an aircraft image, model, origin, destination, observed time and distance, altitude, and speed. Show `N/A` wherever a value or image has not been collected.
- The current local snapshot provides fields such as ICAO, callsign, position, altitude, speed, heading, vertical rate, SNR, message count, and received position history. It does not currently include aircraft photos, model, origin, or destination. Any duration or distance calculated from local positions must be labeled as time or distance observed by this receiver, not the aircraft’s complete flight.
- The receiver covers only 1090 MHz ADS-B messages that are receivable at the antenna location. Aircraft without a decodable, receivable transmission may not appear.
- The path is based on received position reports. It does not fill gaps or estimate unobserved positions. Short-interval implausible jumps are filtered, and paths are split after long reception gaps.
- Aircraft data remains local to the computer in the current setup. The map uses externally loaded tiles.
- Historical storage, a replay timeline, and 3D path visualization are future work.

## Brand Commitments

- The dashboard should feel minimal and map-led, with custom-styled map presentation and clickable airplane markers.
- Preferred colors are lavender blush `#f5e6e8`, thistle `#d5c6e0`, lilac ash `#aaa1c8`, dusty mauve `#967aa1`, and space indigo `#192a51`, or close colors that preserve the same character.

## Evidence on Hand

- Existing GNU Radio flowgraph: `adsb_rx_rtlsdr.grc`.
- Python flowgraph, subscriber, and one-step launcher: `adsb_rx.py`, `aircraft_stream.py`, and `start_flight_tracker.command`.
- Current dashboard: `dashboard/index.html`, `dashboard/dashboard.css`, and `dashboard/dashboard.js`.
- Live local receiver snapshot: `aircraft_snapshot_live.json`.
- Project overview and milestone plan: `project_overview.md`.
- Do not fabricate aircraft, reception range, or claims of continuous or complete air-traffic coverage in the demonstration.

## Product Principles

- Make the observed-data boundary clear: show what the receiver decoded and avoid implying unobserved movement.
- Keep the signal-to-dashboard path understandable so the interface supports learning as well as demonstration.
- Keep received aircraft data local in the current setup and be clear that background map tiles come from an external service.
- Treat incomplete or stale aircraft fields as normal receiver conditions and communicate their availability accurately.
- Show `N/A` for unavailable aircraft details, and distinguish locally observed time and distance from a whole-flight estimate.
