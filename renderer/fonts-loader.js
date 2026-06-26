/**
 * İkon fontları yüklenene kadar ligature metinlerini (school, lock…) gizler.
 */
(function () {
  const root = document.documentElement;
  root.classList.add("fonts-loading");

  function markReady() {
    root.classList.remove("fonts-loading");
    root.classList.add("fonts-ready");
  }

  function waitFonts() {
    if (!document.fonts || !document.fonts.load) {
      markReady();
      return;
    }
    const loads = [
      document.fonts.load("24px Material Symbols Outlined"),
      document.fonts.load("400 24px Manrope")
    ];
    Promise.all(loads)
      .then(markReady)
      .catch(markReady);
    document.fonts.ready.then(markReady);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitFonts);
  } else {
    waitFonts();
  }

  setTimeout(markReady, 4000);
})();
