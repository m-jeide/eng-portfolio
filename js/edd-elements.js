(async function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const enabled = !!(window.SPECIALTY_FLAGS && window.SPECIALTY_FLAGS.EDD_ELEMENTS);
  const list = document.getElementById("eddElementList");

  if (!list) return;

  if (!enabled) {
    if (typeof window !== "undefined" && window.location) {
      const base = normalizeBase(window.SITE_BASE || "/");
      window.location.replace(base);
    }
    return;
  }

  try {
    const manifest = await fetchManifest();
    const edd = Array.isArray(manifest.EDD) ? manifest.EDD : [];
    const items = edd
      .filter(it => String(it.type || "").trim().toLowerCase() === "elements")
      .map(it => enrich(it, "EDD"));

    const sorted = items.sort((a, b) => (b._when || 0) - (a._when || 0));
    list.innerHTML = sorted.map(renderRow).join("") || `<div class="muted">No EDD elements yet</div>`;
  } catch (err) {
    list.innerHTML = `<div class="muted">Failed to load EDD elements</div>`;
  }

  async function fetchManifest() {
    const r = await fetch(BASE + "pages/manifest.json", { cache: "no-store" });
    if (!r.ok) throw new Error("manifest.json not found");
    return r.json();
  }

  function enrich(it, cls) {
    const id = it.id;
    const href = BASE + encodeURIComponent(cls) + "/" + id.split("/").map(encodeURIComponent).join("/");
    const parsed = parsePortfolioDate(it.date);
    return {
      ...it,
      cls,
      href,
      _when: parsed ? parsed.getTime() : 0
    };
  }

  function renderRow(it) {
    return `<div class="item">
      <div class="item-left">
        <a class="title" href="${it.href}">${escapeHtml(it.title || it.id)}</a>
        <span class="chips">${chipClass(it.cls)}${chipType(it.type)}</span>
      </div>
      <span class="item-right">${escapeHtml(it.date || "")}</span>
    </div>`;
  }

  function chipClass(cls) { return cls ? `<span class="chip chip-class">${escapeHtml(cls)}</span>` : ""; }
  function chipType(type) { return type ? `<span class="chip chip-type">${escapeHtml(type)}</span>` : ""; }
  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;","&gt;":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function parsePortfolioDate(s) {
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
})();
