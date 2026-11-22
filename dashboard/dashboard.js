import * as maplibregl from "https://unpkg.com/maplibre-gl@6.19.0/dist/maplibre-gl.mjs";

const DEMO_MODE = new URLSearchParams(window.location.search).get("demo") === "1";
const DATA_URL = DEMO_MODE ? "/examples/aircraft_snapshot_demo.json" : "/aircraft_snapshot_live.json";
const POLL_INTERVAL_MS = 1500;
const STALE_AFTER_SECONDS = 120;
const MAX_TRACK_GAP_SECONDS = 120;
const MAX_AIRCRAFT_SPEED_KT = 1200;
const POSITION_TOLERANCE_KM = 0.1;

const aircraftList = document.getElementById("aircraft-list");
const aircraftCount = document.getElementById("aircraft-count");
const detailsPanel = document.getElementById("aircraft-details");
const detailRail = document.getElementById("detail-rail");
const workspace = document.getElementById("workspace");
const aircraftRailContent = document.getElementById("aircraft-rail-content");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("aircraft-search");
const clearSearchButton = document.getElementById("clear-search");
const refreshButton = document.getElementById("refresh-button");
const collapseRailButton = document.getElementById("collapse-rail-button");
const fitButton = document.getElementById("fit-button");
const clearSelectionButton = document.getElementById("clear-selection");
const updatedAt = document.getElementById("updated-at");
const connectionStatus = document.getElementById("connection-status");
const connectionLabel = document.getElementById("connection-label");
const mapMessage = document.getElementById("map-message");

let aircraftData = [];
let selectedIcao = null;
let selectedFrom = "map";
let detailsOpen = false;
let railCollapsed = false;
let hasFitInitialData = false;
let lastFetchSucceeded = false;
let isFetching = false;
let dataError = false;
let demoSelectionApplied = false;
let activeAircraftPopup = null;
let pendingFit = null;
let mapReady = false;
let fitNoticeTimer = null;
const markerRefs = new Map();

const map = new maplibregl.Map({
  container: "map",
  style: "https://tiles.openfreemap.org/styles/bright",
  center: [-98.5, 39.8],
  zoom: 3.5,
  maplibreLogo: false,
  attributionControl: { compact: true, customAttribution: [] },
  cooperativeGestures: true,
  pitchWithRotate: false,
  dragRotate: false,
});

map.once("load", () => {
  const attribution = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
  if (!attribution) return;
  attribution.removeAttribute("open");
  attribution.classList.remove("maplibregl-compact-show");
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), "bottom-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "imperial" }), "bottom-right");

map.on("style.load", applyMapPalette);
map.on("load", addTrackLayer);
map.on("click", (event) => {
  const target = event.originalEvent?.target;
  if (target instanceof Element && target.closest(".maplibregl-ctrl, .maplibregl-popup")) return;
  if (selectedIcao) deselectAircraft(false);
});

function applyMapPalette() {
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return;

  for (const layer of style.layers) {
    const id = String(layer.id || "").toLowerCase();
    const sourceLayer = String(layer["source-layer"] || "").toLowerCase();
    const name = id + " " + sourceLayer;
    try {
      if (layer.type === "background") {
        map.setPaintProperty(layer.id, "background-color", "#111827");
      } else if (layer.type === "fill") {
        let fill = "#171e2d";
        if (/water|ocean|lake|river|canal/.test(name)) fill = "#101b2b";
        else if (/park|green|wood|grass|landcover|landuse/.test(name)) fill = "#192730";
        else if (/building/.test(name)) fill = "#20283a";
        map.setPaintProperty(layer.id, "fill-color", fill);
        if (/building/.test(name)) map.setPaintProperty(layer.id, "fill-opacity", 0.76);
      } else if (layer.type === "line") {
        let line = "#283249";
        if (/water|river|canal/.test(name)) line = "#26374c";
        else if (/boundary|admin/.test(name)) line = "#4a4864";
        else if (/road|transport|street|bridge|tunnel/.test(name)) line = "#35405a";
        map.setPaintProperty(layer.id, "line-color", line);
        map.setPaintProperty(layer.id, "line-opacity", /road|transport|street/.test(name) ? 0.78 : 0.68);
      } else if (layer.type === "symbol") {
        if (layer.layout && layer.layout["text-field"] !== undefined) {
          map.setPaintProperty(layer.id, "text-color", "#d0cbdc");
          map.setPaintProperty(layer.id, "text-halo-color", "#151b29");
          map.setPaintProperty(layer.id, "text-halo-width", 1.25);
        }
        if (/poi|transit|airport/.test(name) && layer.paint && layer.paint["icon-color"] !== undefined) {
          map.setPaintProperty(layer.id, "icon-color", "#9c94af");
        }
      }
    } catch (error) {
      console.debug("Skipped a map palette override for layer:", layer.id);
    }
  }
}

function addTrackLayer() {
  if (map.getSource("aircraft-tracks")) return;
  map.addSource("aircraft-tracks", {
    type: "geojson",
    lineMetrics: true,
    data: { type: "FeatureCollection", features: [] },
  });
  const firstSymbolLayer = map.getStyle().layers.find((layer) => layer.type === "symbol");
  const beforeLayer = firstSymbolLayer ? firstSymbolLayer.id : undefined;
  map.addLayer({
    id: "aircraft-tracks-glow",
    type: "line",
    source: "aircraft-tracks",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": "#ff8366",
      "line-width": 8,
      "line-opacity": 0.26,
      "line-blur": 3,
    },
  }, beforeLayer);
  map.addLayer({
    id: "aircraft-tracks-line",
    type: "line",
    source: "aircraft-tracks",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-gradient": [
        "interpolate", ["linear"], ["line-progress"],
        0, "#f2a44a",
        1, "#ff7066",
      ],
      "line-width": 3.25,
      "line-opacity": 0.98,
    },
  }, beforeLayer);
  mapReady = true;
  renderMap();
}

