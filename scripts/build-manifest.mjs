import { promises as fs } from "node:fs";
import path from "node:path";

const PAGES_DIR = "pages";

// Parse dates like "2025-08-12" or "08/09/25"
function parseDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(n => parseInt(n, 10));
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) {
    const [mm, dd, yy] = s.split("/").map(n => parseInt(n, 10));
    const year = 2000 + yy;
    return new Date(year, mm - 1, dd);
  }
  return null;
}

// Read JSON safely
async function readJsonSafe(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function build() {
  const out = {};
  let classes = [];
  try {
    classes = await fs.readdir(PAGES_DIR, { withFileTypes: true });
    classes = classes.filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    // no pages dir, write empty manifest
    await fs.mkdir(PAGES_DIR, { recursive: true });
    await fs.writeFile(path.join(PAGES_DIR, "manifest.json"), JSON.stringify({}, null, 2));
    console.log("No pages directory found. Wrote empty manifest.");
    return;
  }

  for (const cls of classes) {
    const dir = path.join(PAGES_DIR, cls);
    let files = [];
    try {
      files = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    const items = [];
    for (const f of files) {
      if (!f.isFile() || !/\.json$/i.test(f.name)) continue;
      const id = f.name.replace(/\.json$/i, "");
      const data = await readJsonSafe(path.join(dir, f.name)) || {};
      const rec = {
        id,
        title: data.title || id,
        type: data.type || "",
        date: data.date || ""
      };
      // attach a sortable number
      const dt = parseDate(rec.date);
      rec._t = dt ? dt.getTime() : 0;
      items.push(rec);
    }

    // newest first
    items.sort((a, b) => {
      if (b._t !== a._t) return b._t - a._t;
      return String(a.title).localeCompare(String(b.title));
    });
    // strip helper
    items.forEach(it => { delete it._t; });

    out[cls] = items;
  }

  const dest = path.join(PAGES_DIR, "manifest.json");
  await fs.writeFile(dest, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${dest}`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
