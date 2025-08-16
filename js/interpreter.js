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

    const jsonUrl = buildJsonUrl(cls, id);
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

  // Pull JSON from pages/{CLASS}/{ID}.json in your repo
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

    // Header: title, chips (class first, then type), then date
    const chips = [
      ctx.cls ? `<span class="chip chip-class">${escapeHtml(ctx.cls)}</span>` : "",
      type ? `<span class="chip chip-type">${escapeHtml(type)}</span>` : ""
    ].join("");
    const header = `
      <header class="page-header">
        <h1 class="page-title">${escapeHtml(title)}</h1>
        <div class="page-tags">${chips}</div>
        ${date ? `<div class="page-date">${escapeHtml(date)}</div>` : ""}
      </header>
    `;

    // Abstract (brief) — label changes only in UI
    const abstractHtml = brief.length
      ? `<section class="abstract element">
           <h2 class="element-title">Abstract</h2>
           <div class="card"><ul class="brief">${brief.map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul></div>
         </section>`
      : "";

    // Elements — no global "Elements" header, each element gets a larger title
    const elementsHtml = renderElements(elements, ctx, page);

    app.innerHTML = header + abstractHtml + elementsHtml;
  }

  function renderElements(elements, ctx, page) {
    if (!elements.length) return "";
    return elements.map((el, i) => {
      const t = normalizeType(el.type);
      const renderer = RENDERERS[t] || renderUnknown;
      return renderer(el, ctx, i, page);
    }).join("");
  }

  const RENDERERS = {
    synopsis: (el) => {
      const text = el.content || el.text || "";
      return section("Synopsis", `<div class="card">${richText(text)}</div>`);
    },
    designbrief: (el) => {
      if (Array.isArray(el.items)) {
        const blocks = el.items.map((txt, i) =>
          `<div class="card" style="margin-top:10px">${richText(txt)}</div>`).join("");
        return section("Design Brief", blocks);
      }
      return section("Design Brief", `<div class="card">${richText(el.content || "")}</div>`);
    },
    notes: (el) => {
      return section(el.label || "Notes", `<div class="card">${richText(el.content || "")}</div>`);
    },
    pdf: (el, ctx, _i, page) => {
      const items = normalizeItems(el);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const label = escapeHtml(it.label || "PDF");
        const iframe = `<iframe class="pdf-frame" src="${src}#toolbar=0"></iframe>`;
        const actions = `<div class="media-actions"><a class="btn" href="${src}" download>Download</a></div>`;
        return `<figure class="media">
                  <div class="media-center">${iframe}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                  ${actions}
                </figure>`;
      }).join("");
      return section(el.label || "PDF", content, true);
    },
    video: (el, ctx, _i, page) => {
      const items = normalizeItems(el);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const embed = toVideoEmbed(src);
        const label = escapeHtml(it.label || "Video");
        return `<figure class="media">
                  <div class="media-center">${embed}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                </figure>`;
      }).join("");
      return section(el.label || "Video", content, true);
    },
    image: (el, ctx, _i, page) => {
      const items = normalizeItems(el);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const label = escapeHtml(it.label || "Image");
        const alt = escapeHtml(it.alt || it.label || page.title || "");
        const img = `<img class="image-frame" src="${src}" alt="${alt}" loading="lazy">`;
        return `<figure class="media">
                  <div class="media-center">${img}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                </figure>`;
      }).join("");
      return section(el.label || "Image", content, true);
    },
    images: (el, ctx, i, page) => RENDERERS.image(el, ctx, i, page) // alias
  };

  // Section helpers
  function section(title, innerHtml) {
    return `<section class="element">
      <h2 class="element-title">${escapeHtml(title)}</h2>
      ${innerHtml}
    </section>`;
  }

  function renderUnknown(el) {
    const t = escapeHtml(el.type || "unknown");
    const pretty = escapeHtml(JSON.stringify(el, null, 2));
    return section(`Unknown element: ${t}`, `<div class="card"><pre>${pretty}</pre></div>`);
  }

  // ---------- helpers ----------

  function normalizeItems(el) {
    if (Array.isArray(el.items)) return el.items;
    if (el.src) return [{ src: el.src, label: el.label }];
    return [];
  }

  function normalizeType(t) {
    return String(t || "").toLowerCase().replace(/\s+/g, "");
  }

  function isHttp(url) {
    return /^https?:\/\//i.test(url || "");
  }

  // Replace {title}, {class}, {type}
  function expandTemplatePath(p, page, ctx) {
    return String(p || "")
      .replace(/\{title\}/g, page.title || ctx.id || "")
      .replace(/\{class\}/g, ctx.cls || "")
      .replace(/\{type\}/g, page.type || "");
  }

  // Encode each path segment so spaces and symbols are safe
  function encodeLocalPath(p) {
    return String(p || "")
      .split("/")
      .map(seg => seg === "" ? "" : encodeURIComponent(seg))
      .join("/");
  }

  // Build a project-scoped URL for local resources
  function makeSrc(p, page, ctx) {
    const expanded = expandTemplatePath(p, page, ctx).replace(/^\/+/, "");
    if (isHttp(expanded)) return expanded; // absolute URL passthrough
    return BASE + encodeLocalPath(expanded);
  }

  function toVideoEmbed(src) {
    const url = String(src || "");
    // YouTube
    if (/youtu\.be|youtube\.com/.test(url)) {
      const idMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      const id = idMatch ? idMatch[1] : null;
      const embed = id ? "https://www.youtube.com/embed/" + id : url;
      return `<iframe class="video-frame" src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    // Direct video files
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
      return `<video class="video-frame" controls src="${url}"></video>`;
    }
    // Fallback generic iframe
    return `<iframe class="video-frame" src="${url}"></iframe>`;
  }

  function card(inner) { return `<div class="card" style="padding:14px;border-radius:14px">${inner}</div>`; }
  function normalizeBase(b) { return b && !b.endsWith("/") ? b + "/" : (b || "/"); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;","&gt;":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
  function richText(s) {
    const esc = escapeHtml(String(s));
    const linked = esc.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" class="btn">$1</a>');
    return linked.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
})();
