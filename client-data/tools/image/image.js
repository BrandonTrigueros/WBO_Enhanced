/**
 * Image embedding tool.
 *
 * Interaction:
 *   - Select tool → click canvas → file picker opens
 *   - File selected → client-side resize (if > 2048px) → upload → place at click position
 *   - Click-drag on existing image → move it
 *   - Click-drag on resize handle → resize proportionally
 *
 * Element schema (socket message):
 *   { type: "image", id, tool: "Image", src, x, y, width, height, opacity }
 *   { type: "update", id, x, y, width, height }
 */

(function () {
  "use strict";

  var MAX_DIMENSION = 2048;
  var HANDLE_SIZE = 14; // px, visual size of resize handles

  var svg = Tools.svg;
  var curDrag = null; // { id, startX, startY, origX, origY, origW, origH, mode: "move"|"resize" }
  var pendingClick = null; // { x, y } — where to place after upload
  var fileInput = null;

  // ---- File input (hidden, reusable) ----

  function getFileInput() {
    if (!fileInput) {
      fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png,image/jpeg,image/gif,image/webp";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
      fileInput.addEventListener("change", onFileSelected);
    }
    return fileInput;
  }

  function openFilePicker() {
    var input = getFileInput();
    input.value = "";
    input.click();
  }

  // ---- Client-side resize ----

  function resizeIfNeeded(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (w <= MAX_DIMENSION && h <= MAX_DIMENSION) {
          // No resize needed — return original file
          resolve({ blob: file, width: w, height: h });
          return;
        }
        var scale = MAX_DIMENSION / Math.max(w, h);
        var nw = Math.round(w * scale);
        var nh = Math.round(h * scale);
        var canvas = document.createElement("canvas");
        canvas.width = nw;
        canvas.height = nh;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, nw, nh);
        canvas.toBlob(
          function (blob) {
            resolve({ blob: blob, width: nw, height: nh });
          },
          file.type || "image/png",
          0.9,
        );
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // ---- Upload ----

  function uploadImage(boardName, blob, contentType) {
    return fetch("/api/boards/" + encodeURIComponent(boardName) + "/images", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: blob,
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (err) {
          throw new Error(err.error || "Upload failed");
        });
      }
      return res.json();
    });
  }

  // ---- File selected callback ----

  function onFileSelected() {
    var file = fileInput.files && fileInput.files[0];
    if (!file || !pendingClick) return;

    var click = pendingClick;
    pendingClick = null;

    resizeIfNeeded(file).then(function (result) {
      if (!result) {
        console.error("Image: failed to load selected file");
        return;
      }

      // Cap display size to viewport-friendly dimensions
      var displayW = result.width;
      var displayH = result.height;
      var maxDisplay = 600;
      if (displayW > maxDisplay || displayH > maxDisplay) {
        var ds = maxDisplay / Math.max(displayW, displayH);
        displayW = Math.round(displayW * ds);
        displayH = Math.round(displayH * ds);
      }

      var boardName = Tools.boardName || "anonymous";
      uploadImage(boardName, result.blob, file.type || "image/png").then(
        function (data) {
          var id = Tools.generateUID("img");
          Tools.drawAndSend({
            type: "image",
            id: id,
            src: data.path,
            x: click.x,
            y: click.y,
            width: displayW,
            height: displayH,
            opacity: Tools.getOpacity(),
          });
        },
        function (err) {
          console.error("Image upload failed:", err.message);
        },
      );
    });
  }

  // ---- Hit testing ----

  function findImageAt(x, y) {
    var images = Tools.drawingArea.querySelectorAll("image[data-tool='Image']");
    for (var i = images.length - 1; i >= 0; i--) {
      var img = images[i];
      var ix = parseFloat(img.getAttribute("x")) || 0;
      var iy = parseFloat(img.getAttribute("y")) || 0;
      var iw = parseFloat(img.getAttribute("width")) || 0;
      var ih = parseFloat(img.getAttribute("height")) || 0;
      if (x >= ix && x <= ix + iw && y >= iy && y <= iy + ih) {
        return img;
      }
    }
    return null;
  }

  function isOnResizeHandle(x, y, img) {
    var ix = parseFloat(img.getAttribute("x")) || 0;
    var iy = parseFloat(img.getAttribute("y")) || 0;
    var iw = parseFloat(img.getAttribute("width")) || 0;
    var ih = parseFloat(img.getAttribute("height")) || 0;
    var hs = HANDLE_SIZE / Tools.getScale();
    // Bottom-right corner
    return x >= ix + iw - hs && x <= ix + iw + hs && y >= iy + ih - hs && y <= iy + ih + hs;
  }

  // ---- Tool listeners ----

  function press(x, y, evt) {
    evt.preventDefault();

    var img = findImageAt(x, y);
    if (img) {
      var ix = parseFloat(img.getAttribute("x")) || 0;
      var iy = parseFloat(img.getAttribute("y")) || 0;
      var iw = parseFloat(img.getAttribute("width")) || 0;
      var ih = parseFloat(img.getAttribute("height")) || 0;

      if (isOnResizeHandle(x, y, img)) {
        curDrag = {
          id: img.id,
          startX: x,
          startY: y,
          origX: ix,
          origY: iy,
          origW: iw,
          origH: ih,
          aspect: iw / ih,
          mode: "resize",
        };
      } else {
        curDrag = {
          id: img.id,
          startX: x,
          startY: y,
          origX: ix,
          origY: iy,
          origW: iw,
          origH: ih,
          mode: "move",
        };
      }
    } else {
      // Click on empty space — open file picker
      pendingClick = { x: x, y: y };
      openFilePicker();
    }
  }

  function move(x, y, evt) {
    if (!curDrag) return;
    if (evt) evt.preventDefault();

    if (curDrag.mode === "move") {
      var dx = x - curDrag.startX;
      var dy = y - curDrag.startY;
      var msg = {
        type: "update",
        id: curDrag.id,
        x: curDrag.origX + dx,
        y: curDrag.origY + dy,
        width: curDrag.origW,
        height: curDrag.origH,
      };
      Tools.drawAndSend(msg);
    } else if (curDrag.mode === "resize") {
      var dxr = x - curDrag.startX;
      var newW = Math.max(20, curDrag.origW + dxr);
      var newH = newW / curDrag.aspect;
      var msg2 = {
        type: "update",
        id: curDrag.id,
        x: curDrag.origX,
        y: curDrag.origY,
        width: Math.round(newW),
        height: Math.round(newH),
      };
      Tools.drawAndSend(msg2);
    }
  }

  function release(x, y) {
    if (curDrag) {
      move(x, y); // Final position
      curDrag = null;
    }
  }

  // ---- Draw (render incoming messages) ----

  function draw(data) {
    switch (data.type) {
      case "image":
        createImage(data);
        break;
      case "update":
        var el = svg.getElementById(data.id);
        if (el && el.tagName === "image") {
          updateImage(el, data);
        }
        break;
    }
  }

  function createImage(data) {
    var img = svg.getElementById(data.id) || Tools.createSVGElement("image");
    img.id = data.id;
    img.setAttributeNS("http://www.w3.org/1999/xlink", "href", data.src);
    img.setAttribute("x", data.x || 0);
    img.setAttribute("y", data.y || 0);
    img.setAttribute("width", data.width || 100);
    img.setAttribute("height", data.height || 100);
    img.setAttribute("data-tool", "Image");
    img.setAttribute("preserveAspectRatio", "xMidYMid meet");
    if (data.opacity && data.opacity < 1) {
      img.setAttribute("opacity", Math.max(0.1, Math.min(1, data.opacity)));
    }
    Tools.drawingArea.appendChild(img);
  }

  function updateImage(el, data) {
    if (data.x !== undefined) el.setAttribute("x", data.x);
    if (data.y !== undefined) el.setAttribute("y", data.y);
    if (data.width !== undefined) el.setAttribute("width", data.width);
    if (data.height !== undefined) el.setAttribute("height", data.height);
  }

  // ---- Resize handle overlay (CSS-drawn, updates on hover) ----

  var handleOverlay = null;

  function showResizeHandle(img) {
    if (!handleOverlay) {
      handleOverlay = Tools.createSVGElement("rect");
      handleOverlay.setAttribute("class", "image-resize-handle");
      handleOverlay.setAttribute("fill", "#2196F3");
      handleOverlay.setAttribute("stroke", "white");
      handleOverlay.setAttribute("stroke-width", "1");
      handleOverlay.style.cursor = "nwse-resize";
      handleOverlay.style.pointerEvents = "none";
    }
    var ix = parseFloat(img.getAttribute("x")) || 0;
    var iy = parseFloat(img.getAttribute("y")) || 0;
    var iw = parseFloat(img.getAttribute("width")) || 0;
    var ih = parseFloat(img.getAttribute("height")) || 0;
    var hs = HANDLE_SIZE / Tools.getScale();
    handleOverlay.setAttribute("x", ix + iw - hs);
    handleOverlay.setAttribute("y", iy + ih - hs);
    handleOverlay.setAttribute("width", hs * 2);
    handleOverlay.setAttribute("height", hs * 2);
    Tools.drawingArea.appendChild(handleOverlay);
  }

  function hideResizeHandle() {
    if (handleOverlay && handleOverlay.parentNode) {
      handleOverlay.parentNode.removeChild(handleOverlay);
    }
  }

  // ---- Tool registration ----

  var imageTool = {
    name: "Image",
    shortcut: "i",
    listeners: {
      press: press,
      move: move,
      release: release,
    },
    draw: draw,
    mouseCursor: "crosshair",
    icon: "tools/image/icon.svg",
    stylesheet: "tools/image/image.css",
    onstart: function () {
      // Show resize handles when hovering images
      svg.addEventListener("mousemove", onCanvasHover);
    },
    onquit: function () {
      svg.removeEventListener("mousemove", onCanvasHover);
      hideResizeHandle();
    },
  };

  function onCanvasHover(evt) {
    var scale = Tools.getScale();
    var rect = svg.getBoundingClientRect();
    var x, y;
    if (Tools.isBookMode) {
      x = (evt.clientX - rect.left) * (svg.width.baseVal.value / rect.width);
      y = (evt.clientY - rect.top) * (svg.height.baseVal.value / rect.height);
    } else {
      x = evt.pageX / scale;
      y = evt.pageY / scale;
    }
    var img = findImageAt(x, y);
    if (img) {
      showResizeHandle(img);
    } else {
      hideResizeHandle();
    }
  }

  Tools.add(imageTool);
})();