function positionedAircraftCount() {
  return aircraftData.filter((plane) => String(plane.icao || "UNKNOWN") !== "UNKNOWN" && getPosition(plane)).length;
}

function updateMapAvailability() {
  const positionedAircraft = positionedAircraftCount();
  document.getElementById("position-count").textContent = positionedAircraft + " aircraft positioned";
  fitButton.disabled = positionedAircraft === 0;
  if (dataError) return;
  if (fitNoticeTimer) return;

  if (!mapReady || !map.getSource("aircraft-tracks")) {
    mapMessage.hidden = false;
    mapMessage.textContent = pendingFit
      ? "Map is loading. Traffic will be fitted as soon as it’s ready."
      : positionedAircraft
        ? "Aircraft data is ready. The map is loading."
        : "Loading the chart map and local positions…";
    return;
  }

  mapMessage.hidden = positionedAircraft > 0;
  if (positionedAircraft === 0) {
    mapMessage.textContent = aircraftData.length
      ? "Aircraft messages are available, but no position reports have been received yet."
      : "Waiting for aircraft position reports.";
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPosition(plane) {
  const pos = plane.position || {};
  const latitude = finiteNumber(pos.latitude ?? plane.latitude);
  const longitude = finiteNumber(pos.longitude ?? plane.longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const candidate = {
    latitude,
    longitude,
    altitude: finiteNumber(pos.altitude_ft ?? plane.altitude),
    timestamp: finiteNumber(pos.timestamp_unix ?? plane.last_seen_unix),
  };

  const rawTrack = getTrack(plane);
  const newestTrackPoint = rawTrack[rawTrack.length - 1];
  if (newestTrackPoint
      && newestTrackPoint.latitude === candidate.latitude
      && newestTrackPoint.longitude === candidate.longitude) {
    const segments = getTrackSegments(plane);
    const lastAccepted = segments[segments.length - 1]?.at(-1);
    if (lastAccepted
        && (lastAccepted.latitude !== candidate.latitude || lastAccepted.longitude !== candidate.longitude)
        && lastAccepted.timestamp !== null
        && candidate.timestamp !== null) {
      const elapsed = candidate.timestamp - lastAccepted.timestamp;
      if (elapsed > 0 && elapsed <= MAX_TRACK_GAP_SECONDS) {
        const distanceKm = haversineKm(lastAccepted, candidate);
        const maxDistanceKm = elapsed * (MAX_AIRCRAFT_SPEED_KT * 1.852 / 3600) + POSITION_TOLERANCE_KM;
        if (distanceKm > maxDistanceKm) {
          return {
            latitude: lastAccepted.latitude,
            longitude: lastAccepted.longitude,
            altitude: lastAccepted.altitude,
            timestamp: lastAccepted.timestamp,
          };
        }
      }
    }
  }

  return candidate;
}

function getTrack(plane) {
  const points = Array.isArray(plane.track) ? plane.track : [];
  return points
    .map((point) => ({
      latitude: finiteNumber(point.latitude),
      longitude: finiteNumber(point.longitude),
      timestamp: finiteNumber(point.timestamp_unix),
      altitude: finiteNumber(point.altitude_ft),
    }))
    .filter((point) => point.latitude !== null && point.longitude !== null
      && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
}

function haversineKm(a, b) {
  const radians = Math.PI / 180;
  const lat1 = a.latitude * radians;
  const lat2 = b.latitude * radians;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function getTrackSegments(plane) {
  const segments = [];
  let segment = [];

  for (const point of getTrack(plane)) {
    if (!segment.length) {
      segment.push(point);
      continue;
    }

    const previous = segment[segment.length - 1];
    if (previous.timestamp === null || point.timestamp === null) {
      segments.push(segment);
      segment = [point];
      continue;
    }

    const elapsed = point.timestamp - previous.timestamp;
    const distanceKm = haversineKm(previous, point);
    if (elapsed <= 0) {
      if (distanceKm <= POSITION_TOLERANCE_KM) segment[segment.length - 1] = point;
      continue;
    }
    if (elapsed > MAX_TRACK_GAP_SECONDS) {
      segments.push(segment);
      segment = [point];
      continue;
    }

    const maxDistanceKm = elapsed * (MAX_AIRCRAFT_SPEED_KT * 1.852 / 3600) + POSITION_TOLERANCE_KM;
    if (distanceKm <= maxDistanceKm) segment.push(point);
  }

  if (segment.length) segments.push(segment);
  return segments;
}

function trackBearing(plane) {
  const points = getTrackSegments(plane).at(-1) || [];
  if (points.length < 2) return normalizeHeading(plane.heading);
  const previous = points.at(-2);
  const current = points.at(-1);
  const radians = Math.PI / 180;
  const lat1 = previous.latitude * radians;
  const lat2 = current.latitude * radians;
  const deltaLon = (current.longitude - previous.longitude) * radians;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) / radians + 360) % 360;
}

function trackMetrics(plane) {
  let distanceKm = 0;
  let durationSeconds = 0;
  let validEdges = 0;
  for (const segment of getTrackSegments(plane)) {
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const point = segment[index];
      distanceKm += haversineKm(previous, point);
      if (previous.timestamp !== null && point.timestamp !== null && point.timestamp > previous.timestamp) {
        durationSeconds += point.timestamp - previous.timestamp;
      }
      validEdges += 1;
    }
  }
  return validEdges ? { distanceKm, durationSeconds } : null;
}

function ageSeconds(plane) {
  const timestamp = finiteNumber(plane.position?.timestamp_unix ?? plane.last_seen_unix);
  return timestamp === null ? Infinity : Math.max(0, Date.now() / 1000 - timestamp);
}

function isStale(plane) {
  return ageSeconds(plane) > STALE_AFTER_SECONDS;
}

function display(value, suffix, digits) {
  const number = finiteNumber(value);
  return number === null ? "N/A" : number.toFixed(digits || 0) + (suffix || "");
}

function displayText(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "N/A";
  return String(value).trim();
}

function ageLabel(seconds) {
  if (!Number.isFinite(seconds)) return "No signal";
  if (seconds < 5) return "Live";
  if (seconds < 60) return Math.round(seconds) + " sec ago";
  if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " hr ago";
  return Math.floor(seconds / 86400) + " d ago";
}

function friendlyTime(timestamp) {
  if (!timestamp) return "N/A";
  const date = new Date(timestamp * 1000);
  if (!Number.isFinite(date.getTime())) return "N/A";
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "N/A";
  if (seconds < 60) return seconds.toFixed(1) + " sec";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remaining = total % 60;
  if (minutes < 60) return minutes + " min " + String(remaining).padStart(2, "0") + " sec";
  const hours = Math.floor(minutes / 60);
  return hours + " hr " + (minutes % 60) + " min";
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return "N/A";
  if (distanceKm < 1) return Math.round(distanceKm * 1000) + " m";
  return distanceKm.toFixed(1) + " km";
}

function normalizeHeading(value) {
  const heading = finiteNumber(value);
  return heading === null ? null : ((heading % 360) + 360) % 360;
}

function planeSvg() {
  return '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 1 18.6 11.2 30 16.8v2.3l-11.5-2.3-.4 8.6 3.1 2.8V30L16 28.8 10.8 30v-1.8l3.1-2.8-.4-8.6L2 19.1v-2.3l11.4-5.6L16 1Z"/></svg>';
}

function handleAircraftMarkerClick(icao) {
  const plane = aircraftData.find((item) => String(item.icao) === icao);
  const position = plane ? getPosition(plane) : null;
  if (!plane || !position) return;
  const origin = map.project([position.longitude, position.latitude]);
  const nearby = aircraftData
    .map((candidate) => ({ plane: candidate, position: getPosition(candidate) }))
    .filter((candidate) => candidate.position)
    .map((candidate) => {
      const point = map.project([candidate.position.longitude, candidate.position.latitude]);
      return { ...candidate, screenDistance: Math.hypot(point.x - origin.x, point.y - origin.y) };
    })
    .filter((candidate) => candidate.screenDistance <= 48)
    .sort((a, b) => a.screenDistance - b.screenDistance);

  if (nearby.length < 2) {
    selectAircraft(icao, true, "map");
    return;
  }
  showAircraftPicker(nearby, [position.longitude, position.latitude]);
}

function showAircraftPicker(nearby, coordinates) {
  activeAircraftPopup?.remove();
  const content = document.createElement("div");
  content.className = "aircraft-picker-content";
  const heading = document.createElement("strong");
  heading.setAttribute("role", "heading");
  heading.setAttribute("aria-level", "3");
  heading.className = "aircraft-picker-heading";
  heading.textContent = "Aircraft at this position";
  const list = document.createElement("div");
  list.className = "aircraft-picker-list";

  for (const entry of nearby) {
    const plane = entry.plane;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "aircraft-picker-option";
    button.setAttribute("aria-label", "Select " + displayText(plane.callsign) + ", ICAO " + String(plane.icao || "UNKNOWN"));
    const callsign = document.createElement("span");
    callsign.className = "aircraft-picker-callsign";
    callsign.textContent = displayText(plane.callsign);
    const detail = document.createElement("span");
    detail.className = "aircraft-picker-icao";
    detail.textContent = String(plane.icao || "UNKNOWN") + " · " + display(plane.altitude ?? entry.position.altitude, " ft", 0);
    button.append(callsign, detail);
    button.addEventListener("click", () => {
      const selected = String(plane.icao || "UNKNOWN");
      activeAircraftPopup?.remove();
      activeAircraftPopup = null;
      selectAircraft(selected, true, "map");
    });
    list.append(button);
  }

  content.append(heading, list);
  activeAircraftPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: true,
    closeOnMove: false,
    maxWidth: "280px",
    offset: 25,
    className: "aircraft-picker-popup",
  }).setLngLat(coordinates).setDOMContent(content).addTo(map);
  activeAircraftPopup.on("close", () => { activeAircraftPopup = null; });
  requestAnimationFrame(() => content.querySelector("button")?.focus({ preventScroll: true }));
}

