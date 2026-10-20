// Saves a copy of each live feed next to the site, so the page still works
// if a visitor's browser can't reach NOAA or Open-Meteo directly.
// Usage: node scripts/snapshot.mjs <out-dir>
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] || "_site/data";
fs.mkdirSync(out, { recursive: true });

// Read spot coordinates from the page so the cloud forecasts always match it.
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
function coordsOf(name) {
  const start = html.indexOf("const " + name + " = [");
  const block = html.slice(start, html.indexOf("];", start));
  return [...block.matchAll(/lat: (-?[\d.]+), lon: (-?[\d.]+)/g)].map((m) => [m[1], m[2]]);
}
const cloudUrl = (cs) => "https://api.open-meteo.com/v1/forecast?latitude=" + cs.map((c) => c[0]).join(",") +
  "&longitude=" + cs.map((c) => c[1]).join(",") + "&hourly=cloud_cover&past_days=1&forecast_days=2&timezone=GMT";
const coords = coordsOf("SPOTS"), worldCoords = coordsOf("WORLD_SPOTS");

const feeds = {
  kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
  mag: "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
  wind: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
  ov: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
  wx: cloudUrl(coords),
  wwx: cloudUrl(worldCoords),
};

// Keep only the part of the aurora model the map uses (around Scotland), which cuts ~1 MB to a few KB.
function trimOvation(j) {
  const keep = (c) => (c[0] >= 340 || c[0] <= 10) && c[1] >= 48 && c[1] <= 75;
  return { "Observation Time": j["Observation Time"], "Forecast Time": j["Forecast Time"], coordinates: j.coordinates.filter(keep) };
}

let failed = 0;
for (const [key, url] of Object.entries(feeds)) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "mirrie-dancers (GitHub Pages snapshot)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    let j = await r.json();
    if (key === "ov") j = trimOvation(j);
    fs.writeFileSync(path.join(out, key + ".json"), JSON.stringify(j));
    console.log("saved", key);
  } catch (e) {
    failed++;
    console.warn("skipped", key, e.message);
  }
}
console.log(failed ? failed + " feed(s) skipped" : "all feeds saved");
