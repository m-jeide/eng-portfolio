(function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const CLASSES = Array.isArray(window.CLASSES) && window.CLASSES.length ? window.CLASSES : ["DE","CIM","EDD"];

  const q = document.getElementById("q");
  const sel = document.getElementById("cls");
  const resultsPanel = document.getElementById("resultsPanel");
  const resultsList  = document.getElementById("resultsList");
  const recentList   = document.getElementById("recentList");

  // class filter
  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }

  let all = []; // flattened list for search + recent

  boot();

  async function boot() {
    try {
      const manifest = await fetchManifest();
      const groups = Object.entries(manifest).map(([cls, items]) => ({ cls, items: normalizeItems(items) }));

      // flatten + enrich
      all = groups.flatMap(({ cls, items }) => items.map(it => enrich(it, cls)));

      // render recent 5
      renderRecent(all);

      // wire search UX
      wireSearch();
    } catch (err) {
      resultsList.innerHTML = `<div class="muted">Failed to load manifest</div>`;
      recentList.innerHTML  = `<div class="muted">${escapeHtml(String(err))}</div>`;
    }
  }

  async function fetchManifest() {
    const r = await fetch(BASE + "pages/manifest.json", { cache: "no-store" });
    if (!r.ok) throw new Error("manifest.json not found");
    return r.json();
  }

  function normalizeItems(items) {
    return (items || []).map(it => ({
      id: it.id,
      title: it.title || it.id,
      type: it.type || "",
      date: it.date || ""
    }));
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

  // ---------- Recent activity ----------
  function renderRecent(items) {
    const top5 = [...items].sort((a,b) => b._when - a._when).slice(0, 5);
    recentList.innerHTML = top5.map(renderRow).join("") || `<div class="muted">No recent items</div>`;
  }

  // Row renderer with chips
  function renderRow(it) {
    const right = [it.date].filter(Boolean).join("");
    return `<div class="item">
      <div class="item-left">
        <a class="title" href="${it.href}">${escapeHtml(it.title)}</a>
        <span class="chips">
          ${chipClass(it.cls)}
          ${chipType(it.type)}
        </span>
      </div>
      <span class="item-right">${escapeHtml(right)}</span>
    </div>`;
  }

  function chipClass(cls) {
    if (!cls) return "";
    return `<span class="chip chip-class">${escapeHtml(cls)}</span>`;
  }
  function chipType(type) {
    if (!type) return "";
    return `<span class="chip chip-type">${escapeHtml(type)}</span>`;
  }

  // ---------- Search UX with debounce + animated panel ----------
  function wireSearch() {
    let t;
    const run = () => {
      const query = q.value.trim().toLowerCase();
      const cls = sel.value;
      const pool = cls ? all.filter(x => x.cls === cls) : all;
      const matches = query ? pool.filter(x => x._hay.includes(query)) : pool;
      const top = matches.slice(0, 10);
      resultsList.innerHTML = top.map(renderRow).join("") || `<div class="muted">No matches</div>`;

      // open if focused or query present, else close
      const shouldOpen = document.activeElement === q || !!query;
      resultsPanel.classList.toggle("open", shouldOpen);
    };

    const debounced = () => { clearTimeout(t); t = setTimeout(run, 120); };

    q.addEventListener("focus", run);
    q.addEventListener("input", debounced);
    q.addEventListener("blur", () => setTimeout(() => resultsPanel.classList.toggle("open", !!q.value.trim()), 50));
    sel.addEventListener("change", run);

    // start collapsed
    resultsPanel.classList.remove("open");
  }

  // ---------- Helpers ----------
  // Accept "YYYY-MM-DD" or "MM/DD/YY" (zero-padded)
  function parsePortfolioDate(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y,m,d] = s.split("-").map(n => parseInt(n, 10));
      return new Date(y, m - 1, d);
    }
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(s)) {
      const [mm, dd, yy] = s.split("/").map(n => parseInt(n, 10));
      const year = 2000 + yy;
      return new Date(year, mm - 1, dd);
    }
    return null;
  }

  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;","&gt;":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
})();
