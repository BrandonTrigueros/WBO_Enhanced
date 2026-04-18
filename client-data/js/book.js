/**
 * WBO Enhanced — Book (A4 notebook) page management
 * Runs AFTER board.js. Uses the same socket and drawing engine.
 *
 * Each page is a regular WBO board with name: book~{bookName}~p{pageNum}
 * Metadata (page count) is managed server-side via /api/books/{name}/meta
 */
(function () {
  "use strict";

  // ---- Config from server-injected JSON ----
  var bookConfig = JSON.parse(
    document.getElementById("bookConfig").textContent,
  );
  var bookName = bookConfig.bookName;
  var bookUri = bookConfig.bookUriComponent;
  var currentPage = bookConfig.currentPage || 1;
  var pageCount = 1; // will be updated from server

  // ---- DOM refs ----
  var prevBtn = document.getElementById("prevPage");
  var nextBtn = document.getElementById("nextPage");
  var addBtn = document.getElementById("addPageBtn");
  var deleteBtn = document.getElementById("deletePageBtn");
  var pageNumDisplay = document.getElementById("pageNumDisplay");
  var pageTotalDisplay = document.getElementById("pageTotalDisplay");

  // ---- Helpers ----

  /** Construct the board name for a given page number */
  function pageBoardName(page) {
    return "book~" + bookName + "~p" + page;
  }

  /** Base path for API calls (handles reverse-proxy prefix) */
  function apiBase() {
    var prefix = window.location.pathname.replace(/\/books\/.*/, "");
    return prefix + "/api/books/" + encodeURIComponent(bookUri);
  }

  /** Fetch book metadata from server */
  function fetchMeta(callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", apiBase() + "/meta");
    xhr.onload = function () {
      if (xhr.status === 200) {
        var meta = JSON.parse(xhr.responseText);
        pageCount = meta.pageCount || 1;
        if (callback) callback(meta);
      }
    };
    xhr.send();
  }

  /** Update the page indicator and button states */
  function updateUI() {
    pageNumDisplay.textContent = currentPage;
    pageTotalDisplay.textContent = pageCount;
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= pageCount;
    deleteBtn.disabled = pageCount <= 1;
  }

  /**
   * Clear the drawing area (local) before switching pages.
   * Does NOT send delete messages — just wipes the local SVG.
   */
  function clearLocalCanvas() {
    var drawing = Tools.drawingArea;
    while (drawing.firstChild) {
      drawing.removeChild(drawing.firstChild);
    }
    // Also clear cursors
    var cursors = Tools.svg.getElementById("cursors");
    while (cursors && cursors.firstChild) {
      cursors.removeChild(cursors.firstChild);
    }
  }

  /**
   * Switch to a different page.
   * Leaves the current board room, clears local canvas, joins new room.
   * Fires onBeforeSwitch / onAfterSwitch hooks for extensibility.
   */
  var pageHooks = { onBeforeSwitch: [], onAfterSwitch: [] };

  function switchToPage(page) {
    if (page < 1 || page > pageCount) return;

    // Fire pre-switch hooks (e.g. sidebar refresh of leaving page)
    pageHooks.onBeforeSwitch.forEach(function (fn) {
      fn(currentPage, page);
    });

    currentPage = page;

    // Clear local drawing
    clearLocalCanvas();

    // Show loading indicator
    var loadingEl = document.getElementById("loadingMessage");
    if (loadingEl) loadingEl.classList.remove("hidden");

    // Update the board name for the engine
    var newBoardName = pageBoardName(currentPage);
    Tools.boardName = newBoardName;

    // Ask server for the new page's data
    Tools.socket.emit("getboard", newBoardName);

    // Update UI
    updateUI();

    // Update browser URL without reload
    var url = new URL(window.location);
    if (currentPage === 1) {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", currentPage);
    }
    window.history.replaceState({}, "", url.toString());

    // Fire post-switch hooks (e.g. sidebar highlight)
    pageHooks.onAfterSwitch.forEach(function (fn) {
      fn(currentPage);
    });
  }

  // ---- Event handlers ----

  prevBtn.addEventListener("click", function () {
    switchToPage(currentPage - 1);
  });

  nextBtn.addEventListener("click", function () {
    switchToPage(currentPage + 1);
  });

  addBtn.addEventListener("click", function () {
    addBtn.disabled = true;
    var xhr = new XMLHttpRequest();
    xhr.open("POST", apiBase() + "/addpage");
    xhr.onload = function () {
      addBtn.disabled = false;
      if (xhr.status === 200) {
        var meta = JSON.parse(xhr.responseText);
        pageCount = meta.pageCount;
        if (Tools.pageSidebar) Tools.pageSidebar.rebuild();
        // Navigate to the new page
        switchToPage(pageCount);
      }
    };
    xhr.onerror = function () {
      addBtn.disabled = false;
    };
    xhr.send();
  });

  deleteBtn.addEventListener("click", function () {
    if (pageCount <= 1) return;
    var translations = Tools.i18n;
    var confirmMsg =
      (translations && translations.t("confirm_delete_page")) ||
      "Delete this page? This cannot be undone.";
    if (!confirm(confirmMsg)) return;

    deleteBtn.disabled = true;
    var pageToDelete = currentPage;
    var xhr = new XMLHttpRequest();
    xhr.open("POST", apiBase() + "/deletepage/" + pageToDelete);
    xhr.onload = function () {
      deleteBtn.disabled = false;
      if (xhr.status === 200) {
        var result = JSON.parse(xhr.responseText);
        if (result.deleted) {
          pageCount = result.pageCount;
          if (Tools.pageSidebar) Tools.pageSidebar.rebuild();
          // Stay on same page number, or go back if we deleted the last
          var newPage = Math.min(currentPage, pageCount);
          switchToPage(newPage);
        }
      }
    };
    xhr.onerror = function () {
      deleteBtn.disabled = false;
    };
    xhr.send();
  });

  // Keyboard shortcuts: Left/Right arrows for page navigation (when not in text input)
  window.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowLeft" && e.altKey) {
      e.preventDefault();
      switchToPage(currentPage - 1);
    } else if (e.key === "ArrowRight" && e.altKey) {
      e.preventDefault();
      switchToPage(currentPage + 1);
    }
  });

  // ---- Save book name to localStorage for "Recent Notebooks" ----
  function saveBookNameToLocalStorage() {
    if (bookName.toLowerCase() === "anonymous") return;
    var key = "recent-books";
    var recentBooks;
    try {
      recentBooks = JSON.parse(localStorage.getItem(key));
      if (!Array.isArray(recentBooks)) throw new Error("Invalid");
    } catch (e) {
      recentBooks = [];
    }
    recentBooks = recentBooks.filter(function (name) {
      return name !== bookName;
    });
    recentBooks.unshift(bookName);
    recentBooks = recentBooks.slice(0, 20);
    localStorage.setItem(key, JSON.stringify(recentBooks));
  }
  saveBookNameToLocalStorage();

  // ---- Wire up Page Sidebar (if present) ----
  if (Tools.pageSidebar) {
    Tools.pageSidebar.init({
      pageBoardName: pageBoardName,
      getPageCount: function () {
        return pageCount;
      },
      getCurrentPage: function () {
        return currentPage;
      },
      onPageClick: function (num) {
        switchToPage(num);
      },
    });

    pageHooks.onBeforeSwitch.push(function (leavingPage) {
      Tools.pageSidebar.refreshThumbnail(leavingPage);
    });
    pageHooks.onAfterSwitch.push(function () {
      Tools.pageSidebar.highlightActive();
    });
  }

  // Reset viewport position when switching pages
  if (Tools.resetBookViewport) {
    pageHooks.onAfterSwitch.push(function () {
      Tools.resetBookViewport();
    });
  }

  // ---- Initial load ----
  fetchMeta(function () {
    // Ensure currentPage is valid
    if (currentPage > pageCount) currentPage = pageCount;
    if (currentPage < 1) currentPage = 1;
    updateUI();
    if (Tools.pageSidebar) Tools.pageSidebar.rebuild();
    // Join the correct page board
    switchToPage(currentPage);
  });
})();