function setConnection(state, label) {
  connectionStatus.classList.remove("is-live", "is-error", "is-waiting");
  connectionStatus.classList.add(state);
  connectionLabel.textContent = label;
}

function renderList() {
  const focusedIcao = document.activeElement?.classList?.contains("aircraft-card")
    ? document.activeElement.dataset.icao
    : null;
  const query = searchInput.value.trim().toLowerCase();
  const ordered = [...aircraftData].sort((a, b) => {
    const posA = getPosition(a) ? 1 : 0;
    const posB = getPosition(b) ? 1 : 0;
    return posB - posA || ageSeconds(a) - ageSeconds(b);
  });
  const filtered = ordered.filter((plane) => {
    const searchable = (plane.callsign || "") + " " + (plane.icao || "");
    return searchable.toLowerCase().includes(query);
  });
  aircraftCount.textContent = String(aircraftData.length);
  clearSearchButton.hidden = !searchInput.value;

  if (!filtered.length) {
    aircraftList.innerHTML = '<li class="empty-list">' + (aircraftData.length
      ? "No aircraft match this search."
      : "No aircraft in the snapshot yet. Start the subscriber and GNU Radio flowgraph.") + "</li>";
    return;
  }

  aircraftList.innerHTML = filtered.map((plane) => {
    const icao = String(plane.icao || "UNKNOWN");
    const hasPosition = Boolean(getPosition(plane));
    const stale = isStale(plane);
    const state = !hasPosition ? "No position yet" : (stale ? ageLabel(ageSeconds(plane)) : "Tracking");
    const stateClass = !hasPosition ? "is-waiting" : (stale ? "is-stale" : "");
    const selected = icao === selectedIcao ? " is-selected" : "";
    const title = displayText(plane.callsign);
    const altitude = display(plane.altitude ?? plane.position?.altitude_ft, " ft", 0);
    const pressed = icao === selectedIcao ? "true" : "false";
    return '<li><button class="aircraft-card' + selected + '" type="button" aria-pressed="' + pressed + '" data-icao="' + escapeHtml(icao) + '">' +
      '<span class="list-plane" aria-hidden="true">' + planeSvg() + '</span>' +
      '<span class="aircraft-card-main"><span class="aircraft-callsign">' + escapeHtml(title) + '</span><span class="aircraft-icao">' + escapeHtml(icao) + '</span></span>' +
      '<span class="aircraft-card-side"><span class="aircraft-alt">' + altitude + '</span><span class="aircraft-state ' + stateClass + '">' + escapeHtml(state) + '</span></span>' +
      '</button></li>';
  }).join("");

  aircraftList.querySelectorAll(".aircraft-card").forEach((button) => {
    button.addEventListener("click", () => selectAircraft(button.dataset.icao, true, "list"));
  });
  if (focusedIcao) {
    Array.from(aircraftList.querySelectorAll(".aircraft-card"))
      .find((button) => button.dataset.icao === focusedIcao)
      ?.focus({ preventScroll: true });
  }
}

