(async function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const list = document.getElementById("certList");

  try {
    const manifest = await fetchManifest();
    const items = (manifest.Certifications || []).map(it => enrich(it, "Certifications"));
    list.innerHTML = items.map(renderRow).join("") || `<div class="muted">No certifications yet</div>`;
  } catch (err) {
    list.innerHTML = `<div class="muted">Failed to load certifications</div>`;
  }

  async function fetchManifest() {
    const r = await fetch(BASE + "pages/manifest.json", { cache: "no-store" });
    if (!r.ok) throw new Error("manifest.json not found");
    return r.json();
  }

  function enrich(it, cls) {
    const id = it.id;
    const href = BASE + encodeURIComponent(cls) + "/" + id.split("/").map(encodeURIComponent).join("/");
    return { ...it, cls, href };
  }

  function renderRow(it) {
    const cls = (it.cls || "").trim();
    const typ = (it.type || "").trim();
    const same = cls && typ && cls.toLowerCase() === typ.toLowerCase();
    const chipsHtml = same ? `${chipClass(cls)}` : `${chipClass(cls)}${chipType(typ)}`;
    return `<div class="item">
      <div class="item-left">
        <a class="title" href="${it.href}">${escapeHtml(it.title)}</a>
        <span class="chips">${chipsHtml}</span>
      </div>
      <span class="item-right">${escapeHtml(it.date || "")}</span>
    </div>`;
  }

  function chipClass(cls) { return cls ? `<span class="chip chip-class">${escapeHtml(cls)}</span>` : ""; }
  function chipType(type) { return type ? `<span class="chip chip-type">${escapeHtml(type)}</span>` : ""; }
  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;","&gt;":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
})();
