"""Receive decoded ADS-B messages from the GNU Radio ZeroMQ publisher.

Start this subscriber before starting adsb_rx_rtlsdr.grc. It writes a live
aircraft snapshot to aircraft_snapshot_live.json in this project directory.
"""

from __future__ import annotations

import json
import math
from numbers import Real
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import pmt
import zmq


ZMQ_ADDRESS = "tcp://127.0.0.1:5001"
PROJECT_DIR = Path(__file__).resolve().parent
OUTPUT_PATH = PROJECT_DIR / "aircraft_snapshot_live.json"
TEMP_PATH = OUTPUT_PATH.with_suffix(".tmp")
MAX_TRACK_POINTS = 500
MAX_TRACK_GAP_SECONDS = 120.0
MAX_AIRCRAFT_SPEED_KT = 1200.0
POSITION_TOLERANCE_KM = 0.1

AIRCRAFT_FIELDS = (
    "callsign",
    "altitude",
    "speed",
    "heading",
    "vertical_rate",
    "snr",
    "df",
)


def json_value(value):
    """Convert NumPy-like numbers and NaN/inf values to JSON-safe values."""
    if isinstance(value, bool):
        return value
    if isinstance(value, Real):
        number = float(value)
        return number if math.isfinite(number) else None
    if isinstance(value, str) or value is None:
        return value
    return str(value)


def finite_number(value) -> float | None:
    """Return a finite numeric value, including NumPy scalar numbers."""
    normalized = json_value(value)
    if isinstance(normalized, bool) or not isinstance(normalized, Real):
        return None
    number = float(normalized)
    return number if math.isfinite(number) else None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two WGS84 latitude/longitude pairs."""
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371.0088 * 2 * math.asin(math.sqrt(min(1.0, value)))


def plausible_position(previous: dict | None, latitude: float, longitude: float, timestamp: float) -> bool:
    """Reject impossible short-interval jumps, but start a new segment after long gaps."""
    if previous is None:
        return True

    previous_time = finite_number(previous.get("timestamp_unix"))
    if previous_time is None:
        return True
    elapsed = timestamp - previous_time
    distance_km = haversine_km(
        previous["latitude"], previous["longitude"], latitude, longitude
    )

    if elapsed <= 0:
        return distance_km <= POSITION_TOLERANCE_KM
    if elapsed > MAX_TRACK_GAP_SECONDS:
        return True

    max_distance_km = elapsed * (MAX_AIRCRAFT_SPEED_KT * 1.852 / 3600) + POSITION_TOLERANCE_KM
    return distance_km <= max_distance_km


def save_snapshot(aircraft: dict[str, dict]) -> None:
    document = {
        "updated_utc": datetime.now(timezone.utc).isoformat(),
        "aircraft": sorted(
            aircraft.values(),
            key=lambda plane: plane.get("last_seen_unix") or 0,
            reverse=True,
        ),
    }
    with TEMP_PATH.open("w", encoding="utf-8") as output:
        json.dump(document, output, indent=2, allow_nan=False)
        output.write("\n")
    os.replace(TEMP_PATH, OUTPUT_PATH)


def main() -> None:
    context = zmq.Context.instance()
    subscriber = context.socket(zmq.SUB)
    subscriber.setsockopt(zmq.LINGER, 0)
    subscriber.setsockopt(zmq.SUBSCRIBE, b"")
    subscriber.connect(ZMQ_ADDRESS)

    aircraft: dict[str, dict] = {}
    print(f"Listening for GNU Radio ADS-B messages at {ZMQ_ADDRESS}")
    print(f"Writing live snapshot to {OUTPUT_PATH.resolve()}")

    try:
        while True:
            serialized = subscriber.recv()
            pdu = pmt.deserialize_str(serialized)
            metadata = pmt.to_python(pmt.car(pdu))

            if not isinstance(metadata, dict):
                continue
            icao = metadata.get("icao")
            if not icao:
                continue
            icao = str(icao).upper()

            now = time.time()
            plane = aircraft.setdefault(
                icao,
                {
                    "icao": icao,
                    "position": None,
                    "track": [],
                },
            )
            message_timestamp = finite_number(metadata.get("timestamp"))
            if message_timestamp is None:
                message_timestamp = now
            plane["last_seen_unix"] = message_timestamp
            plane["last_seen_utc"] = metadata.get(
                "datetime", datetime.fromtimestamp(message_timestamp, timezone.utc).isoformat()
            )
            plane["num_msgs"] = plane.get("num_msgs", 0) + 1

            for field in AIRCRAFT_FIELDS:
                if field not in metadata:
                    continue
                value = json_value(metadata[field])
                # Preserve the last known value when a message has no update
                # for that field (the decoder represents missing numbers as NaN).
                if value is not None:
                    plane[field] = value

            # Coordinates are position updates, not persistent telemetry. Do not
            # reuse the previous latitude/longitude for a non-position message.
            lat = finite_number(metadata.get("latitude"))
            lon = finite_number(metadata.get("longitude"))
            accepted_position = False
            rejected_position = False
            if (
                lat is not None
                and lon is not None
                and -90 <= lat <= 90
                and -180 <= lon <= 180
            ):
                point = {
                    "timestamp_unix": message_timestamp,
                    "timestamp_utc": plane["last_seen_utc"],
                    "latitude": lat,
                    "longitude": lon,
                    "altitude_ft": plane.get("altitude"),
                }
                track = plane["track"]
                previous_position = plane.get("position")
                if plausible_position(previous_position, lat, lon, message_timestamp):
                    plane["latitude"] = lat
                    plane["longitude"] = lon
                    if not track or (track[-1]["latitude"], track[-1]["longitude"]) != (lat, lon):
                        track.append(point)
                        del track[:-MAX_TRACK_POINTS]
                    elif track:
                        # Refresh the timestamp without adding a duplicate path vertex.
                        track[-1] = point
                    plane["position"] = point
                    accepted_position = True
                else:
                    rejected_position = True

            save_snapshot(aircraft)
            if accepted_position:
                print(
                    f"{icao} {plane.get('callsign') or ''} "
                    f"lat={lat:.6f} lon={lon:.6f}"
                )
            elif rejected_position:
                print(
                    f"{icao} {plane.get('callsign') or ''}: rejected implausible position "
                    f"lat={lat:.6f} lon={lon:.6f}; retaining last valid position"
                )
            else:
                print(f"{icao} {plane.get('callsign') or ''}: decoded message")

    except KeyboardInterrupt:
        print("\nSubscriber stopped.")
    finally:
        subscriber.close()


if __name__ == "__main__":
    main()
