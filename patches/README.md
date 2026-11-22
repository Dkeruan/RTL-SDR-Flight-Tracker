# Local `gr-adsb` decoder patch

`gr-adsb-coordinate-guard.patch` records the coordinate validation correction used by this receiver. It targets the `decoder.py` module in `gr-adsb`'s GNU Radio 3.10 package. It is not a GNU Radio core change and may need adjustment for other package versions.

To apply it to an installed Radioconda package, stop the receiver and run this from the project folder:

```sh
patch -p1 --input=patches/gr-adsb-coordinate-guard.patch \
  "$HOME/radioconda/lib/python3.12/site-packages/gnuradio/adsb/decoder.py"
```

The patch keeps the original coordinate sanity check while accepting the first valid fix, checking latitude and longitude separately, handling longitude wraparound, and rejecting non-finite or out-of-range coordinates.
