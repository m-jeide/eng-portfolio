(function () {
  if (!window.PortfolioSearch) return;
  const classes = Array.isArray(window.CLASSES) && window.CLASSES.length
    ? window.CLASSES
    : ["DE", "CIM", "EDD"];

  window.PortfolioSearch.init({
    base: window.SITE_BASE || "/",
    classes,
    searchInputId: "q",
    classSelectId: "cls",
    typeSelectId: "typ",
    resultsPanelId: "resultsPanel",
    resultsListId: "resultsList",
    recentListId: "recentList"
  }).catch(err => {
    const resultsList = document.getElementById("resultsList");
    if (resultsList) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = "Failed to load manifest";
      resultsList.replaceChildren(msg);
    }
    const recentList = document.getElementById("recentList");
    if (recentList) {
      const msg = document.createElement("div");
      msg.className = "muted";
      msg.textContent = String(err);
      recentList.replaceChildren(msg);
    }
  });
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

  // Greeting cycler
  const greetings = ["HI!", "HEY!", "HEYA!", "HOWDY!", "SALUTATIONS!"];
  let currentIndex = Math.floor(Math.random() * greetings.length);

  const greetingEl = document.getElementById("greeting");
  if (greetingEl) {
    // Set initial random greeting
    greetingEl.textContent = greetings[currentIndex] + ", I'm Matthew";

    // Add click handler
    greetingEl.addEventListener("click", function() {
      // Cycle to next greeting
      currentIndex = (currentIndex + 1) % greetings.length;
      greetingEl.textContent = greetings[currentIndex] + ", I'm Matthew";

      // Add bounce animation
      greetingEl.classList.remove("greeting-bounce");
      // Force reflow to restart animation
      void greetingEl.offsetWidth;
      greetingEl.classList.add("greeting-bounce");

      // Remove animation class after it completes
      setTimeout(() => {
        greetingEl.classList.remove("greeting-bounce");
      }, 500);
    });
  }
});
