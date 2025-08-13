(function () {
  const app = document.getElementById("app");

  const BASE = normalizeBase(window.SITE_BASE || "/");
  const OWNER = window.REPO_OWNER;
  const REPO  = window.REPO_NAME;
  const BR    = window.REPO_BRANCH || "main";
  const CLASSES = Array.isArray(window.CLASSES) ? window.CLASSES : [];

  boot().catch(err => {
    app.innerHTML = card(`<h2>Load error</h2><p class="muted">${escapeHtml(String(err))}</p>`);
  });

  async function boot() {
    const { cls, id } = parseRoute();
    if (!cls || !id) {
      app.innerHTML = card(`<h2>Missing route</h2>
        <p class="muted">Open with <code>${BASE}interpreter.html?class=DE&id=1.1.9%20Soldering%20Desoldering</code>
        or use a pretty URL like <code>${BASE}DE/1.1.9%20Soldering%20Desoldering</code>.</p>`);
      return;
    }

    const jsonUrl = buildJsonUrl(cls, id); // fetch from pages/{CLASS}/{ID}.json
    const page = await fetchJson(jsonUrl);
    render(page, { cls, id });
  }

  // Supports ?class=DE&id=... and pretty URLs /eng-portfolio/DE/<id>
  function parseRoute() {
    const sp = new URLSearchParams(location.search);
    const clsQ = sp.get("class");
    const idQ  = sp.get("id");
    if (clsQ && idQ) return { cls: decodeURIComponent(clsQ), id: decodeURIComponent(idQ) };

    let path = decodeURIComponent(location.pathname);
    if (BASE !== "/" && path.startsWith(BASE)) path = path.slice(BASE.length);
    const parts = path.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2) {
      const cls = parts[0];
      if (CLASSES.length && !CLASSES.includes(cls)) return { cls: null, id: null };
      const id = parts.slice(1).join("/");
      return { cls, id };
    }
    return { cls: null, id: null };
  }

  function buildJsonUrl(cls, id) {
    if (!OWNER || !REPO) throw new Error("Missing REPO_OWNER or REPO_NAME in site.config.js");
    const path = ["pages", cls, `${id}.json`]
      .map(seg => seg.split("/").map(encodeURIComponent).join("/")).join("/");
    return `https://raw.githubusercontent.com/${encodeURIComponent(OWNER)}/${encodeURIComponent(REPO)}/${encodeURIComponent(BR)}/${path}`;
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Page JSON not found at ${url}`);
    return r.json();
  }

  function render(page, ctx) {
    const title = page.title || ctx.id;
    const date  = page.date || "";
    const type  = page.type || "";
    const brief = Array.isArray(page.brief) ? page.brief : [];
    const elements = Array.isArray(page.elements) ? page.elements : [];

    const header = `
      <header class="header">
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          ${date ? `<span>${escapeHtml(date)}</span>` : ""}
          ${type ? `<span class="chip">${escapeHtml(type)}</span>` : ""}
        </div>
      </header>
    `;

    const briefHtml = brief.length
      ? `<section><h2>Brief</h2><div class="card"><ul class="brief">${brief.map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul></div></section>`
      : "";

    const elementsHtml = renderElements(elements, ctx);

    app.innerHTML = header + briefHtml + elementsHtml;
  }

  function renderElements(elements, ctx) {
    if (!elements.length) return "";
    const out = elements.map((el, i) => {
      const t = normalizeType(el.type);
      const renderer = RENDERERS[t] || renderUnknown;
      return renderer(el, ctx, i);
    }).join("");
    return `<section><h2>Elements</h2>${out}</section>`;
  }

  const RENDERERS = {
    synopsis: (el) => {
      const text = el.content || el.text || "";
      return block("Synopsis", `<div class="card">${richText(text)}</div>`);
    },
    designbrief: (el) => {
      if (Array.isArray(el.items)) {
        const tiles = el.items.map((txt, i) => tile(`Brief ${i+1}`, `<div class="tile-body">${richText(txt)}</div>`)).join("");
        return lane("Design Brief", tiles);
      }
      return block("Design Brief", `<div class="card">${richText(el.content || "")}</div>`);
    },
    notes: (el) => {
      return block(el.label || "Notes", `<div class="card">${richText(el.content || "")}</div>`);
    },
    pdf: (el) => {
      const items = normalizeItems(el);
      const tiles = items.map(it => {
        const src = absolutize(it.src);
        const label = escapeHtml(it.label || "PDF");
        const iframe = `<iframe class="pdf-frame" src="${src}#toolbar=0"></iframe>`;
        const dl = `<a class="btn" href="${src}" download>Download</a>`;
        return tile(label, `<div class="tile-body">${dl}</div>`, iframe);
      }).join("");
      return lane(el.label || "PDF", tiles);
    },
    video: (el) => {
      const items = normalizeItems(el);
      const tiles = items.map(it => {
        const embed = toVideoEmbed(it.src);
        const label = escapeHtml(it.label || "Video");
        return tile(label, `<div class="tile-body"></div>`, embed);
      }).join("");
      return lane(el.label || "Video", tiles);
    }
  };

  function block(title, innerHtml) {
    return `<div class="section"><h3>${escapeHtml(title)}</h3>${innerHtml}</div>`;
  }
  function lane(title, tilesHtml) {
    return `<div class="section"><h3>${escapeHtml(title)}</h3><div class="lane">${tilesHtml}</div></div>`;
  }
  function tile(head, bodyHtml, mediaHtml = "") {
    return `<div class="tile" tabindex="0">
      <div class="tile-head">${escapeHtml(head)}</div>
      ${mediaHtml || ""}
      ${bodyHtml}
    </div>`;
  }
  function renderUnknown(el) {
    const t = escapeHtml(el.type || "unknown");
    const pretty = escapeHtml(JSON.stringify(el, null, 2));
    return block(`Unknown element: ${t}`, `<div class="card"><pre>${pretty}</pre></div>`);
  }

  // helpers
  function normalizeItems(el) {
    if (Array.isArray(el.items)) return el.items;
    if (el.src) return [{ src: el.src, label: el.label }];
    return [];
  }
  function normalizeType(t) { return String(t || "").toLowerCase().replace(/\s+/g, ""); }
  function absolutize(p) { return /^https?:\/\//i.test(p) ? p : BASE + p.replace(/^\/+/, ""); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function richText(s) {
    const esc = escapeHtml(String(s));
    const linked = esc.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" class="btn">$1</a>');
    return linked.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
  function card(inner) { return `<div class="card" style="padding:14px;border-radius:14px">${inner}</div>`; }
  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
})();