function fact(label, value, wide) {
  return '<div class="fact' + (wide ? " fact-wide" : "") + '"><span class="fact-label">' + label + '</span><span class="fact-value">' + escapeHtml(value) + "</span></div>";
}

function renderDetails(animate) {
  const preserveLocateFocus = document.activeElement?.id === "locate-selected";
  const plane = aircraftData.find((item) => String(item.icao) === selectedIcao);
  clearSelectionButton.hidden = !plane;
  if (!plane) {
    detailsPanel.innerHTML = '<div class="detail-placeholder"><span class="placeholder-plane" aria-hidden="true">' + planeSvg() + '</span><p>Select an aircraft to see its received path and decoded details.</p></div>';
    detailsPanel.removeAttribute("data-animate");
    return;
  }

  const position = getPosition(plane);
  const age = ageSeconds(plane);
  const statusClass = !position ? "is-waiting" : (age > STALE_AFTER_SECONDS ? "is-stale" : "");
  const statusText = !position ? "No position" : (DEMO_MODE ? "Demo" : ageLabel(age));
  const title = displayText(plane.callsign);
  const icao = displayText(plane.icao);
  const coordinates = position ? position.latitude.toFixed(5) + ", " + position.longitude.toFixed(5) : "N/A";
  const track = trackMetrics(plane);
  const observedDuration = track ? formatDuration(track.durationSeconds) : "N/A";
  const observedDistance = track ? formatDistance(track.distanceKm) : "N/A";
  const snr = finiteNumber(plane.snr);
  const snrWidth = snr === null ? 0 : Math.max(0, Math.min(100, (snr / 30) * 100));

  detailsPanel.innerHTML =
    '<div class="detail-content">' +
      '<div class="detail-image signal-monitor" role="img" aria-label="Latest signal to noise ratio ' + (snr === null ? 'unavailable' : escapeHtml(snr.toFixed(1) + ' decibels')) + '">' +
        '<span class="signal-heading"><strong>Signal quality</strong><b>' + (snr === null ? 'N/A' : escapeHtml(snr.toFixed(1) + ' dB SNR')) + '</b></span>' +
        '<span class="signal-meter" aria-hidden="true"><i style="width:' + snrWidth + '%"></i></span>' +
        '<span class="signal-caption">Latest decoded message</span>' +
      '</div>' +
      '<div class="details-title-row"><div><div class="details-callsign">' + escapeHtml(title) + '</div><div class="details-icao">ICAO ' + escapeHtml(icao) + '</div></div><span class="status-pill ' + statusClass + '">' + escapeHtml(statusText) + '</span></div>' +
      '<div class="fact-grid">' +
        fact("Observed duration", observedDuration, false) +
        fact("Observed distance", observedDistance, false) +
        fact("Altitude · barometric", display(plane.altitude ?? position?.altitude, " ft", 0), false) +
        fact("Ground speed", display(plane.speed, " kt", 0), false) +
        fact("Heading", display(normalizeHeading(plane.heading), "°", 0), false) +
        fact("Vertical rate", display(plane.vertical_rate, " ft/min", 0), false) +
        fact("Position", coordinates, true) +
        fact("Downlink format", display(plane.df, "", 0), false) +
        fact("Messages", display(plane.num_msgs, "", 0), false) +
        fact("Last received", friendlyTime(finiteNumber(plane.last_seen_unix)), true) +
      '</div>' +
      (position ? '<button class="detail-locate" type="button" id="locate-selected"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v4m0 10v4M3 12h4m10 0h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/></svg>Center on aircraft</button>' : "") +
    '</div>';

  if (animate) detailsPanel.setAttribute("data-animate", "true");
  else detailsPanel.removeAttribute("data-animate");
  document.getElementById("locate-selected")?.addEventListener("click", () => flyToPlane(plane));
  if (preserveLocateFocus) document.getElementById("locate-selected")?.focus({ preventScroll: true });
}

