/**
 * canvasState.js — Canvas State Module
 * Manages DOM references, board identity, scale/zoom, canvas resizing,
 * scroll/hash handling, and board name localStorage persistence.
 */
(function () {
  "use strict";

  // ── DOM References ──
  Tools.board = document.getElementById("board");
  Tools.svg = document.getElementById("canvas");
  Tools.drawingArea = Tools.svg.getElementById("drawingArea");

  // ── Board Identity ──
  Tools.isBookMode = document.body.classList.contains("book-mode");
  Tools.isIE = /MSIE|Trident/.test(window.navigator.userAgent);

  Tools.boardName = (function () {
    var path = window.location.pathname.split("/");
    return decodeURIComponent(path[path.length - 1]);
  })();

  Tools.token = (function () {
    var url = new URL(window.location);
    var params = new URLSearchParams(url.search);
    return params.get("token");
  })();

  // ── Scale / Zoom ──
  Tools.scale = 1.0;
  var scaleTimeout = null;

  Tools.setScale = function setScale(scale) {
    var minScale, maxScale;
    if (Tools.isBookMode) {
      // In book mode, allow zooming from 50% to 300% of the A4 page
      minScale = 0.5;
      maxScale = 3;
    } else {
      var fullScale =
        Math.max(window.innerWidth, window.innerHeight) /
        Tools.server_config.MAX_BOARD_SIZE;
      minScale = Math.max(0.1, fullScale);
      maxScale = 10;
    }
    if (isNaN(scale)) scale = 1;
    scale = Math.max(minScale, Math.min(maxScale, scale));

    var target = Tools.isBookMode ? Tools.board : Tools.svg;
    target.style.willChange = "transform";
    target.style.transform = "scale(" + scale + ")";
    clearTimeout(scaleTimeout);
    scaleTimeout = setTimeout(function () {
      target.style.willChange = "auto";
    }, 1000);
    Tools.scale = scale;
    return scale;
  };

  Tools.getScale = function getScale() {
    return Tools.scale;
  };

  // ── Canvas Resize (message hook) ──
  function resizeCanvas(m) {
    if (Tools.isBookMode) return;
    var x = m.x | 0,
      y = m.y | 0;
    var MAX_BOARD_SIZE = Tools.server_config.MAX_BOARD_SIZE || 65536;
    if (x > Tools.svg.width.baseVal.value - 2000) {
      Tools.svg.width.baseVal.value = Math.min(x + 2000, MAX_BOARD_SIZE);
    }
    if (y > Tools.svg.height.baseVal.value - 2000) {
      Tools.svg.height.baseVal.value = Math.min(y + 2000, MAX_BOARD_SIZE);
    }
  }
  Tools.messageHooks.push(resizeCanvas);

  // ── Initial SVG size (skip in book mode — A4 is fixed) ──
  if (!Tools.isBookMode) {
    Tools.svg.width.baseVal.value = document.body.clientWidth;
    Tools.svg.height.baseVal.value = document.body.clientHeight;
  }

  // ── Scroll / Hash Handling ──
  (function () {
    var scrollTimeout,
      lastStateUpdate = Date.now();

    window.addEventListener("scroll", function onScroll() {
      var scale = Tools.getScale();
      var x = document.documentElement.scrollLeft / scale,
        y = document.documentElement.scrollTop / scale;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function updateHistory() {
        var hash =
          "#" + (x | 0) + "," + (y | 0) + "," + Tools.getScale().toFixed(1);
        if (
          Date.now() - lastStateUpdate > 5000 &&
          hash !== window.location.hash
        ) {
          window.history.pushState({}, "", hash);
          lastStateUpdate = Date.now();
        } else {
          window.history.replaceState({}, "", hash);
        }
      }, 100);
    });

    function setScrollFromHash() {
      var coords = window.location.hash.slice(1).split(",");
      var x = coords[0] | 0;
      var y = coords[1] | 0;
      var scale = parseFloat(coords[2]);
      resizeCanvas({ x: x, y: y });
      Tools.setScale(scale);
      window.scrollTo(x * scale, y * scale);
    }

    window.addEventListener("hashchange", setScrollFromHash, false);
    window.addEventListener("popstate", setScrollFromHash, false);
    window.addEventListener("DOMContentLoaded", setScrollFromHash, false);
  })();

  // ── Board Name LocalStorage ──
  function saveBoardNametoLocalStorage() {
    if (Tools.isBookMode) return;
    var boardName = Tools.boardName;
    if (boardName.toLowerCase() === "anonymous") return;
    if (boardName.indexOf("book~") === 0) return;
    var recentBoards,
      key = "recent-boards";
    try {
      recentBoards = JSON.parse(localStorage.getItem(key));
      if (!Array.isArray(recentBoards)) throw new Error("Invalid type");
    } catch (e) {
      recentBoards = [];
      console.log("Board history loading error", e);
    }
    recentBoards = recentBoards.filter(function (name) {
      return name !== boardName;
    });
    recentBoards.unshift(boardName);
    recentBoards = recentBoards.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(recentBoards));
  }
  window.addEventListener("pageshow", saveBoardNametoLocalStorage);
})();
