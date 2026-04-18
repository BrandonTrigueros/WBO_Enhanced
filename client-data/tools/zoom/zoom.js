/**
 *                        WHITEBOPHIR
 *********************************************************
 * @licstart  The following is the entire license notice for the
 *  JavaScript code in this page.
 *
 * Copyright (C) 2013  Ophir LOJKINE
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

(function () {
  //Code isolation
  var ZOOM_FACTOR = 0.5;
  var origin = {
    scrollX: document.documentElement.scrollLeft,
    scrollY: document.documentElement.scrollTop,
    x: 0.0,
    y: 0.0,
    clientY: 0,
    scale: 1.0,
  };
  var moved = false,
    pressed = false;

  function zoom(origin, scale) {
    if (Tools.isBookMode) {
      Tools.bookZoomAtPoint(scale, origin.viewportX, origin.viewportY);
    } else {
      var oldScale = origin.scale;
      var newScale = Tools.setScale(scale);
      window.scrollTo(
        origin.scrollX + origin.x * (newScale - oldScale),
        origin.scrollY + origin.y * (newScale - oldScale),
      );
    }
  }

  var animation = null;
  function animate(scale) {
    cancelAnimationFrame(animation);
    animation = requestAnimationFrame(function () {
      zoom(origin, scale);
    });
  }

  function setOrigin(x, y, evt) {
    origin.scrollX = document.documentElement.scrollLeft;
    origin.scrollY = document.documentElement.scrollTop;
    origin.x = x;
    origin.y = y;
    origin.clientY = getClientY(evt);
    origin.scale = Tools.getScale();
    origin.viewportX = evt.clientX;
    origin.viewportY = evt.clientY;
  }

  function press(x, y, evt) {
    evt.preventDefault();
    setOrigin(x, y, evt);
    moved = false;
    pressed = true;
  }

  function move(x, y, evt) {
    if (pressed) {
      evt.preventDefault();
      var delta = getClientY(evt) - origin.clientY;
      var scale = origin.scale * (1 + (delta * ZOOM_FACTOR) / 100);
      if (Math.abs(delta) > 1) moved = true;
      animation = animate(scale);
    }
  }

  function onwheel(evt) {
    var multiplier =
      evt.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 30
        : evt.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 1000
          : 1;
    var deltaX = evt.deltaX * multiplier,
      deltaY = evt.deltaY * multiplier;
    if (evt.ctrlKey) {
      // Ctrl+Scroll = zoom (or trackpad pinch, which the browser maps here)
      evt.preventDefault();
      if (Tools.isBookMode) {
        Tools.bookZoomAtPoint(
          (1 - deltaY / 800) * Tools.getScale(),
          evt.clientX,
          evt.clientY,
        );
      } else {
        var scale = Tools.getScale();
        var x = evt.pageX / scale;
        var y = evt.pageY / scale;
        setOrigin(x, y, evt);
        animate((1 - deltaY / 800) * Tools.getScale());
      }
    } else if (evt.altKey) {
      // Alt+Scroll = change tool size (Shift for finer control)
      evt.preventDefault();
      var change = evt.shiftKey ? 1 : 5;
      Tools.setSize(Tools.getSize() - (deltaY / 100) * change);
    } else if (Tools.isBookMode) {
      // In book mode, plain scroll pans the viewport
      evt.preventDefault();
      Tools.bookPan.x -= deltaX;
      Tools.bookPan.y -= deltaY;
      Tools.applyBookTransform();
    } else {
      // Plain scroll — let the browser handle it natively
      return;
    }
  }

  // Event target: wrapper covers full viewport in book mode
  var eventTarget = Tools.isBookMode
    ? document.getElementById("a4-page-wrapper") || Tools.board
    : Tools.board;
  eventTarget.addEventListener("wheel", onwheel, { passive: false });

  // ── Pinch-to-zoom via Pointer Events ──
  var pinchPointers = {};
  var pinchActive = false;

  function pinchDistance() {
    var ids = Object.keys(pinchPointers);
    if (ids.length < 2) return 0;
    var p1 = pinchPointers[ids[0]],
      p2 = pinchPointers[ids[1]];
    var dx = p1.clientX - p2.clientX,
      dy = p1.clientY - p2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function onPinchPointerDown(evt) {
    if (evt.pointerType !== "touch") return;
    pinchPointers[evt.pointerId] = evt;
  }

  function onPinchPointerMove(evt) {
    if (evt.pointerType !== "touch") return;
    pinchPointers[evt.pointerId] = evt;

    var ids = Object.keys(pinchPointers);
    if (ids.length === 2) {
      var p1 = pinchPointers[ids[0]],
        p2 = pinchPointers[ids[1]];
      var distance = pinchDistance();

      if (!pinchActive) {
        pinchActive = true;
        origin.scale = Tools.getScale();
        origin.distance = distance;
      }

      var delta = distance - origin.distance;
      var newScale = origin.scale * (1 + (delta * ZOOM_FACTOR) / 100);

      if (Tools.isBookMode) {
        var vpX = (p1.clientX + p2.clientX) / 2;
        var vpY = (p1.clientY + p2.clientY) / 2;
        Tools.bookZoomAtPoint(newScale, vpX, vpY);
      } else {
        var x = (p1.pageX + p2.pageX) / 2 / Tools.getScale(),
          y = (p1.pageY + p2.pageY) / 2 / Tools.getScale();
        if (!origin.pinchInitialized) {
          setOrigin(x, y, p1);
          origin.distance = distance;
          origin.pinchInitialized = true;
        }
        animate(newScale);
      }
    }
  }

  function onPinchPointerUp(evt) {
    if (evt.pointerType !== "touch") return;
    delete pinchPointers[evt.pointerId];
    if (Object.keys(pinchPointers).length < 2) {
      pinchActive = false;
      origin.pinchInitialized = false;
    }
  }

  eventTarget.addEventListener("pointerdown", onPinchPointerDown);
  eventTarget.addEventListener("pointermove", onPinchPointerMove);
  eventTarget.addEventListener("pointerup", onPinchPointerUp);
  eventTarget.addEventListener("pointercancel", onPinchPointerUp);

  function release(x, y, evt) {
    if (pressed && !moved) {
      var delta = evt.shiftKey === true ? -1 : 1;
      var scale = Tools.getScale() * (1 + delta * ZOOM_FACTOR);
      zoom(origin, scale);
    }
    pressed = false;
  }

  function key(down) {
    return function (evt) {
      if (evt.key === "Shift") {
        Tools.svg.style.cursor = "zoom-" + (down ? "out" : "in");
      }
    };
  }

  function getClientY(evt) {
    return evt.clientY;
  }

  var keydown = key(true);
  var keyup = key(false);

  function onstart() {
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
  }
  function onquit() {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
  }

  var zoomTool = {
    name: "Zoom",
    shortcut: "z",
    listeners: {
      press: press,
      move: move,
      release: release,
    },
    onstart: onstart,
    onquit: onquit,
    mouseCursor: "zoom-in",
    icon: "tools/zoom/icon.svg",
    helpText: "click_to_zoom",
    showMarker: true,
  };
  Tools.add(zoomTool);
})(); //End of code isolation