function renderMap() {
  updateMapAvailability();
  if (!mapReady || !map.getSource("aircraft-tracks")) return;
  const visibleCoordinates = [];
  let positionedAircraft = 0;
  const activeIds = new Set();

  for (const plane of aircraftData) {
    const icao = String(plane.icao || "UNKNOWN");
    if (icao === "UNKNOWN") continue;
    const position = getPosition(plane);
    if (!position) continue;
    positionedAircraft += 1;
    activeIds.add(icao);
    const coordinate = [position.longitude, position.latitude];
    visibleCoordinates.push(coordinate);
    let markerEntry = markerRefs.get(icao);
    if (!markerEntry) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-aircraft-marker";
      button.innerHTML = planeSvg();
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handleAircraftMarkerClick(icao);
      });
      const marker = new maplibregl.Marker({
        element: button,
        anchor: "center",
        rotationAlignment: "viewport",
        pitchAlignment: "viewport",
      }).setLngLat(coordinate).addTo(map);
      markerEntry = { marker, button };
      markerRefs.set(icao, markerEntry);
    }

    const selected = icao === selectedIcao;
    markerEntry.marker.setLngLat(coordinate);
    markerEntry.button.classList.toggle("is-selected", selected);
    markerEntry.button.classList.toggle("is-stale", isStale(plane));
    markerEntry.button.setAttribute("aria-pressed", String(selected));
    markerEntry.button.setAttribute("aria-label", "Select " + displayText(plane.callsign) + ", ICAO " + icao);
    markerEntry.button.title = displayText(plane.callsign) + " · " + icao;
    const svg = markerEntry.button.querySelector("svg");
    svg.style.transform = "rotate(" + (trackBearing(plane) || 0) + "deg)";
  }

  for (const [icao, entry] of markerRefs) {
    if (!activeIds.has(icao)) {
      entry.marker.remove();
      markerRefs.delete(icao);
    }
  }

  const selectedPlane = aircraftData.find((plane) => String(plane.icao) === selectedIcao);
  const selectedSegments = selectedPlane ? getTrackSegments(selectedPlane) : [];
  const features = [];
  for (const segment of selectedSegments) {
    segment.forEach((point) => visibleCoordinates.push([point.longitude, point.latitude]));
    if (segment.length > 1) {
      features.push({
        type: "Feature",
        properties: { icao: selectedIcao },
        geometry: { type: "LineString", coordinates: segment.map((point) => [point.longitude, point.latitude]) },
      });
    }
  }
  map.getSource("aircraft-tracks").setData({ type: "FeatureCollection", features });

  if (!hasFitInitialData && visibleCoordinates.length) {
    hasFitInitialData = true;
    fitCoordinates(visibleCoordinates);
  }
}

