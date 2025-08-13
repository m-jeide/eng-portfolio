(function () {
  const app = document.getElementById("app");
  const BASE = normalizeBase(window.SITE_BASE || "/");

  boot().catch(err => {
    app.innerHTML = `<div class="card"><h2>Load error</h2><p>${escapeHtml(String(err))}</p></div>`;
  });

  async function boot() {
    const { cls, id } = parseRoute();
    if (!cls || !id) {
      app.innerHTML = `<div class="card"><h2>Missing route</h2>
        <p>Use <code>${BASE}interpreter.html?class=DE&id=1.1.9%20Soldering%20Desoldering</code>
        or navigate to <code>${BASE}DE/1.1.9%20Soldering%20Desoldering</code>.</p></div>`;
      return;
    }
    const jsonUrl = BASE + "pages/" + encodeURIComponent(cls) + "/" + encodeURIComponent(id) + ".json";
    const data = await fetch(jsonUrl).then(r => {
      if (!r.ok) throw new Error("Page JSON not found at " + jsonUrl);
      return r.json();
    });

    renderPage(data, { cls, id });
    hydrateLinks(cls, id); // future nav if you want it
  }

  function parseRoute() {
    const sp = new URLSearchParams(location.search);
    const clsQ = sp.get("class");
    const idQ = sp.get("id");
    if (clsQ && idQ) return { cls: decodeURIComponent(clsQ), id: decodeURIComponent(idQ) };

    // Pretty URL mode: /<base maybe>/DE/<identifier>
    let path = decodeURIComponent(location.pathname);
    if (BASE !== "/" && path.startsWith(BASE)) path = path.slice(BASE.length);
    const parts = path.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length >= 2) {
      const cls = parts[0];
      const id = parts.slice(1).join("/"); // allow slashes if you ever nest
      return { cls, id };
    }
    return { cls: null, id: null };
  }

  function renderPage(page, ctx) {
    const { title, date, type, brief = [], elements = [] } = page;
    const header = `
      <header class="header">
        <h1>${escapeHtml(title || ctx.id)}</h1>
        <div class="meta">
          ${date ? `<span>${escapeHtml(date)}</span>` : ""}
          ${type ? `<span class="chip">${escapeHtml(type)}</span>` : ""}
        </div>
      </header>
    `;

    const briefHtml = Array.isArray(brief) && brief.length
      ? `<section><h2>Brief</h2><div class="card"><ul class="brief">${
          brief.map(li => `<li>${escapeHtml(li)}</li>`).join("")
        }</ul></div></section>`
      : "";

    const elementsHtml = renderElements(elements, ctx);

    app.innerHTML = header + briefHtml + elementsHtml;
  }

  function renderElements(elements, ctx) {
    if (!Array.isArray(elements) || !elements.length) return "";
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
      // supports content: string or items: [string]
      if (Array.isArray(el.items)) {
        return lane("Design Brief", el.items.map((txt, i) =>
          tile(`Brief ${i+1}`, `<div class="tile-body">${richText(txt)}</div>`)).join(""));
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
        const safeLabel = escapeHtml(it.label || "PDF");
        const iframe = `<iframe class="pdf-frame" src="${src}#toolbar=0"></iframe>`;
        const dl = `<a class="btn" href="${src}" download>Download</a>`;
        return tile(safeLabel, `<div class="tile-body">${dl}</div>`, iframe);
      }).join("");
      return lane(el.label || "PDF", tiles);
    },
    video: (el) => {
      const items = normalizeItems(el);
      const tiles = items.map(it => {
        const embed = toVideoEmbed(it.src);
        const safeLabel = escapeHtml(it.label || "Video");
        return tile(safeLabel, `<div class="tile-body"></div>`, embed);
      }).join("");
      return lane(el.label || "Video", tiles);
    }
  };

  function block(title, innerHtml) {
    return `<div class="section">
      <h3>${escapeHtml(title)}</h3>
      ${innerHtml}
    </div>`;
  }

  function lane(title, tilesHtml) {
    return `<div class="section">
      <h3>${escapeHtml(title)}</h3>
      <div class="lane">${tilesHtml}</div>
    </div>`;
  }

  function tile(head, bodyHtml, mediaHtml = "") {
    return `<div class="tile" tabindex="0">
      <div class="tile-head">${escapeHtml(head)}</div>
      ${mediaHtml ? mediaHtml : ""}
      ${bodyHtml}
    </div>`;
  }

  function renderUnknown(el) {
    const t = escapeHtml(el.type || "unknown");
    const pretty = escapeHtml(JSON.stringify(el, null, 2));
    return block(`Unknown element: ${t}`, `<div class="card"><pre>${pretty}</pre></div>`);
  }

  // Helpers

  function normalizeItems(el) {
    if (Array.isArray(el.items)) return el.items;
    if (el.src) return [{ src: el.src, label: el.label }];
    return [];
  }

  function normalizeType(t) {
    return String(t || "").toLowerCase().replace(/\s+/g, "");
  }

  function toVideoEmbed(src) {
    const url = String(src);
    if (/youtu\.be|youtube\.com/.test(url)) {
      const idMatch = url.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
      const id = idMatch ? idMatch[1] : null;
      const embed = id ? "https://www.youtube.com/embed/" + id : url;
      return `<iframe class="video-frame" src="${embed}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
      return `<video class="video-frame" controls src="${absolutize(url)}"></video>`;
    }
    return `<iframe class="video-frame" src="${absolutize(url)}"></iframe>`;
  }

  function absolutize(p) {
    if (/^https?:\/\//i.test(p)) return p;
    return BASE + p.replace(/^\/+/, "");
  }

  function normalizeBase(b) {
    if (!b) return "/";
    return b.endsWith("/") ? b : b + "/";
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function richText(s) {
    // super light markdown-ish: **bold**, *italics*, and link autolink
    const esc = escapeHtml(String(s));
    const linked = esc.replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" class="btn">$1</a>');
    return linked.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function hydrateLinks() {} // placeholder for future nav
})();
