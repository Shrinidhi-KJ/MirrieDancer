// Saves a copy of each live feed next to the site, so the page still works
// if a visitor's browser can't reach NOAA or Open-Meteo directly.
// Usage: node scripts/snapshot.mjs <out-dir> [problems-file]   (or: --self-test)
// A feed that fetches fine but no longer looks the way index.html parses it is not saved;
// it is listed in problems-file (if given) so the workflow can fail after deploying.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

// Minimal shape checks, matching what index.html reads from each feed.
const num = (x) => isFinite(parseFloat(x));
const first = (j) => (Array.isArray(j) ? j[0] : j);
const cloud = (n) => (j) => {
  const a = Array.isArray(j) ? j : [j]; // one location comes back as an object, several as an array
  return a.length === n && a.every((e) => Array.isArray(e?.hourly?.time) && e.hourly.time.length > 0 && Array.isArray(e.hourly.cloud_cover));
};
const checks = {
  kp: (j) => { // array of objects, or the older array of arrays with a header row
    if (!Array.isArray(j)) return false;
    if (!Array.isArray(j[0])) return j.some((r) => r?.time_tag && num(r.kp));
    const [ti, ki] = [j[0].indexOf("time_tag"), j[0].indexOf("kp")];
    return j.slice(1).some((r) => r[ti] && num(r[ki]));
  },
  mag: (j) => num(first(j)?.bz_gsm ?? first(j)?.Bz),
  wind: (j) => num(first(j)?.proton_speed ?? first(j)?.WindSpeed),
  ov: (j) => Array.isArray(j?.coordinates) && j.coordinates.length > 0,
};

if (process.argv[2] === "--self-test") {
  const hourly = { hourly: { time: ["2026-01-01T00:00"], cloud_cover: [10] } };
  assert(checks.kp([{ time_tag: "2026-01-01T00:00:00", kp: "3.00" }]));
  assert(checks.kp([["time_tag", "kp"], ["2026-01-01 00:00:00", "3"]]));
  assert(!checks.kp([["time_tag", "kp"]]) && !checks.kp({ time_tag: 1, kp: 1 }) && !checks.kp([{ time: 1, kp: 1 }]));
  assert(checks.mag([{ bz_gsm: "-2.1" }]) && checks.mag({ Bz: -2 }) && !checks.mag([{ bz: 1 }]) && !checks.mag([]));
  assert(checks.wind({ WindSpeed: "400" }) && checks.wind([{ proton_speed: 400 }]) && !checks.wind([{ speed: 1 }]));
  assert(checks.ov({ coordinates: [[1, 2, 3]] }) && !checks.ov({ coordinates: [] }) && !checks.ov({}));
  assert(cloud(1)(hourly) && cloud(2)([hourly, hourly]));
  assert(!cloud(2)(hourly) && !cloud(1)([{ hourly: { time: [] } }]) && !cloud(1)([{}]) && !cloud(1)({ hourly: { time: [], cloud_cover: [] } }));
  console.log("self-test ok");
  process.exit(0);
}

const out = process.argv[2] || "_site/data";
fs.mkdirSync(out, { recursive: true });

// Read spot coordinates from the page so the cloud forecasts always match it.
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
function coordsOf(name) {
  const start = html.indexOf("const " + name + " = [");
  const block = html.slice(start, html.indexOf("];", start));
  const cs = [...block.matchAll(/lat: (-?[\d.]+), lon: (-?[\d.]+)/g)].map((m) => [m[1], m[2]]);
  // A spot in another format would shift every later cloud forecast onto the wrong spot.
  const ids = (block.match(/\bid: "/g) || []).length;
  if (!ids || ids !== cs.length) throw new Error(name + ": " + cs.length + " coordinates for " + ids + " spots in index.html");
  return cs;
}
const cloudUrl = (cs) => "https://api.open-meteo.com/v1/forecast?latitude=" + cs.map((c) => c[0]).join(",") +
  "&longitude=" + cs.map((c) => c[1]).join(",") + "&hourly=cloud_cover&past_days=1&forecast_days=2&timezone=GMT";
let coords = [], worldCoords = [];
const problems = [];
try { coords = coordsOf("SPOTS"); worldCoords = coordsOf("WORLD_SPOTS"); } catch (e) { problems.push(e.message); } // still deploy, without the cloud feeds

const feeds = {
  kp: "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
  mag: "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
  wind: "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
  ov: "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json",
  ...(problems.length ? {} : { wx: cloudUrl(coords), wwx: cloudUrl(worldCoords) }),
};
checks.wx = cloud(coords.length);
checks.wwx = cloud(worldCoords.length);

// Keep only the part of the aurora model the map uses (around Scotland), which cuts ~1 MB to a few KB.
function trimOvation(j) {
  const keep = (c) => (c[0] >= 340 || c[0] <= 10) && c[1] >= 48 && c[1] <= 75;
  return { "Observation Time": j?.["Observation Time"], "Forecast Time": j?.["Forecast Time"], coordinates: (j?.coordinates || []).filter(keep) };
}

let failed = 0;
for (const [key, url] of Object.entries(feeds)) {
  let j;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "mirrie-dancers (GitHub Pages snapshot)" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    j = await r.json();
  } catch (e) {
    failed++;
    console.warn("skipped", key, e.message);
    continue;
  }
  if (key === "ov") j = trimOvation(j);
  if (!checks[key](j)) {
    problems.push(key + ": unexpected format, not saved");
    console.error("shape problem", key);
    continue;
  }
  fs.writeFileSync(path.join(out, key + ".json"), JSON.stringify(j));
  console.log("saved", key);
}
console.log(failed || problems.length ? failed + " feed(s) skipped, " + problems.length + " format problem(s)" : "all feeds saved");
if (problems.length && process.argv[3]) fs.writeFileSync(process.argv[3], problems.join("\n") + "\n");
