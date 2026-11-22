# Local ADS-B Flight Tracker

## Goal

Build a receive-only station around the RTL-SDR Blog V4L that records aircraft positions broadcast on 1090 MHz and presents nearby traffic on a local map. The finished dashboard should show current aircraft, recent 3D trails, aircraft details, and a replay timeline. Or even connect it to a physical display where toy planes will move in the path corresponding to the signal tracking. 

This is also a GNU Radio learning project: start by understanding and adapting existing signal-processing and ADS-B blocks, then add or modify only the pieces your dashboard needs. A command-line decoder such as `readsb` or `dump1090` can provide an independent comparison. GNU Radio Companion (GRC) is optional; it is useful for seeing how blocks connect, while the flowgraph and custom blocks can also be maintained as code.

**Coverage scope:** the first version will show 1090ES aircraft that transmit receivable messages within your antenna's range and line of sight. In the U.S., ADS-B Out can use either 1090ES or 978 MHz UAT; a single receiver tuned to 1090 MHz will not receive UAT traffic. Aircraft that do not transmit ADS-B Out, or whose signal is not receivable at your location, will not appear. The [FAA equipment overview](https://www.faa.gov/air_traffic/technology/equipadsb/installation) describes the two links. Treat 978 MHz UAT support as a later extension, with its own decoder and a second receiver if you want both frequencies monitored at once.

## Data flow

```text
V4L + antenna
  → GNU Radio source and DSP flowgraph
  → existing Mode S / ADS-B decoder blocks
  → optional custom blocks and output adapter
  → timestamped aircraft observations
  → SQLite history and local API
  → 2D live map, then 3D replay
```

