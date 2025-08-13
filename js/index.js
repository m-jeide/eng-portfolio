(function () {
  const BASE = normalizeBase(window.SITE_BASE || "/");
  const CLASSES = Array.isArray(window.CLASSES) && window.CLASSES.length ? window.CLASSES : ["DE","CIM","EDD"];
  const OWNER = window.REPO_OWNER;
  const REPO  = window.REPO_NAME;
  const BR    = window.REPO_BRANCH || "main";

  const elClasses = document.getElementById("classes");
  const q = document.getElementById("q");
  const sel = document.getElementById("cls");

  // populate class filter
  for (const c of CLASSES) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  }

  boot();

  async function boot() {
    try {
      // try local manifest first
      const manifest = await tryFetchJson(BASE + "pages/manifest.json");
      let data;
      if (manifest) {
        data = Object.entries(manifest).map(([cls, items]) => ({ cls, items: normalizeItems(items, cls) }));
      } else {
        data = await fetchByGitHubAPI();
      }
      data.forEach(group => group.items.sort(sortByDateDescThenTitle));
      render(data);

      q.addEventListener("input", () => render(data));
      sel.addEventListener("change", () => render(data));
    } catch (err) {
      elClasses.innerHTML = card(`
        <h2>Load error</h2>
        <p class="muted">${escapeHtml(String(err))}</p>
        <p class="muted">Check site.config.js and that your repo is public.</p>
      `);
    }
  }

  async function fetchByGitHubAPI() {
    if (!OWNER || !REPO) throw new Error("Missing REPO_OWNER or REPO_NAME in site.config.js");
    const out = [];
    for (const cls of CLASSES) {
      const files = await listJsonFiles(`pages/${cls}`);
      const items = [];
      for (const f of files) {
        const meta = await fetchPageMeta(`pages/${cls}/${f.name}`);
        if (meta) items.push(meta);
      }
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
      date: json.date || "",
      cls: path.split("/")[1]
    };
  }

  function render(groups) {
    const query = q.value.trim().toLowerCase();
    const classFilter = sel.value;

    const filtered = groups
      .map(({ cls, items }) => ({
        cls,
        items: items.filter(it => {
          const effectiveCls = it.cls || cls;
          if (classFilter && effectiveCls !== classFilter) return false;
          if (!query) return true;
          const hay = [it.title, it.id, it.type].join(" ").toLowerCase();
          return hay.includes(query);
        })
      }))
      .filter(g => !classFilter ? true : g.cls === classFilter);

    elClasses.innerHTML = filtered.map(({ cls, items }) => `
      <div class="class-card card">
        <h2>${escapeHtml(cls)}</h2>
        <div class="list">
          ${items.length ? items.map(it => row({ ...it, cls })).join("") : `<div class="empty">No pages yet</div>`}
        </div>
      </div>
    `).join("");
  }

  function row(it) {
    const href = BASE + encodeURIComponent(it.cls || "") + "/" + it.id.split("/").map(encodeURIComponent).join("/");
    const metaBits = [it.date || "", it.type || ""].filter(Boolean).join(" · ");
    return `<div class="item">
      <a href="${href}">${escapeHtml(it.title || it.id)}</a>
      <span class="muted">${escapeHtml(metaBits)}</span>
    </div>`;
  }

  // helpers

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
      cls: it.cls || cls,
      id: it.id,
      title: it.title || it.id,
      type: it.type || "",
      date: it.date || "",
    }));
  }

  function sortByDateDescThenTitle(a, b) {
    const d = String(b.date).localeCompare(String(a.date));
    if (d !== 0) return d;
    return String(a.title).localeCompare(String(b.title));
  }

  function card(inner) {
    return `<div class="card" style="padding:14px;border-radius:14px">${inner}</div>`;
  }

  function normalizeBase(b) {
    if (!b) return "/";
    return b.endsWith("/") ? b : b + "/";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
})();