function getAllCoordinates() {
  const coordinates = [];
  aircraftData.forEach((plane) => {
    getTrackSegments(plane).forEach((segment) => {
      segment.forEach((point) => coordinates.push([point.longitude, point.latitude]));
    });
    const position = getPosition(plane);
    if (position) coordinates.push([position.longitude, position.latitude]);
  });
  return coordinates;
}

function fitCoordinates(coordinates, maxZoom, announce = false) {
  if (!coordinates.length) return;
  if (!mapReady || !map.getSource("aircraft-tracks")) {
    pendingFit = { coordinates, maxZoom, announce };
    updateMapAvailability();
    return;
  }
  if (coordinates.length === 1) {
    map.easeTo({ center: coordinates[0], zoom: Math.max(map.getZoom(), 10), duration: 350 });
    if (announce) announceTrafficFit();
    return;
  }
  const bounds = coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
  );
  map.fitBounds(bounds, { padding: { top: 92, right: 84, bottom: 94, left: 84 }, maxZoom: maxZoom || 11, duration: 380 });
  if (announce) announceTrafficFit();
}

function announceTrafficFit() {
  const count = positionedAircraftCount();
  mapMessage.hidden = false;
  mapMessage.textContent = "Map fitted to " + count + " aircraft and their observed paths.";
  window.clearTimeout(fitNoticeTimer);
  fitNoticeTimer = window.setTimeout(() => {
    fitNoticeTimer = null;
    updateMapAvailability();
  }, 2200);
}

function flyToPlane(plane) {
  const position = getPosition(plane);
  if (position) map.easeTo({ center: [position.longitude, position.latitude], zoom: Math.max(map.getZoom(), 10.5), duration: 350 });
}

