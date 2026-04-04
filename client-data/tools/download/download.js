/**
 *                        WHITEBOPHIR
 *********************************************************
 * @licstart  The following is the entire license notice for the
 *  JavaScript code in this page.
 *
 * Copyright (C) 2020  Ophir LOJKINE
 *
 *
 * The JavaScript code in this page is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License (GNU GPL) as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.  The code is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
 *
 * As additional permission under GNU GPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * @licend
 */

(function download() {
  //Code isolation

  var selectedFormat = "svg";
  var selectedScope = "current"; // "current" or "all"
  var isBookMode = !!document.getElementById("bookConfig");

  // ---- Build popup DOM ----
  var overlay = document.createElement("div");
  overlay.id = "exportOverlay";

  var popup = document.createElement("div");
  popup.id = "exportPopup";

  // Title
  var title = document.createElement("h3");
  title.textContent = "Export";
  popup.appendChild(title);

  // Format row
  var formatRow = document.createElement("div");
  formatRow.className = "export-row";
  var formatLabel = document.createElement("label");
  formatLabel.textContent = "Format";
  formatRow.appendChild(formatLabel);
  var formatOpts = document.createElement("div");
  formatOpts.className = "export-options";
  ["SVG", "PNG", "PDF"].forEach(function (fmt) {
    var btn = document.createElement("button");
    btn.textContent = fmt;
    btn.dataset.format = fmt.toLowerCase();
    if (fmt.toLowerCase() === selectedFormat) btn.classList.add("selected");
    btn.addEventListener("click", function () {
      selectedFormat = fmt.toLowerCase();
      formatOpts.querySelectorAll("button").forEach(function (b) {
        b.classList.remove("selected");
      });
      btn.classList.add("selected");
    });
    formatOpts.appendChild(btn);
  });
  formatRow.appendChild(formatOpts);
  popup.appendChild(formatRow);

  // Scope row (only in book mode)
  var scopeRow = document.createElement("div");
  scopeRow.className = "export-row";
  if (!isBookMode) scopeRow.style.display = "none";
  var scopeLabel = document.createElement("label");
  scopeLabel.textContent = "Pages";
  scopeRow.appendChild(scopeLabel);
  var scopeOpts = document.createElement("div");
  scopeOpts.className = "export-options";
  [
    { label: "Current page", value: "current" },
    { label: "All pages", value: "all" },
  ].forEach(function (opt) {
    var btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.dataset.scope = opt.value;
    if (opt.value === selectedScope) btn.classList.add("selected");
    btn.addEventListener("click", function () {
      selectedScope = opt.value;
      scopeOpts.querySelectorAll("button").forEach(function (b) {
        b.classList.remove("selected");
      });
      btn.classList.add("selected");
    });
    scopeOpts.appendChild(btn);
  });
  scopeRow.appendChild(scopeOpts);
  popup.appendChild(scopeRow);

  // Download button
  var dlBtn = document.createElement("button");
  dlBtn.id = "exportDownloadBtn";
  dlBtn.textContent = "Download";
  dlBtn.addEventListener("click", doExport);
  popup.appendChild(dlBtn);

  // Cancel button
  var cancelBtn = document.createElement("button");
  cancelBtn.id = "exportCancelBtn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", hidePopup);
  popup.appendChild(cancelBtn);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Close on overlay click (outside popup)
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) hidePopup();
  });

  function showPopup() {
    overlay.classList.add("visible");
  }

  function hidePopup() {
    overlay.classList.remove("visible");
  }

  // ---- Export logic ----

  function doExport() {
    if (selectedFormat === "svg" && selectedScope === "current") {
      downloadSvgClientSide();
      hidePopup();
      return;
    }
    // Server-side export
    var url = buildExportUrl();
    if (!url) return;
    triggerDownload(url);
    hidePopup();
  }

  /** Client-side SVG export (instant, no server roundtrip) */
  function downloadSvgClientSide() {
    var canvasCopy = Tools.svg.cloneNode(true);
    canvasCopy.removeAttribute("style", "");
    var styleNode = document.createElement("style");
    styleNode.innerHTML = Array.from(document.styleSheets)
      .filter(function (stylesheet) {
        if (
          stylesheet.href &&
          (stylesheet.href.match(/boards\/tools\/.*\.css/) ||
            stylesheet.href.match(/board\.css/))
        ) {
          return true;
        }
        return false;
      })
      .map(function (stylesheet) {
        return Array.from(stylesheet.cssRules).map(function (rule) {
          return rule.cssText;
        });
      })
      .join("\n");
    canvasCopy.appendChild(styleNode);
    var outerHTML =
      canvasCopy.outerHTML || new XMLSerializer().serializeToString(canvasCopy);
    var blob = new Blob([outerHTML], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, Tools.boardName + ".svg");
  }

  /** Build the server-side export URL based on current selections */
  function buildExportUrl() {
    var prefix = window.location.pathname.replace(/\/(boards|books)\/.*/, "");

    if (isBookMode && selectedScope === "all") {
      // Full book export — format determines extension
      var bookEl = document.getElementById("bookConfig");
      var bookConfig = JSON.parse(bookEl.textContent);
      return (
        prefix +
        "/export/book/" +
        encodeURIComponent(bookConfig.bookUriComponent) +
        "." +
        selectedFormat
      );
    }

    // Single board / single book page
    var boardName = Tools.boardName;
    return (
      prefix +
      "/export/board/" +
      encodeURIComponent(boardName) +
      "." +
      selectedFormat
    );
  }

  /** Trigger a file download by creating a temporary link to a server URL */
  function triggerDownload(url) {
    var a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /** Download a blob as a file */
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  Tools.add({
    name: "Download",
    shortcut: "d",
    listeners: {},
    icon: "tools/download/download.svg",
    oneTouch: true,
    onstart: showPopup,
    mouseCursor: "crosshair",
  });
})(); //End of code isolation
