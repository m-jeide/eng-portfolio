window.SITE_BASE = "/eng-portfolio/";          
window.REPO_OWNER = "m-jeide";
window.REPO_NAME  = "eng-portfolio";
window.REPO_BRANCH = "main";      
window.CLASSES = ["DE", "CIM", "EDD", "Certifications"];

window.SPECIALTY_FLAGS = window.SPECIALTY_FLAGS || {};
window.SPECIALTY_FLAGS.EDD_ELEMENTS = true;

window.RESUME_URL = "/eng-portfolio/resources/EDD/Notes/%5BW2%5D%20Canva%20Resume/%5BW2%5D%20Canva%20Resume.pdf#zoom=100";

// Detect beta-mode query parameters up front so pages can toggle designs.
(function () {
  var search = window.location && typeof window.location.search === "string" ? window.location.search : "";
  var params;
  try {
    params = new URLSearchParams(search);
  } catch (err) {
    console.warn("Beta mode detection failed", err);
    window.IS_BETA = false;
    return;
  }

  function isTruthyBeta(val) {
    if (val === null) return false;
    var normalized = String(val).trim().toLowerCase();
    if (!normalized) return true;
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return true;
  }

  var betaParam = params.get("beta");
  var modeParam = params.get("mode");
  var betaEnabled = false;

  if (betaParam !== null) {
    betaEnabled = isTruthyBeta(betaParam);
  } else if (modeParam) {
    betaEnabled = String(modeParam).trim().toLowerCase() === "beta";
  }

  window.IS_BETA = betaEnabled;
  if (!betaEnabled) return;

  if (document.documentElement.classList) {
    document.documentElement.classList.add("beta-mode");
  } else if (document.documentElement.className.indexOf("beta-mode") === -1) {
    document.documentElement.className += " beta-mode";
  }

  function markBody() {
    if (!document.body) return;
    if (document.body.classList) {
      document.body.classList.add("beta-mode");
    } else if (document.body.className.indexOf("beta-mode") === -1) {
      document.body.className += " beta-mode";
    }
    document.body.setAttribute("data-beta-mode", "on");
  }

  var base = typeof window.SITE_BASE === "string" && window.SITE_BASE ? window.SITE_BASE : "/";
  if (!base.endsWith("/")) base += "/";
  var betaHref = base + "css/beta.css";

  function ensureBetaStylesheet() {
    if (document.querySelector('link[data-beta-stylesheet]')) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = betaHref;
    link.setAttribute("data-beta-stylesheet", "true");
    (document.head || document.getElementsByTagName("head")[0]).appendChild(link);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      markBody();
      ensureBetaStylesheet();
    });
  } else {
    markBody();
    ensureBetaStylesheet();
  }
})();
