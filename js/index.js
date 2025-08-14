(function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const CLASSES = Array.isArray(window.CLASSES) && window.CLASSES.length ? window.CLASSES : ["DE","CIM","EDD"];
  const OWNER = window.REPO_OWNER;
  const REPO  = window.REPO_NAME;
  const BR    = window.REPO_BRANCH || "main";

  const q = document.getElementById("q");
  const sel = document.getElementById("cls");
  const resultsPanel = document.getElementById("resultsPanel");
  const resultsList  = document.getElementById("resultsList");
  const recentList   = document.getElementById("recentList");

  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }

  let all = []; // flattened list of items across classes

  boot();

  async function boot() {
    const data = await fetchData();
    // flatten and enrich
    all = data.flatMap(({ cls, items }) => items.map(it => enrich(it, cls)));
    // recent 5
    renderRecent(all);
    // search behavior
    wireSearch();
  }

  function enrich(it, cls) {
    const id = it.id;
    const href = BASE + encodeURIComponent(cls || "") + "/" + id.split("/").map(encodeURIComponent).join("/");
    const parsed = parsePortfolioDate(it.date);
    return {
      cls,
      id,
      title: it.title || id,
      type: it.type || "",
      date: it.date || "",
      href,
      _when: parsed ? parsed.getTime() : 0,
      _hay: [it.title || id, it.type || "", it.date || "", cls].join(" ").toLowerCase()
    };
  }

  async function fetchData() {
    // Manifest fallback kept, but most likely you are using GitHub API
    const manifest = await tryFetchJson(BASE + "pages/manifest.json");
    if (manifest) {
      const groups = Object.entries(manifest).map(([cls, items]) => ({ cls, items: normalizeItems(items, cls) }));
      groups.forEach(g => g.items.sort(sortByDateDescThenTitle));
      return groups;
    }

    if (!OWNER || !REPO) throw new Error("Missing REPO_OWNER or REPO_NAME in site.config.js");

    const out = [];
    for (const cls of CLASSES) {
      const files = await listJsonFiles(`pages/${cls}`);
      const items = [];
      for (const f of files) {
        const meta = await fetchPageMeta(`pages/${cls}/${f.name}`);
        if (meta) items.push(meta);
      }
      items.sort(sortByDateDescThenTitle);
      out.push({ cls, items });
    }
    return out;
  }

  async function listJsonFiles(dir) {
    const url = `https://api.github.com/repos/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/contents/${dir.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(BR)}`;
    const res = await fetch(url, { headers: { "Accept": "application/vnd.github+json" } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.filter(x => x.type === "file" && /\.json$/i.test(x.name));
  }

  async function fetchPageMeta(path) {
    const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/${encodeURIComponent(BR)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(rawUrl);
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    const id = path.replace(/^pages\/[^/]+\//, "").replace(/\.json$/i, "");
    return {
      id,
      title: json.title || id,
      type: json.type || "",
      date: json.date || ""
    };
  }

  // ---------- Recent activity ----------
  function renderRecent(items) {
    const top5 = [...items].sort((a,b) => b._when - a._when).slice(0, 5);
    recentList.innerHTML = top5.map(renderRow).join("") || `<div class="muted">No recent items</div>`;
  }

  function renderRow(it) {
    const right = [it.date, it.type].filter(Boolean).join(" · ");
    return `<div class="item">
      <a href="${it.href}">${escapeHtml(it.title)}</a>
      <span class="muted">${escapeHtml(right)}</span>
    </div>`;
  }

  // ---------- Search UX ----------
  function wireSearch() {
    let t;
    const run = () => {
      const query = q.value.trim().toLowerCase();
      const cls = sel.value;
      const pool = cls ? all.filter(x => x.cls === cls) : all;
      const matches = query ? pool.filter(x => x._hay.includes(query)) : pool;
      const top = matches.slice(0, 10);
      resultsList.innerHTML = top.map(renderRow).join("") || `<div class="muted">No matches</div>`;
      // show panel if focused or query present
      toggle(resultsPanel, document.activeElement === q || !!query);
    };

    const debounced = () => { clearTimeout(t); t = setTimeout(run, 120); };

    q.addEventListener("focus", run);
    q.addEventListener("input", debounced);
    q.addEventListener("blur", () => setTimeout(() => toggle(resultsPanel, !!q.value.trim()), 50));
    sel.addEventListener("change", run);
  }

  function toggle(el, show) { el.classList.toggle("hidden", !show); }

  // ---------- Helpers ----------
  async function tryFetchJson(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function normalizeItems(items, cls) {
    return items.map(it => ({
      ...it,
      id: it.id,
      title: it.title || it.id,
      type: it.type || "",
      date: it.date || ""
    }));
  }

  // Accept "YYYY-MM-DD" or "MM/DD/YY" where all parts are zero-padded
  function parsePortfolioDate(s) {
    if (!s) return null;
    // ISO like 2025-08-12
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(n => parseInt(n, 10));
      return new Date(y, m - 1, d);
    }
    // MM/DD/YY like 08/09/25
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) {
      const [mm, dd, yy] = s.split("/").map(n => parseInt(n, 10));
      const year = 2000 + yy; // 25 -> 2025
      return new Date(year, mm - 1, dd);
    }
    return null;
  }

  function sortByDateDescThenTitle(a, b) {
    const A = parsePortfolioDate(a.date); const B = parsePortfolioDate(b.date);
    const d = (B ? B.getTime() : 0) - (A ? A.getTime() : 0);
    if (d !== 0) return d;
    return String(a.title).localeCompare(String(b.title));
  }

  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
})();