function focusPlanePath(plane) {
  const coordinates = getTrackSegments(plane)
    .flatMap((segment) => segment.map((point) => [point.longitude, point.latitude]));
  if (coordinates.length > 1) fitCoordinates(coordinates, 10);
  else flyToPlane(plane);
}

function setDetailsOpen(open) {
  detailsOpen = Boolean(open);
  workspace.classList.toggle("is-details-open", detailsOpen);
  detailRail.classList.toggle("is-open", detailsOpen);
  detailRail.setAttribute("aria-hidden", String(!detailsOpen));
  detailRail.inert = !detailsOpen;
}

function deselectAircraft(restoreFocus = false, restoreOverview = true) {
  const previousIcao = selectedIcao;
  const previousSource = selectedFrom;
  const hadSelection = Boolean(previousIcao);

  activeAircraftPopup?.remove();
  activeAircraftPopup = null;
  selectedIcao = null;
  selectedFrom = "map";
  setDetailsOpen(false);
  renderList();
  renderDetails(false);
  renderMap();

  if (restoreOverview && hadSelection && mapReady) {
    const coordinates = aircraftData
      .map((plane) => getPosition(plane))
      .filter(Boolean)
      .map((position) => [position.longitude, position.latitude]);
    if (coordinates.length) fitCoordinates(coordinates);
  }

  if (!restoreFocus || !hadSelection) return;
  requestAnimationFrame(() => {
    let target = null;
    if (previousSource === "list") {
      target = Array.from(aircraftList.querySelectorAll(".aircraft-card"))
        .find((button) => button.dataset.icao === previousIcao);
    }
    target ||= markerRefs.get(previousIcao)?.button;
    target ||= collapseRailButton;
    target.focus({ preventScroll: true });
  });
}

function closeDetailsPanel(restoreFocus = true) {
  deselectAircraft(restoreFocus);
}

function selectAircraft(icao, moveMap, source = "map") {
  activeAircraftPopup?.remove();
  activeAircraftPopup = null;
  selectedIcao = String(icao);
  selectedFrom = source;
  setDetailsOpen(true);
  renderList();
  renderDetails(true);
  renderMap();
  const plane = aircraftData.find((item) => String(item.icao) === selectedIcao);
  if (moveMap && plane) focusPlanePath(plane);
}

function setRailCollapsed(collapsed) {
  railCollapsed = Boolean(collapsed);
  workspace.classList.toggle("is-rail-collapsed", railCollapsed);
  collapseRailButton.setAttribute("aria-expanded", String(!railCollapsed));
  collapseRailButton.setAttribute("aria-label", railCollapsed ? "Expand aircraft list" : "Collapse aircraft list");
  collapseRailButton.title = railCollapsed ? "Expand aircraft list" : "Collapse aircraft list";
  aircraftRailContent.setAttribute("aria-hidden", String(railCollapsed));
  aircraftRailContent.inert = railCollapsed;
  requestAnimationFrame(() => map.resize());
  window.setTimeout(() => map.resize(), 240);
}

function updateSnapshotTime(snapshot) {
  if (!snapshot.updated_utc) {
    updatedAt.textContent = "N/A";
    updatedAt.removeAttribute("datetime");
    return;
  }
  const timestamp = Date.parse(snapshot.updated_utc);
  if (!Number.isFinite(timestamp)) {
    updatedAt.textContent = "N/A";
    updatedAt.removeAttribute("datetime");
    return;
  }
  const date = new Date(timestamp);
  updatedAt.dateTime = date.toISOString();
  updatedAt.textContent = date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  updatedAt.title = date.toLocaleString([], { dateStyle: "full", timeStyle: "medium" });
}

function rebaseDemoTimestamps(snapshot) {
  const snapshotTime = Date.parse(snapshot.updated_utc || "");
  if (!Number.isFinite(snapshotTime)) return;

  const shiftMs = Date.now() - snapshotTime;
  const shiftSeconds = shiftMs / 1000;
  const shiftUnix = (value) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp + shiftSeconds : value;
  };
  const shiftUtc = (value) => {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? new Date(timestamp + shiftMs).toISOString() : value;
  };

  snapshot.updated_utc = new Date(snapshotTime + shiftMs).toISOString();
  for (const plane of snapshot.aircraft) {
    plane.last_seen_unix = shiftUnix(plane.last_seen_unix);
    plane.last_seen_utc = shiftUtc(plane.last_seen_utc);
    if (plane.position) {
      plane.position.timestamp_unix = shiftUnix(plane.position.timestamp_unix);
      plane.position.timestamp_utc = shiftUtc(plane.position.timestamp_utc);
    }
    if (Array.isArray(plane.track)) {
      for (const point of plane.track) {
        point.timestamp_unix = shiftUnix(point.timestamp_unix);
        point.timestamp_utc = shiftUtc(point.timestamp_utc);
      }
    }
  }
}

