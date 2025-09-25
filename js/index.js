(function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const CLASSES = Array.isArray(window.CLASSES) && window.CLASSES.length ? window.CLASSES : ["DE","CIM","EDD"];

  const q = document.getElementById("q");
  const sel = document.getElementById("cls");
  const typ = document.getElementById("typ");
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
      // initialize counts + type options
      updateClassOptionCounts();
      if (typeof updateTypeOptions === "function") updateTypeOptions("");
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
    const cls = (it.cls || "").trim();
    const typ = (it.type || "").trim();
    const same = cls && typ && cls.toLowerCase() === typ.toLowerCase();
    const chipsHtml = same
      ? `${chipClass(cls)}`
      : `${chipClass(cls)}${chipType(typ)}`;
    return `<div class="item">
      <div class="item-left">
        <a class="title" href="${it.href}">${escapeHtml(it.title)}</a>
        <span class="chips">${chipsHtml}</span>
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
      const type = typ ? typ.value : "";
      let pool = cls ? all.filter(x => x.cls === cls) : all;
      if (cls && type) {
        pool = pool.filter(x => String(x.type) === String(type));
      }
      // If there's a query, filter by haystack; otherwise, show most recent first
      const matches = query
        ? pool.filter(x => x._hay.includes(query))
        : [...pool].sort((a, b) => b._when - a._when);
      const top = matches.slice(0, 10);
      resultsList.innerHTML = top.map(renderRow).join("") || `<div class="muted">No matches</div>`;

      // open if focused, query present, or a class/type is selected
      const shouldOpen = document.activeElement === q || !!query || !!cls || (!!cls && !!type);
      resultsPanel.classList.toggle("open", shouldOpen);
    };

    const debounced = () => { clearTimeout(t); t = setTimeout(run, 120); };

    q.addEventListener("focus", run);
    q.addEventListener("input", debounced);
    q.addEventListener("blur", () => setTimeout(() => {
      const hasQuery = !!q.value.trim();
      const hasClass = !!sel.value;
      const hasType = typ ? !!typ.value : false;
      resultsPanel.classList.toggle("open", hasQuery || hasClass || (hasClass && hasType));
    }, 50));
    sel.addEventListener("change", () => {
      updateTypeOptions(sel.value);
      run();
    });
    if (typ) typ.addEventListener("change", run);

    // start collapsed
    resultsPanel.classList.remove("open");
  }

  // Add counts to Class dropdown labels
  function updateClassOptionCounts() {
    if (!sel) return;
    const total = all.length;
    // Base option: All classes (N)
    if (sel.options && sel.options.length > 0) {
      const baseOpt = sel.options[0];
      if (baseOpt && baseOpt.value === "") baseOpt.textContent = `All classes (${total})`;
    }
    // Per-class counts
    const byClass = new Map();
    for (const it of all) byClass.set(it.cls, (byClass.get(it.cls) || 0) + 1);
    for (let i = 0; i < sel.options.length; i++) {
      const opt = sel.options[i];
      if (!opt.value) continue; // skip base
      const c = byClass.get(opt.value) || 0;
      opt.textContent = `${opt.value} (${c})`;
    }
  }

  // Populate assignment-type options based on selected class
  function updateTypeOptions(cls) {
    if (!typ) return;
    // Reset current options
    while (typ.firstChild) typ.removeChild(typ.firstChild);
    // Always include an "All types" option with count when class selected
    const base = document.createElement("option");
    base.value = "";
    const totalInClass = cls ? all.filter(x => x.cls === cls).length : 0;
    base.textContent = cls ? `All types (${totalInClass})` : "All types";
    typ.appendChild(base);

    // Disable if no class selected
    if (!cls) {
      typ.disabled = true;
      typ.value = "";
      return;
    }

    // Build type counts for this class
    const counts = new Map();
    for (const it of all) {
      if (it.cls !== cls) continue;
      const key = (it.type || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    // Add options for types with count > 0, sorted alpha
    const types = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    for (const t of types) {
      const opt = document.createElement("option");
      opt.value = t;
      const n = counts.get(t) || 0;
      opt.textContent = `${t} (${n})`;
      typ.appendChild(opt);
    }

    typ.disabled = types.length === 0;
    typ.value = "";
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

document.addEventListener("DOMContentLoaded", () => {
  const resumeLink = document.getElementById("resumeLink");
  if (resumeLink && window.RESUME_URL) {
    resumeLink.href = window.RESUME_URL;
  }

  const specialty = window.SPECIALTY_FLAGS || {};
  const eddSection = document.getElementById("eddElementsSection");
  const eddLink = document.getElementById("eddElementsLink");
  if (specialty && specialty.EDD_ELEMENTS) {
    if (eddSection) eddSection.hidden = false;
    if (eddLink && window.SITE_BASE) {
      const base = String(window.SITE_BASE || "/");
      eddLink.href = (base.endsWith("/") ? base : `${base}/`) + "edd-elements.html";
    }
  } else if (eddSection) {
    eddSection.remove();
  }
});
