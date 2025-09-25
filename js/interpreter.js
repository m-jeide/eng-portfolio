(function () {
  const app = document.getElementById("app");
  const IS_BETA = !!window.IS_BETA;

  const BASE = normalizeBase(window.SITE_BASE || "/");
  const OWNER = window.REPO_OWNER;
  const REPO  = window.REPO_NAME;
  const BR    = window.REPO_BRANCH || "main";
  const CLASSES = Array.isArray(window.CLASSES) ? window.CLASSES : [];

  // Tweak this if you want bigger or smaller PDF text later
  const PDF_ZOOM = "100"; // percent. Alternatives that often work: "page-width", "175"

  let sectionCollector = null;
  const fallbackSectionState = { counts: Object.create(null), list: null };

  app.addEventListener('click', handleLocalAnchorClick);

  boot().catch(err => {
    app.innerHTML = `<div class="error-screen"><h2>Load error</h2><p class="muted">${escapeHtml(String(err))}</p></div>`;
  });

  // Re-trigger animations when returning via back/forward cache
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      animateIn();
    }
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
    beginPreload(page, { cls, id });
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
    // helpers scoped to render
    function stripExt(s) { return String(s).replace(/\.[^.]+$/, ""); }
    function tpl(str, vars) {
      return String(str).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
    }

    // derive identifiers from ctx and URL
    const fromCtx   = ctx && ctx.id ? String(ctx.id) : "";
    const pathClean = decodeURIComponent(location.pathname.replace(/\/+$/, ""));
    const urlTail   = pathClean.split("/").pop() || "";
    const idStr     = fromCtx || urlTail;

    const fileBase  = stripExt((idStr.split("/").pop() || ""));
    const parentDir = decodeURIComponent(pathClean.split("/").slice(-2, -1)[0] || "");

    // fields from page JSON
    const rawTitle = page.title || page.name || ctx.id || fileBase;
    const date     = page.date || "";
    const type     = page.type || "";
    const brief    = Array.isArray(page.brief) ? page.brief : [];
    const elements = Array.isArray(page.elements) ? page.elements : [];

    // allow {file}, {class}, {id} in titles
    const title = tpl(rawTitle, { file: fileBase, class: parentDir, id: idStr });

    // set browser tab title
    document.title = `${title} · Matthew's Engineering Portfolio`;

    // chips (merge duplicate tag values, case-insensitive)
    const hasClass = !!ctx.cls;
    const hasType  = !!type;
    const sameTag  = hasClass && hasType && String(ctx.cls).trim().toLowerCase() === String(type).trim().toLowerCase();
    const chips = [
      hasClass ? `<span class="chip chip-class">${escapeHtml(ctx.cls)}</span>` : "",
      hasType && !sameTag ? `<span class="chip chip-type">${escapeHtml(type)}</span>` : ""
    ].join("");

    // header with staggered animation
    const header = `
      <header class="page-header">
        <h1 class="page-title stagger" style="--delay:.10s">${escapeHtml(title)}</h1>
        <div class="page-tags stagger" style="--delay:.22s">${chips}</div>
        ${date ? `<div class="page-date stagger" style="--delay:.34s">${escapeHtml(date)}</div>` : ""}
      </header>
    `;

    // abstract
    const abstractHtml = brief.length
      ? `<section class="abstract element">
          <h2 class="element-title">Abstract</h2>
          <div class="card"><ul class="brief">${brief.map(li => `<li>${escapeHtml(li)}</li>`).join("")}</ul></div>
        </section>`
      : "";

    fallbackSectionState.counts = Object.create(null);
    const collectorState = { list: [], counts: Object.create(null) };
    const elementsHtml = withSectionCollector(collectorState, () => renderElements(elements, ctx, page));
    const tocHtml = renderTableOfContents(collectorState.list);

    // mount with enter animation wrapper
    const body = header + abstractHtml + tocHtml + elementsHtml;
    app.innerHTML = `<div class="page-anim">${body}</div>`;
    animateIn();
  }

  // Robustly trigger the page enter animation (works on cache restores)
  function animateIn() {
    const el = app.querySelector('.page-anim');
    if (!el) return;
    // remove class if already present to restart transition
    el.classList.remove('show');
    // force reflow so the browser registers the initial state
    void el.offsetWidth; // eslint-disable-line no-unused-expressions
    // next frame, add the class to animate to final state
    requestAnimationFrame(() => {
      el.classList.add('show');
    });
  }

  // Preload resources referenced by the page while loading animation runs
  function beginPreload(page, ctx) {
    try {
      const elements = Array.isArray(page.elements) ? page.elements : [];
      const urls = [];
      for (const el of elements) {
        const items = normalizeItems(el);
        for (const it of items) {
          const src = makeSrc(it.src, page, ctx);
          if (!src) continue;
          urls.push(src);
        }
      }
      for (const url of urls) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = url;
        document.head.appendChild(link);
        if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) {
          const img = new Image();
          img.src = url;
        }
      }
    } catch {}
  }

  function withSectionCollector(state, fn) {
    const prev = sectionCollector;
    sectionCollector = state;
    try {
      return fn();
    } finally {
      sectionCollector = prev;
    }
  }

  function renderElements(elements, ctx, page) {
    if (!elements.length) return "";
    return elements.map((el, i) => {
      const t = normalizeType(el.type);
      const renderer = RENDERERS[t] || renderUnknown;
      return renderer(el, ctx, i, page);
    }).join("");
  }

  function renderTableOfContents(sections) {
    if (!Array.isArray(sections) || sections.length <= 2) return "";
    const items = sections.map(({ id, title }) => {
      const safeTitle = escapeHtml(title);
      return `<li class="toc-item"><a href="#${id}" data-local-anchor="${id}">${safeTitle}</a></li>`;
    }).join("");
    return `
      <section class="page-toc element stagger" style="--delay:.38s">
        <h2 class="element-title">Contents</h2>
        <div class="card">
          <ol class="toc-list">${items}</ol>
        </div>
      </section>
    `;
  }

  const RENDERERS = {
    synopsis: (el, _ctx, i) => {
      const text = el.content || el.text || "";
      return section("Synopsis", `<div class="card">${richText(text)}</div>`, i);
    },
    designbrief: (el, _ctx, i) => {
      if (Array.isArray(el.items)) {
        const blocks = el.items.map((txt) =>
          `<div class="card" style="margin-top:10px">${richText(txt)}</div>`).join("");
        return section("Design Brief", blocks, i);
      }
      return section("Design Brief", `<div class="card">${richText(el.content || "")}</div>`, i);
    },
    notes: (el, _ctx, i) => section(el.label || "Notes", `<div class="card">${richText(el.content || "")}</div>`, i),

    pdf: (el, ctx, i, page) => {
      const items = normalizeItems(el);
      const sectionTitle = sectionTitleWithItems(el, "PDF", items);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const rawLabel = it.label || it.title || "PDF";
        const label = escapeHtml(rawLabel);
        const embedUrl = `${src}#zoom=${encodeURIComponent(PDF_ZOOM)}`;
        const iframe = `<iframe class="pdf-frame" src="${embedUrl}"></iframe>`;
        const actions = `
          <div class="media-actions">
            <a class="btn" href="${embedUrl}" target="_blank" rel="noopener">Open in new tab</a>
            <a class="btn" href="${src}" download>Download</a>
          </div>`;
        return `<figure class="media">
                  <div class="media-center">${iframe}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                  ${actions}
                </figure>`;
      }).join("");
      return section(sectionTitle, content, i);
    },

    video: (el, ctx, i, page) => {
      const items = normalizeItems(el);
      const sectionTitle = sectionTitleWithItems(el, "Video", items);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const embed = toVideoEmbed(src);
        const label = escapeHtml(it.label || it.title || "Video");
        return `<figure class="media">
                  <div class="media-center">${embed}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                </figure>`;
      }).join("");
      return section(sectionTitle, content, i);
    },

    image: (el, ctx, i, page) => {
      const items = normalizeItems(el);
      const sectionTitle = sectionTitleWithItems(el, "Image", items);
      const content = items.map(it => {
        const src = makeSrc(it.src, page, ctx);
        const label = escapeHtml(it.label || it.title || "Image");
        const alt = escapeHtml(it.alt || it.label || page.title || "");
        const img = `<img class="image-frame" src="${src}" alt="${alt}" loading="lazy">`;
        return `<figure class="media">
                  <div class="media-center">${img}</div>
                  <figcaption class="media-caption">${label}</figcaption>
                </figure>`;
      }).join("");
      return section(sectionTitle, content, i);
    },
    images: (el, ctx, i, page) => RENDERERS.image(el, ctx, i, page)
  };

  function section(title, innerHtml, i) {
    const delay = 0.42 + (Number(i) || 0) * 0.12; // seconds
    const { heading, subtitle } = normalizeSectionHeading(title);
    const { id, text } = registerSection(heading, i);
    const subtitleHtml = subtitle ? `<div class="element-subtitle">${escapeHtml(subtitle)}</div>` : "";
    const subtitleBlock = subtitleHtml ? `${subtitleHtml}\n      ` : "";
    return `<section class="element stagger" id="${id}" style="--delay:${delay.toFixed(2)}s">
      <h2 class="element-title">${escapeHtml(text)}</h2>
      ${subtitleBlock}${innerHtml}
    </section>`;
  }

  function registerSection(title, index) {
    const idx = (Number(index) || 0) + 1;
    const raw = title == null ? "" : String(title);
    const text = raw.trim() ? raw : `Section ${idx}`;
    const target = sectionCollector || fallbackSectionState;
    const counts = target.counts || (target.counts = Object.create(null));
    const base = slugify(text) || `section-${idx}`;
    let id = base;
    if (counts[id]) {
      counts[id] += 1;
      id = `${base}-${counts[id]}`;
    } else {
      counts[id] = 1;
    }
    if (target.list) {
      target.list.push({ id, title: text });
    }
    return { id, text };
  }

  // ---------- helpers ----------
  function normalizeSectionHeading(title) {
    if (title && typeof title === "object" && ("heading" in title || "subtitle" in title)) {
      const heading = String(title.heading || "");
      const subtitle = title.subtitle == null ? "" : String(title.subtitle);
      return { heading, subtitle };
    }
    const text = title == null ? "" : String(title);
    return { heading: text, subtitle: "" };
  }

  function sectionTitleWithItems(el, defaultTitle, items) {
    const base = el && el.label ? String(el.label) : defaultTitle;
    const labels = (items || [])
      .map(it => (it && (it.label || it.title || it.name)) ? String(it.label || it.title || it.name) : "")
      .filter(Boolean);
    const combined = labels.length ? `${base} - ${labels.join(" & ")}` : base;
    if (IS_BETA) {
      const prefix = `${defaultTitle} - `;
      let heading = combined;
      if (heading.startsWith(prefix)) {
        heading = heading.slice(prefix.length).trim();
      }
      if (!heading) heading = base || defaultTitle;
      const subtitle = heading.trim().toLowerCase() === String(defaultTitle).trim().toLowerCase()
        ? ""
        : defaultTitle;
      return { heading, subtitle };
    }
    return combined;
  }

  function filenameStem(id) {
    const last = String(id || "").split("/").pop() || "";
    return last.replace(/\.[^.]+$/, "");
  }
  function normalizeItems(el) {
    if (Array.isArray(el.items)) return el.items;
    if (el.src) return [{ src: el.src, label: el.label }];
    return [];
  }
  function normalizeType(t) { return String(t || "").toLowerCase().replace(/\s+/g, ""); }
  function isHttp(url) { return /^https?:\/\//i.test(url || ""); }
  function expandTemplatePath(p, page, ctx) {
    const idStr = String(ctx.id || "");
    const file  = filenameStem(idStr); // helper already in this file
    // Allow {file}, {class}, {id} inside title before using {title} in paths
    const templatedTitle = String(page.title || idStr)
      .replace(/\{file\}/g, file)
      .replace(/\{class\}/g, ctx.cls || "")
      .replace(/\{id\}/g, idStr);

    return String(p || "")
      .replace(/\{title\}/g, templatedTitle)
      .replace(/\{class\}/g, ctx.cls || "")
      .replace(/\{type\}/g, page.type || "")
      .replace(/\{id\}/g, idStr)
      .replace(/\{file\}/g, file);
  }
  function encodeLocalPath(p) { return String(p || "").split("/").map(seg => seg === "" ? "" : encodeURIComponent(seg)).join("/"); }
  function makeSrc(p, page, ctx) {
    const expanded = expandTemplatePath(p, page, ctx).replace(/^\/+/, "");
    if (isHttp(expanded)) return expanded;
    return BASE + encodeLocalPath(expanded);
  }
  function slugify(input) {
    return String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
  function handleLocalAnchorClick(event) {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    const target = origin.closest('a[data-local-anchor]');
    if (!target || !app.contains(target)) return;
    const id = target.getAttribute('data-local-anchor');
    if (!id) return;
    const section = document.getElementById(id);
    if (!section) return;
    event.preventDefault();
    const { pathname, search } = location;
    history.replaceState(null, '', `${pathname}${search}#${id}`);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function toVideoEmbed(src) {
    const url = String(src || "");
    if (/youtu\.be|youtube\.com/.test(url)) {
      const idMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      const id = idMatch ? idMatch[1] : null;
      const embed = id ? "https://www.youtube.com/embed/" + id : url;
      return `<iframe class="video-frame" src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
      return `<video class="video-frame" controls src="${url}"></video>`;
    }
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