async function refreshData(manual) {
  if (isFetching) return;
  isFetching = true;
  if (manual) {
    refreshButton.disabled = true;
    refreshButton.classList.add("is-refreshing");
  }

  try {
    const response = await fetch(DATA_URL + "?_=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const snapshot = await response.json();
    if (!Array.isArray(snapshot.aircraft)) throw new Error("Snapshot is missing its aircraft list");
    if (DEMO_MODE) rebaseDemoTimestamps(snapshot);
    aircraftData = snapshot.aircraft;
    if (DEMO_MODE && !demoSelectionApplied) {
      demoSelectionApplied = true;
      const initialIcao = new URLSearchParams(window.location.search).get("aircraft");
      if (initialIcao && aircraftData.some((plane) => String(plane.icao) === initialIcao)) {
        selectedIcao = initialIcao;
        selectedFrom = "map";
        setDetailsOpen(true);
      }
    }
    dataError = false;
    updateMapAvailability();
    const positions = aircraftData.filter((plane) => getPosition(plane));
    if (selectedIcao && !aircraftData.some((plane) => String(plane.icao) === selectedIcao)) deselectAircraft(false, false);
    const snapshotTimestamp = snapshot.updated_utc ? Date.parse(snapshot.updated_utc) / 1000 : null;
    const snapshotAge = snapshotTimestamp === null || !Number.isFinite(snapshotTimestamp)
      ? Infinity
      : Math.max(0, Date.now() / 1000 - snapshotTimestamp);
    if (DEMO_MODE) {
      setConnection(snapshotAge > 15 ? "is-waiting" : "is-live", "DEMO DATA · SYNTHETIC TRACKS");
    } else if (snapshotAge > 15) {
      setConnection("is-waiting", snapshot.updated_utc ? "SAVED SNAPSHOT · " + ageLabel(snapshotAge) : "SNAPSHOT TIME N/A");
    } else {
      setConnection("is-live", positions.length ? "RECEIVER DATA LIVE" : "MESSAGES · NO POSITIONS YET");
    }
    updateSnapshotTime(snapshot);
    lastFetchSucceeded = true;
    renderList();
    renderDetails(false);
    renderMap();
  } catch (error) {
    dataError = true;
    if (!lastFetchSucceeded) setConnection("is-error", "LOCAL DATA UNAVAILABLE");
    else setConnection("is-error", "SNAPSHOT REFRESH FAILED");
    mapMessage.hidden = false;
    mapMessage.textContent = "Can’t load aircraft_snapshot_live.json. Start the local web server in the project folder, then check the subscriber.";
    console.error("ADS-B snapshot refresh failed:", error);
  } finally {
    isFetching = false;
    if (manual) {
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-refreshing");
    }
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

searchForm.addEventListener("submit", (event) => event.preventDefault());
searchInput.addEventListener("input", renderList);
clearSearchButton.addEventListener("click", () => {
  searchInput.value = "";
  renderList();
  searchInput.focus();
});
refreshButton.addEventListener("click", () => refreshData(true));
clearSelectionButton.addEventListener("click", () => closeDetailsPanel());
collapseRailButton.addEventListener("click", () => setRailCollapsed(!railCollapsed));
fitButton.addEventListener("click", () => fitCoordinates(getAllCoordinates(), undefined, true));
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape" && document.activeElement === searchInput) {
    if (searchInput.value) {
      searchInput.value = "";
      renderList();
    } else {
      searchInput.blur();
    }
  }
  if (event.key === "Escape" && detailsOpen && detailRail.contains(document.activeElement)) {
    event.preventDefault();
    closeDetailsPanel();
  }
});

workspace.addEventListener("transitionend", (event) => {
  if (event.target === workspace && event.propertyName === "grid-template-columns") map.resize();
});

map.on("load", () => {
  if (pendingFit) {
    const fit = pendingFit;
    pendingFit = null;
    fitCoordinates(fit.coordinates, fit.maxZoom, fit.announce);
  }
});

map.on("error", (event) => {
  if (event?.error) console.warn("Map resource error:", event.error.message || event.error);
});

refreshData(false);
window.setInterval(() => refreshData(false), POLL_INTERVAL_MS);
