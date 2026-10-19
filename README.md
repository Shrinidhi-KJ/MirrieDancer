# Mirrie Dancers

Will we see the northern lights in Scotland tonight?

A single-page site that ranks dark-sky spots across Scotland, from Shetland to Galloway, by tonight's chance of seeing the aurora. It combines:

- **NOAA SWPC** aurora data: the OVATION aurora model, the planetary Kp forecast, and real-time solar wind (Bz and speed)
- **Open-Meteo** hourly cloud cover for every spot
- Darkness (sun position) and each spot's light pollution

"Mirrie Dancers" is the Shetland name for the aurora.

## How it works

`index.html` is the whole app. It fetches the live feeds straight from the visitor's browser. The GitHub Action in `.github/workflows/pages.yml` redeploys the site every 15 minutes with a copy of each feed in `data/`. The page falls back to that copy if a browser can't reach a feed directly.

## Run it locally

Open `index.html` in a browser, or serve the folder with any static server.

Chances are a best guess, not a promise. The sky does what it likes.
