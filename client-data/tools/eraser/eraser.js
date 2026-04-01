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

(function eraser() {
  //Code isolation

  var erasing = false;
  // Track previous client-space position for sweep interpolation
  var lastClientX = null,
    lastClientY = null;

  function startErasing(x, y, evt) {
    //Prevent the press from being interpreted by the browser
    evt.preventDefault();
    erasing = true;
    lastClientX = null;
    lastClientY = null;
    erase(x, y, evt);
  }

  var msg = {
    type: "delete",
    id: "",
  };

  function inDrawingArea(elem) {
    return Tools.drawingArea.contains(elem);
  }

  function eraseAtPoint(cx, cy, alreadyDeleted) {
    var target = document.elementFromPoint(cx, cy);
    if (
      target &&
      target !== Tools.svg &&
      target !== Tools.drawingArea &&
      inDrawingArea(target) &&
      target.id &&
      !alreadyDeleted[target.id]
    ) {
      alreadyDeleted[target.id] = true;
      msg.id = target.id;
      Tools.drawAndSend(msg);
    }
  }

  function erase(x, y, evt) {
    if (!erasing) return;

    var clientX, clientY;
    if (evt.type === "touchmove" || evt.type === "touchstart") {
      var touch = evt.touches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = evt.clientX;
      clientY = evt.clientY;
    }

    var deleted = {};

    // Interpolate between last position and current to catch fast strokes
    if (lastClientX !== null) {
      var dx = clientX - lastClientX;
      var dy = clientY - lastClientY;
      var dist = Math.hypot(dx, dy);
      // Sample every 3 CSS pixels for reliable hit-testing
      var steps = Math.max(1, Math.ceil(dist / 3));
      for (var i = 0; i <= steps; i++) {
        var t = i / steps;
        eraseAtPoint(
          lastClientX + dx * t,
          lastClientY + dy * t,
          deleted,
        );
      }
    } else {
      eraseAtPoint(clientX, clientY, deleted);
    }

    lastClientX = clientX;
    lastClientY = clientY;
  }

  function stopErasing() {
    erasing = false;
    lastClientX = null;
    lastClientY = null;
  }

  function draw(data) {
    var elem;
    switch (data.type) {
      //TODO: add the ability to erase only some points in a line
      case "delete":
        elem = svg.getElementById(data.id);
        if (elem === null)
          console.error(
            "Eraser: Tried to delete an element that does not exist.",
          );
        else Tools.drawingArea.removeChild(elem);
        break;
      default:
        console.error("Eraser: 'delete' instruction with unknown type. ", data);
        break;
    }
  }

  var svg = Tools.svg;

  Tools.add({
    //The new tool
    name: "Eraser",
    shortcut: "e",
    listeners: {
      press: startErasing,
      move: erase,
      release: stopErasing,
    },
    draw: draw,
    icon: "tools/eraser/icon.svg",
    mouseCursor: "crosshair",
    showMarker: true,
  });
})(); //End of code isolation
