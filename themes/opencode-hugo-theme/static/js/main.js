/* Mobile navigation, persistent colour mode, and theme-aware images. */
(function () {
  "use strict";

  var root = document.documentElement;
  var navToggle = document.querySelector(".nav-toggle");
  var overlay = document.querySelector(".nav-overlay");
  var closeButton = document.querySelector(".nav-overlay-close");
  var overlayLinks = document.querySelectorAll(".nav-overlay-links a");
  var themeToggles = document.querySelectorAll(".theme-toggle");

  function currentTheme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }

  function renderTheme() {
    var isLight = currentTheme() === "light";

    document.querySelectorAll(".theme-illustration__image").forEach(function (image) {
      var source = isLight ? image.dataset.lightSrc : image.dataset.darkSrc;
      if (source && image.getAttribute("src") !== source) image.setAttribute("src", source);
    });

    themeToggles.forEach(function (button) {
      var label = isLight ? "Switch to dark mode" : "Switch to light mode";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.querySelector("span").textContent = isLight ? "☾" : "☼";
    });
  }

  themeToggles.forEach(function (button) {
    button.addEventListener("click", function () {
      var nextTheme = currentTheme() === "light" ? "dark" : "light";
      root.dataset.theme = nextTheme;
      try { localStorage.setItem("theme", nextTheme); } catch (_) {}
      renderTheme();
    });
  });

  function openMenu() {
    overlay.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    if (overlayLinks.length) overlayLinks[0].focus();
  }

  function closeMenu() {
    overlay.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    navToggle.focus();
  }

  if (navToggle && overlay && closeButton) {
    navToggle.addEventListener("click", openMenu);
    closeButton.addEventListener("click", closeMenu);
    overlayLinks.forEach(function (link) { link.addEventListener("click", closeMenu); });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && overlay.classList.contains("is-open")) closeMenu();
    });

    overlay.addEventListener("keydown", function (event) {
      if (event.key !== "Tab" || !overlay.classList.contains("is-open")) return;
      var focusable = overlay.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  renderTheme();
})();
