/**
 * shapes.js — Shapes toolbar dropdown
 *
 * Creates a single toolbar button that opens a small popup with
 * Line / Rectangle / Ellipse.  Selecting one activates that real
 * drawing tool; the Shapes button shows the icon of the active shape
 * and stays highlighted while any shape tool is in use.
 */
(function () {
  "use strict";

  var shapeNames = ["Straight line", "Rectangle", "Ellipse"];
  var shapeIcons = {
    "Straight line": "tools/line/icon.svg",
    Rectangle: "tools/rect/icon.svg",
    Ellipse: "tools/ellipse/icon-ellipse.svg",
  };
  var currentShape = "Straight line";
  var shapesToolBtn = null;

  /* ── Build the popup ─────────────────────────── */
  var popup = document.createElement("div");
  popup.className = "shapesPopup hidden";
  popup.id = "shapesPopup";

  shapeNames.forEach(function (name) {
    var btn = document.createElement("button");
    btn.className = "shapesPopup-btn";
    btn.title = name;
    btn.dataset.shape = name;
    var img = document.createElement("img");
    img.src = shapeIcons[name];
    img.width = 28;
    img.height = 28;
    img.alt = name;
    btn.appendChild(img);
    popup.appendChild(btn);
  });

  /* ── Helpers ─────────────────────────────────── */
  function isShapeTool(toolName) {
    return shapeNames.indexOf(toolName) !== -1;
  }

  function highlightShapesBtn(on) {
    if (!shapesToolBtn) return;
    if (on) shapesToolBtn.classList.add("curTool");
    else shapesToolBtn.classList.remove("curTool");
  }

  function updateIcon(name) {
    if (!shapesToolBtn) return;
    var icon = shapesToolBtn.querySelector("img.tool-icon");
    if (icon) icon.src = shapeIcons[name];
  }

  function selectShape(name) {
    currentShape = name;
    updateIcon(name);
    popup.classList.add("hidden");
    Tools.change(name);
    highlightShapesBtn(true);
  }

  /* ── Popup click ─────────────────────────────── */
  popup.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".shapesPopup-btn");
    if (!btn) return;
    var name = btn.dataset.shape;
    if (name && Tools.list[name]) selectShape(name);
  });

  /* ── Close popup on outside click ────────────── */
  document.addEventListener("pointerdown", function (evt) {
    if (
      !popup.contains(evt.target) &&
      (!shapesToolBtn || !shapesToolBtn.contains(evt.target))
    ) {
      popup.classList.add("hidden");
    }
  });

  /* ── Hook into Tools.change to track highlight ─ */
  var _origChange = Tools.change;
  Tools.change = function (toolName) {
    _origChange.apply(this, arguments);
    highlightShapesBtn(isShapeTool(toolName));
  };

  /* ── Build toolbar button manually ───────────── */
  setTimeout(function () {
    var toolsList = document.getElementById("tools");
    if (!toolsList) return;

    // Create <li> matching the tool template structure
    var el = document.createElement("li");
    el.className = "tool";
    el.id = "toolID-Shapes";
    el.tabIndex = -1;
    el.title = "Shapes (s)";

    var iconImg = document.createElement("img");
    iconImg.className = "tool-icon";
    iconImg.width = 35;
    iconImg.height = 35;
    iconImg.src = shapeIcons[currentShape];
    iconImg.alt = "Shapes";
    el.appendChild(iconImg);

    var nameSpan = document.createElement("span");
    nameSpan.className = "tool-name";
    nameSpan.textContent = "Shapes";
    el.appendChild(nameSpan);

    el.style.position = "relative";
    el.appendChild(popup);

    el.addEventListener("click", function (e) {
      e.stopPropagation();
      if (popup.classList.contains("hidden")) {
        popup.classList.remove("hidden");
      } else {
        popup.classList.add("hidden");
      }
      // If no shape is active yet, activate the current one
      if (!isShapeTool((Tools.curTool || {}).name)) {
        selectShape(currentShape);
      }
    });

    // Insert after the 2nd rendered tool button (Pencil=0, Eraser=1 → position 2)
    var items = toolsList.querySelectorAll("li.tool");
    var refNode = items[2] || null;
    toolsList.insertBefore(el, refNode);

    shapesToolBtn = el;

    // Keyboard shortcut
    document.addEventListener("keydown", function (evt) {
      if (
        evt.key === "s" &&
        !evt.ctrlKey &&
        !evt.altKey &&
        !evt.metaKey &&
        document.activeElement === document.body
      ) {
        selectShape(currentShape);
      }
    });
  }, 0);
})();
