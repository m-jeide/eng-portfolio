(function (global) {
  const state = {
    initPromise: null,
    manifestPromise: null,
    allItems: [],
    classes: null,
    config: null
  };

  function init(options) {
    const opts = options || {};
    if (state.initPromise) {
      return state.initPromise;
    }
    const run = bootstrap(opts);
    state.initPromise = run;
    run.finally(() => {
      state.initPromise = null;
    });
    return run;
  }

  async function bootstrap(options) {
    const cfg = buildConfig(options);
    state.config = cfg;

    const elements = collectElements(cfg);
    if (!elements) return null;

    const all = await loadItems(cfg.base, cfg.classes);

    populateClassOptions(elements.classSelect, state.classes);
    updateClassCounts(elements.classSelect, all);

    const typeUpdater = makeTypeUpdater(elements.typeSelect, all);
    typeUpdater("");

    wireSearch(elements, all, typeUpdater);

    if (elements.recentList) {
      renderRecent(elements.recentList, all);
    }

    return { all };
  }

  function buildConfig(options) {
    const base = normalizeBase(options.base || global.SITE_BASE || "/");
    const initialClasses = Array.isArray(options.classes) && options.classes.length
      ? options.classes
      : (Array.isArray(global.CLASSES) && global.CLASSES.length ? global.CLASSES : ["DE", "CIM", "EDD"]);
    return {
      base,
      classes: initialClasses,
      searchInputId: options.searchInputId || "q",
      classSelectId: options.classSelectId || "cls",
      typeSelectId: options.typeSelectId || "typ",
      resultsPanelId: options.resultsPanelId || "resultsPanel",
      resultsListId: options.resultsListId || "resultsList",
      recentListId: options.recentListId || null
    };
  }

  function collectElements(cfg) {
    const search = document.getElementById(cfg.searchInputId);
    const classSelect = document.getElementById(cfg.classSelectId);
    const typeSelect = document.getElementById(cfg.typeSelectId);
    const resultsPanel = document.getElementById(cfg.resultsPanelId);
    const resultsList = document.getElementById(cfg.resultsListId);
    const recentList = cfg.recentListId ? document.getElementById(cfg.recentListId) : null;

    if (!search || !classSelect || !typeSelect || !resultsPanel || !resultsList) {
      return null;
    }

    return { search, classSelect, typeSelect, resultsPanel, resultsList, recentList };
  }

  async function loadItems(base, hintedClasses) {
    if (state.allItems.length) return state.allItems;

    const manifest = await loadManifest(base);
    const classesFromManifest = Object.keys(manifest || {});
    const mergedClasses = unique([...(hintedClasses || []), ...classesFromManifest]);
    state.classes = mergedClasses;

    const groups = Object.entries(manifest).map(([cls, items]) => ({ cls, items: normalizeItems(items) }));
    const all = groups.flatMap(({ cls, items }) => items.map(item => enrichItem(item, cls, base)));
    state.allItems = all;
    return all;
  }

  async function loadManifest(base) {
    if (!state.manifestPromise) {
      const url = base + "pages/manifest.json";
      state.manifestPromise = fetch(url, { cache: "no-store" }).then(r => {
        if (!r.ok) throw new Error("manifest.json not found");
        return r.json();
      });
    }
    return state.manifestPromise;
  }

  function normalizeItems(items) {
    return (items || []).map(it => ({
      id: it.id,
      title: it.title || it.id,
      type: it.type || "",
      date: it.date || ""
    }));
  }

  function enrichItem(item, cls, base) {
    const id = item.id;
    const href = base + encodeURIComponent(cls || "") + "/" + String(id || "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const parsed = parsePortfolioDate(item.date);
    return {
      cls,
      id,
      title: item.title || id,
      type: item.type || "",
      date: item.date || "",
      href,
      _when: parsed ? parsed.getTime() : 0,
      _hay: [item.title || id, item.type || "", item.date || "", cls].join(" ").toLowerCase()
    };
  }

  function populateClassOptions(select, classes) {
    if (!select || select.dataset.classesInitialized === "true") return;
    const existingValues = new Set(Array.from(select.options).map(opt => opt.value));
    for (const cls of classes || []) {
      if (!cls || existingValues.has(cls)) continue;
      const opt = document.createElement("option");
      opt.value = cls;
      opt.textContent = cls;
      select.appendChild(opt);
    }
    select.dataset.classesInitialized = "true";
  }

  function updateClassCounts(select, items) {
    if (!select) return;
    const total = items.length;
    if (select.options.length > 0) {
      const baseOpt = select.options[0];
      if (baseOpt && baseOpt.value === "") {
        baseOpt.textContent = `All classes (${total})`;
      }
    }
    const tally = new Map();
    for (const it of items) {
      tally.set(it.cls, (tally.get(it.cls) || 0) + 1);
    }
    for (let i = 0; i < select.options.length; i++) {
      const opt = select.options[i];
      if (!opt.value) continue;
      const count = tally.get(opt.value) || 0;
      opt.textContent = `${opt.value} (${count})`;
    }
  }

  function makeTypeUpdater(typeSelect, items) {
    return function updateTypeOptions(cls) {
      if (!typeSelect) return;
      while (typeSelect.firstChild) typeSelect.removeChild(typeSelect.firstChild);
      const base = document.createElement("option");
      base.value = "";
      if (cls) {
        const total = items.filter(x => x.cls === cls).length;
        base.textContent = `All types (${total})`;
      } else {
        base.textContent = "All types";
      }
      typeSelect.appendChild(base);
      if (!cls) {
        typeSelect.disabled = true;
        typeSelect.value = "";
        return;
      }
      const counts = new Map();
      for (const it of items) {
        if (it.cls !== cls) continue;
        const key = (it.type || "").trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const types = [...counts.keys()].sort((a, b) => a.localeCompare(b));
      for (const t of types) {
        const opt = document.createElement("option");
        opt.value = t;
        const cnt = counts.get(t) || 0;
        opt.textContent = `${t} (${cnt})`;
        typeSelect.appendChild(opt);
      }
      typeSelect.disabled = types.length === 0;
      typeSelect.value = "";
    };
  }

  function wireSearch(elements, all, updateTypeOptions) {
    if (!elements || !elements.search) return;
    const { search, classSelect, typeSelect, resultsPanel, resultsList } = elements;
    if (search.dataset.searchBound === "true") return;
    search.dataset.searchBound = "true";

    let debounceTimer = null;

    function renderMatches() {
      const query = search.value.trim().toLowerCase();
      const cls = classSelect.value;
      const type = typeSelect ? typeSelect.value : "";
      let pool = cls ? all.filter(x => x.cls === cls) : all;
      if (cls && type) {
        pool = pool.filter(x => String(x.type) === String(type));
      }
      const matches = query
        ? pool.filter(x => x._hay.includes(query))
        : [...pool].sort((a, b) => b._when - a._when);
      const top = matches.slice(0, 10);
      resultsList.innerHTML = top.map(renderRow).join("") || `<div class="muted">No matches</div>`;

      const shouldOpen = document.activeElement === search || !!query || !!cls || (!!cls && !!type);
      resultsPanel.classList.toggle("open", shouldOpen);
    }

    function handleBlur() {
      setTimeout(() => {
        const hasQuery = !!search.value.trim();
        const hasClass = !!classSelect.value;
        const hasType = typeSelect ? !!typeSelect.value : false;
        resultsPanel.classList.toggle("open", hasQuery || hasClass || (hasClass && hasType));
      }, 60);
    }

    const debounced = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderMatches, 120);
    };

    search.addEventListener("focus", renderMatches);
    search.addEventListener("input", debounced);
    search.addEventListener("blur", handleBlur);

    classSelect.addEventListener("change", () => {
      updateTypeOptions(classSelect.value);
      renderMatches();
    });

    if (typeSelect) {
      typeSelect.addEventListener("change", renderMatches);
    }

    resultsPanel.classList.remove("open");
  }

  function renderRow(item) {
    const chips = buildChips(item);
    const right = item.date ? escapeHtml(item.date) : "";
    return `<div class="item">
      <div class="item-left">
        <a class="title" href="${item.href}">${escapeHtml(item.title)}</a>
        <span class="chips">${chips}</span>
      </div>
      <span class="item-right">${right}</span>
    </div>`;
  }

  function buildChips(item) {
    const cls = (item.cls || "").trim();
    const typ = (item.type || "").trim();
    if (!cls && !typ) return "";
    const same = cls && typ && cls.toLowerCase() === typ.toLowerCase();
    const parts = [];
    if (cls) parts.push(`<span class="chip chip-class">${escapeHtml(cls)}</span>`);
    if (typ && !same) parts.push(`<span class="chip chip-type">${escapeHtml(typ)}</span>`);
    return parts.join("");
  }

  function renderRecent(node, items) {
    if (!node) return;
    const top5 = [...items].sort((a, b) => b._when - a._when).slice(0, 5);
    node.innerHTML = top5.map(renderRow).join("") || `<div class="muted">No recent items</div>`;
  }

  function normalizeBase(b) {
    if (!b) return "/";
    return String(b).endsWith("/") ? String(b) : `${b}/`;
  }

  function unique(list) {
    const seen = new Set();
    const result = [];
    for (const item of list) {
      if (seen.has(item)) continue;
      seen.add(item);
      result.push(item);
    }
    return result;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function parsePortfolioDate(value) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(v => parseInt(v, 10));
      return new Date(y, m - 1, d);
    }
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) {
      const [mm, dd, yy] = value.split("/").map(v => parseInt(v, 10));
      const year = 2000 + yy;
      return new Date(year, mm - 1, dd);
    }
    return null;
  }

  global.PortfolioSearch = { init };
})(window);
