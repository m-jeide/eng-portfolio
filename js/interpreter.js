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
  let manifestPromise = null;
  const pageCache = new Map();

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
    await render(page, { cls, id });
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

  async function render(page, ctx) {
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
    const resolvedElements = await resolveElementsData(elements, ctx, page);
    const collectorState = { list: [], counts: Object.create(null) };
    const elementsHtml = withSectionCollector(collectorState, () => renderElements(resolvedElements, ctx, page));
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

  async function resolveElementsData(elements, ctx, page) {
    if (!Array.isArray(elements) || !elements.length) return [];
    const result = [];
    for (const el of elements) {
      const type = normalizeType(el.type);
      if (type === "type-reference") {
        result.push(await resolveTypeReferenceElement(el, ctx));
      } else if (type === "reference") {
        result.push(await resolveReferenceElement(el, ctx));
      } else {
        result.push(el);
      }
    }
    return result;
  }

  async function resolveTypeReferenceElement(el, ctx) {
    const targetType = extractReferenceType(el);
    if (!targetType || !ctx || !ctx.cls) {
      return { ...el, referenceType: targetType || "", referenceItems: [] };
    }
    let manifest;
    try {
      manifest = await fetchManifestCached();
    } catch (err) {
      console.warn("Failed to load manifest for type-reference", err);
      return { ...el, referenceType: targetType, referenceItems: [] };
    }
    const entries = Array.isArray(manifest[ctx.cls]) ? manifest[ctx.cls] : [];
    const targetLower = targetType.trim().toLowerCase();
    const matches = entries.filter(item => String(item.type || "").trim().toLowerCase() === targetLower);
    if (!matches.length) {
      return { ...el, referenceType: targetType, referenceItems: [] };
    }
    const items = await Promise.all(matches.map(async (item) => {
      try {
        const pageData = await fetchPageJsonCached(ctx.cls, item.id);
        return {
          entry: item,
          page: pageData,
          href: buildAssignmentHref(ctx.cls, item.id),
          cls: ctx.cls,
          id: item.id,
          timestamp: toTimestamp(item.date)
        };
      } catch (err) {
        console.warn("Failed to load referenced assignment", item.id, err);
        return null;
      }
    }));
    const filteredItems = items.filter(Boolean);
    if (!filteredItems.length) {
      return { ...el, referenceType: targetType, referenceItems: [] };
    }
    filteredItems.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return { ...el, referenceType: targetType, referenceItems: filteredItems };
  }

  async function resolveReferenceElement(el, ctx) {
    const target = extractReferenceTarget(el, ctx);
    if (!target) {
      return { ...el, referenceItem: null, referenceError: "Missing reference target." };
    }

    let pageData = null;
    let loadError = "";
    try {
      pageData = await fetchPageJsonCached(target.cls, target.id);
    } catch (err) {
      console.warn("Failed to load reference target", target.cls, target.id, err);
      loadError = `Assignment ${target.cls}/${target.id} not found.`;
    }

    const overrides = {
      title: firstNonEmpty(el.entryTitle, el.title, el.targetTitle),
      type: firstNonEmpty(el.entryType, el.assignmentType, el.targetType),
      date: firstNonEmpty(el.entryDate, el.assignmentDate, el.targetDate, el.date),
      brief: Array.isArray(el.brief) ? [...el.brief] : null,
      elements: extractReferencePreviewElements(el)
    };

    const entryTitle = firstNonEmpty(overrides.title, pageData && pageData.title, pageData && pageData.name, target.id);
    const entryType = firstNonEmpty(overrides.type, pageData && pageData.type);
    const entryDate = firstNonEmpty(overrides.date, pageData && pageData.date);

    const entry = {
      id: target.id,
      title: entryTitle,
      type: entryType,
      date: entryDate
    };

    const page = buildReferencePageSnapshot(pageData, entry, overrides);

    const referenceItem = {
      entry,
      page,
      href: buildAssignmentHref(target.cls, target.id),
      cls: target.cls,
      id: target.id,
      timestamp: toTimestamp(entry.date)
    };

    const result = { ...el, referenceItem };
    if (loadError) {
      result.referenceError = loadError;
    }
    return result;
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
      const multiple = items.length > 1;
      const fallbackLabel = el && el.label ? String(el.label) : "PDF";
      return section(sectionTitle, ({ registerItem, sectionId }) => {
        return items.map((it, index) => {
          const src = makeSrc(it.src, page, ctx);
          const rawLabel = it.label || it.title || fallbackLabel;
          const displayLabel = escapeHtml(rawLabel || `${fallbackLabel} ${index + 1}`);
          const embedUrl = `${src}#zoom=${encodeURIComponent(PDF_ZOOM)}`;
          const iframe = `<iframe class="pdf-frame" src="${embedUrl}"></iframe>`;
          const actions = `
            <div class="media-actions">
              <a class="btn" href="${embedUrl}" target="_blank" rel="noopener">Open in new tab</a>
              <a class="btn" href="${src}" download>Download</a>
            </div>`;
          const tocTitle = rawLabel || `${fallbackLabel} ${index + 1}`;
          const anchorId = multiple ? registerItem(tocTitle, tocTitle) : sectionId;
          const figureId = multiple ? ` id="${anchorId}"` : "";
          return `<figure class="media"${figureId}>
                    <div class="media-center">${iframe}</div>
                    <figcaption class="media-caption">${displayLabel}</figcaption>
                    ${actions}
                  </figure>`;
        }).join("");
      }, i, { skipDefaultToc: multiple });
    },

    video: (el, ctx, i, page) => {
      const items = normalizeItems(el);
      const sectionTitle = sectionTitleWithItems(el, "Video", items);
      const multiple = items.length > 1;
      const fallbackLabel = el && el.label ? String(el.label) : "Video";
      return section(sectionTitle, ({ registerItem, sectionId }) => {
        return items.map((it, index) => {
          const src = makeSrc(it.src, page, ctx);
          const embed = toVideoEmbed(src);
          const rawLabel = it.label || it.title || fallbackLabel;
          const displayLabel = escapeHtml(rawLabel || `${fallbackLabel} ${index + 1}`);
          const tocTitle = rawLabel || `${fallbackLabel} ${index + 1}`;
          const anchorId = multiple ? registerItem(tocTitle, tocTitle) : sectionId;
          const figureId = multiple ? ` id="${anchorId}"` : "";
          return `<figure class="media"${figureId}>
                    <div class="media-center">${embed}</div>
                    <figcaption class="media-caption">${displayLabel}</figcaption>
                  </figure>`;
        }).join("");
      }, i, { skipDefaultToc: multiple });
    },

    image: (el, ctx, i, page) => {
      const items = normalizeItems(el);
      const sectionTitle = sectionTitleWithItems(el, "Image", items);
      const multiple = items.length > 1;
      const fallbackLabel = el && el.label ? String(el.label) : "Image";
      return section(sectionTitle, ({ registerItem, sectionId }) => {
        return items.map((it, index) => {
          const src = makeSrc(it.src, page, ctx);
          const rawLabel = it.label || it.title || fallbackLabel;
          const displayLabel = escapeHtml(rawLabel || `${fallbackLabel} ${index + 1}`);
          const alt = escapeHtml(it.alt || it.label || page.title || "");
          const img = `<img class="image-frame" src="${src}" alt="${alt}" loading="lazy">`;
          const tocTitle = rawLabel || `${fallbackLabel} ${index + 1}`;
          const anchorId = multiple ? registerItem(tocTitle, tocTitle) : sectionId;
          const figureId = multiple ? ` id="${anchorId}"` : "";
          return `<figure class="media"${figureId}>
                    <div class="media-center">${img}</div>
                    <figcaption class="media-caption">${displayLabel}</figcaption>
                  </figure>`;
        }).join("");
      }, i, { skipDefaultToc: multiple });
    },
    images: (el, ctx, i, page) => RENDERERS.image(el, ctx, i, page),

    reference: (el, ctx, i) => {
      const heading = el && el.label ? String(el.label) : "Reference";
      return section(heading, ({ registerItem }) => renderReferenceBody(el, ctx, registerItem), i, { skipDefaultToc: false });
    },

    "type-reference": (el, ctx, i) => {
      const refType = (el && el.referenceType) ? String(el.referenceType) : extractReferenceType(el);
      const items = Array.isArray(el.referenceItems) ? el.referenceItems : [];
      const heading = el && el.label ? String(el.label) : (refType ? `${refType} Assignments` : "References");
      return section(heading, ({ registerItem, sectionId }) => renderTypeReferenceBody(items, refType, ctx, registerItem, sectionId), i, { skipDefaultToc: false });
    }
  };

  function renderTypeReferenceBody(items, refType, ctx, registerItem, sectionId) {
    if (!Array.isArray(items) || !items.length) {
      if (!refType) return `<div class="muted">No matching assignments.</div>`;
      return `<div class="muted">No assignments found for ${escapeHtml(refType)}.</div>`;
    }
    const sortedItems = [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const list = sortedItems.map((item, index) => renderTypeReferenceItem(item, ctx, registerItem, index)).join("");
    return `<div class="type-reference">${list}</div>`;
  }

  function renderReferenceBody(el, ctx, registerItem) {
    const item = el && el.referenceItem;
    if (!item) {
      const message = el && el.referenceError ? el.referenceError : "Referenced assignment not available.";
      return `<div class="muted">${escapeHtml(message)}</div>`;
    }
    const card = renderTypeReferenceItem(item, ctx, registerItem, 0);
    const warning = el && el.referenceError ? `<div class="reference-warning muted">${escapeHtml(el.referenceError)}</div>` : "";
    return `<div class="type-reference">${card}</div>${warning}`;
  }

  function renderTypeReferenceItem(item, ctx, registerItem, index) {
    if (!item || !item.page || !item.entry) return "";
    const page = item.page;
    const entry = item.entry;
    const href = item.href || buildAssignmentHref(item.cls || ctx.cls, item.id);
    const replacements = {
      file: filenameStem(entry.id),
      class: item.cls || ctx.cls || "",
      id: entry.id || "",
      type: entry.type || page.type || ""
    };
    let displayTitle = page.title ? applyTemplate(page.title, replacements) : "";
    if (!displayTitle || /\{\w+\}/.test(displayTitle)) {
      const fallbackRaw = entry.title || entry.id || page.title || "";
      displayTitle = applyTemplate(fallbackRaw, replacements) || entry.id;
    }
    const anchorId = typeof registerItem === "function" ? registerItem(displayTitle, entry.id) : null;
    const idAttr = anchorId ? ` id="${anchorId}"` : "";
    const brief = Array.isArray(page.brief) ? page.brief : [];
    const briefHtml = brief.length
      ? `<ul class="reference-brief">${brief.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
      : `<div class="reference-brief reference-brief-empty muted">No abstract provided.</div>`;
    const dateStr = entry.date || page.date || "";
    const dateHtml = dateStr ? `<div class="type-reference-date">${escapeHtml(dateStr)}</div>` : "";
    const elements = Array.isArray(page.elements) ? page.elements : [];
    let bodyHtml = "";
    if (elements.length === 1) {
      const refCtx = { cls: item.cls || ctx.cls, id: item.id };
      bodyHtml = renderElementPreview(elements[0], refCtx, page);
    }
    if (!bodyHtml) {
      bodyHtml = `<div class="reference-actions"><a class="btn" href="${href}">View Assignment</a></div>`;
    }
    return `<article class="card type-reference-item"${idAttr}>
      <header class="type-reference-header">
        <h3 class="type-reference-title"><a href="${href}">${escapeHtml(displayTitle)}</a></h3>
        ${dateHtml}
        ${briefHtml}
      </header>
      <div class="type-reference-body">${bodyHtml}</div>
    </article>`;
  }

  function renderElementPreview(el, refCtx, refPage) {
    if (!el) return "";
    const type = normalizeType(el.type);
    if (!type) return "";
    const items = normalizeItems(el);
    switch (type) {
      case "pdf":
        if (!items.length) return "";
        return items.map(it => {
          const src = makeSrc(it.src, refPage, refCtx);
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
      case "video":
        if (!items.length) return "";
        return items.map(it => {
          const src = makeSrc(it.src, refPage, refCtx);
          const embed = toVideoEmbed(src);
          const label = escapeHtml(it.label || it.title || "Video");
          return `<figure class="media">
                    <div class="media-center">${embed}</div>
                    <figcaption class="media-caption">${label}</figcaption>
                  </figure>`;
        }).join("");
      case "image":
      case "images":
        if (!items.length) return "";
        return items.map(it => {
          const src = makeSrc(it.src, refPage, refCtx);
          const label = escapeHtml(it.label || it.title || "Image");
          const alt = escapeHtml(it.alt || it.label || refPage.title || "");
          const img = `<img class="image-frame" src="${src}" alt="${alt}" loading="lazy">`;
          return `<figure class="media">
                    <div class="media-center">${img}</div>
                    <figcaption class="media-caption">${label}</figcaption>
                  </figure>`;
        }).join("");
      case "synopsis": {
        const text = el.content || el.text || "";
        return `<div class="card">${richText(text)}</div>`;
      }
      case "notes":
      case "designbrief": {
        const content = el.content || el.text || "";
        return `<div class="card">${richText(content)}</div>`;
      }
      default:
        return "";
    }
  }

  function section(title, innerContent, i, opts) {
    const delay = 0.42 + (Number(i) || 0) * 0.12; // seconds
    const meta = normalizeSectionHeading(title);
    const heading = meta.heading;
    const subtitle = meta.subtitle;
    const options = opts || {};
    const { id, text } = registerSection(heading, i);
    const skipDefaultToc = options.skipDefaultToc || false;

    if (!skipDefaultToc) {
      recordTocEntry(id, text);
    }

    let itemCount = 0;
    const builderContext = {
      sectionId: id,
      registerItem(itemTitle, slugHint) {
        itemCount += 1;
        const display = String(itemTitle && String(itemTitle).trim() ? itemTitle : `${text} ${itemCount}`);
        const slugSource = slugHint && String(slugHint).trim() ? slugHint : display;
        const base = `${id}-${slugify(slugSource) || `item-${itemCount}`}`;
        const anchorId = claimId(base, `${id}-item-${itemCount}`);
        recordTocEntry(anchorId, display);
        return anchorId;
      }
    };

    const innerHtml = typeof innerContent === 'function'
      ? innerContent(builderContext)
      : innerContent;

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
    const base = slugify(text) || `section-${idx}`;
    const id = claimId(base, `section-${idx}`);
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
  function recordTocEntry(id, title) {
    const target = sectionCollector || fallbackSectionState;
    if (!target.list) return;
    const text = title == null ? String(id || "") : String(title);
    target.list.push({ id, title: text });
  }
  function claimId(base, fallback) {
    const target = sectionCollector || fallbackSectionState;
    const counts = target.counts || (target.counts = Object.create(null));
    const primary = slugify(base);
    const secondary = slugify(fallback);
    const root = primary || secondary || "section";
    const seen = counts[root] || 0;
    counts[root] = seen + 1;
    if (seen === 0) return root;
    return `${root}-${seen + 1}`;
  }
  function slugify(input) {
    return String(input || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }
  function applyTemplate(str, vars) {
    return String(str || "").replace(/\{(\w+)\}/g, (_, key) => (key in vars ? vars[key] : `{${key}}`));
  }
  function extractReferenceType(el) {
    if (!el) return "";
    const candidates = [el.referenceType, el.targetType, el.target, el.reference, el.value, el.lookup, el.label];
    for (const candidate of candidates) {
      if (candidate && String(candidate).trim()) return String(candidate).trim();
    }
    return "";
  }
  function extractReferenceTarget(el, ctx) {
    if (!el) return null;
    const candidates = [el.target, el.reference, el.value, el.lookup];
    let parsed = null;
    for (const candidate of candidates) {
      parsed = mergeReferenceTarget(parsed, parseReferenceTargetCandidate(candidate));
    }
    parsed = mergeReferenceTarget(parsed, parseReferenceTargetCandidate({
      cls: el.targetClass || el.class || el.cls,
      id: el.targetId || el.assignmentId
    }));
    if ((!parsed || !parsed.id) && typeof el.assignment === "string") {
      parsed = mergeReferenceTarget(parsed, { cls: null, id: String(el.assignment).trim() });
    }
    if (!parsed || !parsed.id) return null;
    const cls = parsed.cls && String(parsed.cls).trim() ? String(parsed.cls).trim() : (ctx && ctx.cls ? String(ctx.cls).trim() : "");
    if (!cls) return null;
    const id = String(parsed.id).trim();
    if (!id) return null;
    return { cls, id };
  }
  function parseReferenceTargetCandidate(candidate) {
    if (!candidate) return null;
    if (typeof candidate === "string") {
      const str = candidate.trim();
      if (!str) return null;
      const parts = str.split("/");
      if (parts.length >= 2) {
        const cls = parts.shift();
        const id = parts.join("/").trim();
        return { cls: cls ? cls.trim() : "", id };
      }
      return { cls: "", id: str };
    }
    if (typeof candidate === "object") {
      const cls = candidate.cls || candidate.class || candidate.course || candidate.department || "";
      const id = candidate.id || candidate.assignment || candidate.value || candidate.name || "";
      if (!cls && !id) return null;
      return {
        cls: cls ? String(cls).trim() : "",
        id: id ? String(id).trim() : ""
      };
    }
    return null;
  }
  function mergeReferenceTarget(current, update) {
    if (!update) return current;
    if (!current) return update;
    const cls = current.cls || update.cls;
    const id = current.id || update.id;
    return { cls, id };
  }
  function buildReferencePageSnapshot(pageData, entry, overrides) {
    const snapshot = pageData ? { ...pageData } : {};
    snapshot.title = firstNonEmpty(snapshot.title, entry.title);
    snapshot.type = firstNonEmpty(snapshot.type, entry.type);
    if (overrides.brief) {
      snapshot.brief = [...overrides.brief];
    } else if (Array.isArray(snapshot.brief)) {
      snapshot.brief = [...snapshot.brief];
    } else {
      snapshot.brief = [];
    }
    if (overrides.elements) {
      snapshot.elements = overrides.elements;
    } else if (Array.isArray(snapshot.elements)) {
      snapshot.elements = snapshot.elements;
    } else {
      snapshot.elements = [];
    }
    return snapshot;
  }
  function extractReferencePreviewElements(el) {
    if (!el) return null;
    if (Array.isArray(el.previewElements)) return el.previewElements;
    if (Array.isArray(el.preview)) return el.preview;
    if (el.previewElement && typeof el.previewElement === "object") return [el.previewElement];
    if (el.preview && typeof el.preview === "object") return [el.preview];
    if (Array.isArray(el.elements)) return el.elements;
    return null;
  }
  function firstNonEmpty(...values) {
    for (const value of values) {
      if (value == null) continue;
      const str = String(value);
      if (str.trim()) return str;
    }
    return "";
  }
  function fetchManifestCached() {
    if (!manifestPromise) {
      manifestPromise = fetch(BASE + "pages/manifest.json", { cache: "no-store" })
        .then(r => {
          if (!r.ok) throw new Error("manifest.json not found");
          return r.json();
        });
    }
    return manifestPromise;
  }
  function fetchPageJsonCached(cls, id) {
    const key = `${cls}||${id}`;
    if (!pageCache.has(key)) {
      const url = buildJsonUrl(cls, id);
      pageCache.set(key, fetchJson(url));
    }
    return pageCache.get(key);
  }
  function buildAssignmentHref(cls, id) {
    const encodedClass = encodeURIComponent(cls);
    const encodedId = String(id || "").split("/").map(encodeURIComponent).join("/");
    return BASE + `${encodedClass}/${encodedId}`;
  }
  function toTimestamp(dateStr) {
    if (!dateStr) return 0;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split("-").map(n => parseInt(n, 10));
      return new Date(y, m - 1, d).getTime();
    }
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
      const [mm, dd, yy] = dateStr.split("/").map(n => parseInt(n, 10));
      const year = 2000 + yy;
      return new Date(year, mm - 1, dd).getTime();
    }
    return 0;
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