The V4L is the Lite variant, with an R828S tuner; the earlier V4 uses an R828D. Do not assume V4-specific driver instructions or specifications apply unchanged. The V4L needs a driver that recognizes its hardware, or it may produce no usable signal. Follow the [V4L user guide](https://www.rtl-sdr.com/V4L/) and verify the installed driver before tuning. Choose the sample rate required by the decoder flowgraph. For example, `gr-adsb` documents 2, 4, and 6 Msps and says the rate must satisfy its symbol-rate constraint; do not carry over a generic 2.4 Msps setting without checking the block documentation.

GNU Radio supplies the stream scheduler, sample sources, and reusable DSP blocks. A practical ADS-B starting point is the community [gr-adsb module](https://github.com/mhostetter/gr-adsb): it provides an example receiver flowgraph and ADS-B/Mode S demodulation and decoding blocks. Its repository documents a branch for GNU Radio 3.10, RTL-SDR support through GNU Radio/OsmoSDR, and sample-rate constraints. Treat it as a candidate to evaluate against your installed GNU Radio and V4L driver, not as a guaranteed plug-and-play dependency. The [GNU Radio Soapy documentation](https://wiki.gnuradio.org/index.php/Soapy) describes the separate SDR driver layer used by some flowgraphs.

GNU Radio blocks are software components, not automatically peer-reviewed research results. Maturity and testing vary, especially for out-of-tree (OOT) modules. Before building on a module, check its supported GNU Radio versions, tests, recent maintenance, issue history, and license; compare its decoded output with an independent receiver. `gr-adsb` is GPL-3.0, which matters if you later distribute a modified version.

## Build in milestones

### 1. Confirm reception with command-line tools

- Connect the supplied antenna, ideally vertically and with a clear view of the sky. Keep the coax run short at 1090 MHz.
- Install a V4L-compatible RTL-SDR driver/library and use `rtl_test -t` to confirm the dongle is seen and samples stream without USB errors.
- Run `readsb` or `dump1090` in its command-line mode as a temporary baseline. Confirm that aircraft messages are arriving and note what is missing in your reception environment.
- Keep everything local. Do not configure an external data feed.

**Learn:** frequency, sampling rate, gain, antenna placement, line of sight, and why reception varies. Avoid adding an LNA or filter until you have a baseline; extra gain can make a strong-signal overload problem worse.

### 2. Define the observation format and dashboard boundary

Choose a small, decoder-independent observation format for valid aircraft positions: receive timestamp, aircraft ID, latitude/longitude, optional altitude/speed/track/vertical rate, and quality/source fields. Use a saved sample or `readsb`'s local JSON as temporary input if that helps scaffold the collector; normalize it into your own format and treat `readsb` as a reference, not a required part of the final pipeline. `readsb` documents its [JSON output](https://github.com/wiedehopf/readsb/blob/dev/README-json.md).

Use SQLite for the first history store. Start with a small Python collector and a simple local API; build a 2D map before adding 3D. Treat each field as optional: many messages do not contain a position, and aircraft can disappear and reappear. Store only valid position observations as path points, rather than repeating stale coordinates every polling interval.

**Learn:** JSON parsing, timestamps, data modeling, SQL, and basic web maps. This milestone separates reception/data-quality problems from UI problems and gives you a useful end-to-end result early.

### 3. Learn the existing GNU Radio ADS-B flowgraph

Start with an existing 1090 MHz ADS-B flowgraph, such as the example supplied by `gr-adsb`. Trace its source, filtering/magnitude, preamble and bit recovery, frame/CRC handling, CPR position decoding, and output blocks. Run it and inspect both successful messages and fields that are absent. When practical, replay a saved or generated sample through the flowgraph so changes are repeatable.

**Learn:** how GNU Radio streams samples between typed blocks, how the ADS-B chain maps to the protocol, and which parameters affect reception and decoding. The [GNU Radio ADS-B receiver example](https://gnuradioworld.com/examples/gr-adsb/adsb-receiver/) can help explain block roles; check the module's own repository for the authoritative compatibility and build details.

### 4. Customize the flowgraph without forking everything

Start with changes that do not require source edits:

- Adjust the flowgraph's source, sample rate, gain, thresholds, and output connections.
- Add a small Embedded Python Block for project-specific formatting or filtering.
- If that code becomes reusable, create an OOT module with `gr_modtool` so your block has its own source, tests, and documentation.
- If you need to change an existing decoder block internally, fork its source repository and keep your changes in version control. Avoid editing files in the installed GNU Radio package directory, since package upgrades can overwrite them.

GRC flowgraphs are saved as `.grc` files and translated into Python. Keep custom logic in a block or OOT module rather than editing generated Python that may be regenerated from the flowgraph. The official [Python OOT tutorial](https://wiki.gnuradio.org/index.php?title=Creating_Python_OOT_with_gr-modtool) shows how to create an editable, reusable block.

**Learn:** block parameters, message/stream boundaries, testing, module structure, and how to make the smallest code change that produces the behavior you want.

### 5. Connect decoded observations to your app

Send the decoder's aircraft updates to your own collector and observation schema. Save one row for each valid position with a receive timestamp, aircraft identifier, available fields, and source/quality information. Preserve missing values and avoid repeating stale coordinates as new positions. Compare output with `readsb` or `dump1090` on the same reception or recording.

**Learn:** timestamps, data quality, output adapters, storage, and how a radio flowgraph connects to a web application. Use short IQ captures for debugging; continuous raw capture can consume storage quickly.

### 6. Add track replay and 3D presentation

Once 2D live positions and stored tracks are reliable, add filters and a timeline. [deck.gl's `TripsLayer`](https://deck.gl/docs/api-reference/geo-layers/trips-layer) animates timestamped paths; [deck.gl's MapLibre guide](https://deck.gl/docs/developer-guide/base-maps/using-with-maplibre) describes the map integration. Use `[longitude, latitude, altitude_meters]` coordinates for the 3D path, converting reported feet to meters for rendering while retaining the original feet in storage. Use relative timestamps for animation. `TripsLayer` stores timestamps as 32-bit floats, so subtract a common time origin rather than passing Unix epoch seconds directly.

Keep altitude units and meaning visible in the UI. ADS-B altitude is commonly reported as barometric altitude in feet; it is not automatically the same as geometric height above local ground. For the first 3D view, use the reported feet value as a clearly labeled visualization height, and avoid presenting it as survey-grade physical geometry. Preserve the reported altitude/source in storage so a later display change does not lose information.

**Learn:** trajectory gaps, coordinate order, altitude units, map projections, WebGL layers, and replay time. Sort points by timestamp and split tracks after long reception gaps; do not draw a straight line across a long period when the aircraft was not observed.

## Suggested first implementation stack

- **Signal processing:** GNU Radio core blocks plus an ADS-B OOT module such as `gr-adsb`, after checking version, V4L driver, tests, maintenance, and license.
- **Customization:** GRC parameters and wiring first; Embedded Python Block for small changes; a Python/C++ OOT module or fork for reusable or deeper changes.
- **Local history:** SQLite, storing one row per valid position observation and retaining units, timestamps, and source/quality fields.
- **API:** a small Python local service when the UI needs live updates or track queries.
- **Dashboard:** the first 2D prototype is plain HTML, CSS, and JavaScript with MapLibre GL JS. It polls the local JSON snapshot, plots current aircraft and received path points, filters physically implausible jumps, and breaks paths across long reception gaps. It shows aircraft details when selected. Keep this as the simple first version; add a history store/API and deck.gl when the 3D replay milestone begins.

This is a starting stack, not a requirement. Keep a documented observation format between GNU Radio's decoder/output and the dashboard, so you can change or extend the flowgraph without rewriting the map.

## First session checklist

1. Install a V4L-compatible command-line RTL-SDR driver. On macOS, check the V4L guide carefully: support depends on the driver bundled or linked by each application, so the generic GNU Radio package may not be sufficient by itself.
2. Check the receiver with `rtl_test -t`.
3. Connect the antenna and run a CLI ADS-B decoder for a few minutes.
4. Record whether it receives frames and positions, plus the rough antenna placement and gain setting.
5. Open the ADS-B flowgraph, trace its blocks, and record which outputs you want to feed into your own collector.

The first concrete project deliverable should be a short note with the OS, V4L driver version, GNU Radio version, ADS-B module/version, sample rate, antenna setup, and a few decoded examples. Use that to choose the first flowgraph customization.


