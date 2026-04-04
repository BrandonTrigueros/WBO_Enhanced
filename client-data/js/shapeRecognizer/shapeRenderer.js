/**
 * Shape Renderer — replaces a freehand SVG path with a clean geometric shape.
 *
 * Given a recognized shape descriptor and the ID of the freehand path,
 * deletes the original and creates the appropriate SVG element(s) using
 * the existing WBO drawing tools.
 *
 * Depends on: Tools (global)
 */
var ShapeRenderer = (function () {
  "use strict";

  /**
   * Map a shape descriptor to tool draw calls.
   * Each handler receives (shape, color, size, opacity) and returns
   * the ID of the first created element (for visual feedback).
   */
  var handlers = {
    line: function (shape, color, size, opacity) {
      var id = Tools.generateUID("s");
      var tool = Tools.list["Straight line"];
      if (!tool) return null;
      Tools.drawAndSend(
        {
          type: "straight",
          id: id,
          color: color,
          size: size,
          opacity: opacity,
          x: shape.x1,
          y: shape.y1,
          x2: shape.x2,
          y2: shape.y2,
        },
        tool,
      );
      return id;
    },

    rectangle: function (shape, color, size, opacity) {
      var id = Tools.generateUID("r");
      var tool = Tools.list["Rectangle"];
      if (!tool) return null;
      var v = shape.vertices;
      var xs = v.map(function (p) {
        return p.x;
      });
      var ys = v.map(function (p) {
        return p.y;
      });
      Tools.drawAndSend(
        {
          type: "rect",
          id: id,
          color: color,
          size: size,
          opacity: opacity,
          x: Math.min.apply(null, xs),
          y: Math.min.apply(null, ys),
          x2: Math.max.apply(null, xs),
          y2: Math.max.apply(null, ys),
        },
        tool,
      );
      return id;
    },

    circle: function (shape, color, size, opacity) {
      var id = Tools.generateUID("e");
      var tool = Tools.list["Ellipse"];
      if (!tool) return null;
      Tools.drawAndSend(
        {
          type: "ellipse",
          id: id,
          color: color,
          size: size,
          opacity: opacity,
          x: shape.cx - shape.r,
          y: shape.cy - shape.r,
          x2: shape.cx + shape.r,
          y2: shape.cy + shape.r,
        },
        tool,
      );
      return id;
    },

    triangle: function (shape, color, size, opacity) {
      var tool = Tools.list["Straight line"];
      if (!tool) return null;
      var verts = shape.vertices; // [v0, v1, v2, v0copy]
      var firstId = null;
      for (var i = 0; i < 3; i++) {
        var id = Tools.generateUID("s");
        if (i === 0) firstId = id;
        Tools.drawAndSend(
          {
            type: "straight",
            id: id,
            color: color,
            size: size,
            opacity: opacity,
            x: verts[i].x,
            y: verts[i].y,
            x2: verts[i + 1].x,
            y2: verts[i + 1].y,
          },
          tool,
        );
      }
      return firstId;
    },
  };

  /**
   * Replace a freehand path with the recognized shape.
   * @param {string} pathId — SVG element ID of the freehand path
   * @param {object} shape  — descriptor from ShapeRecognizer.recognize()
   * @returns {string|null} — ID of first new element, or null on failure
   */
  function replace(pathId, shape) {
    var pathElem = Tools.svg.getElementById(pathId);
    if (!pathElem) return null;

    // Extract style from the freehand path
    var color = pathElem.getAttribute("stroke") || "#000000";
    var size = parseFloat(pathElem.getAttribute("stroke-width")) || 2;
    var opacity = parseFloat(pathElem.getAttribute("opacity")) || 1;

    // Delete the freehand path
    var eraserTool = Tools.list["Eraser"];
    if (eraserTool) {
      Tools.drawAndSend({ type: "delete", id: pathId }, eraserTool);
    }

    // Create the clean shape
    var handler = handlers[shape.type];
    if (!handler) return null;
    var newId = handler(shape, color, size, opacity);

    // Brief visual pulse on the new element
    if (newId) {
      setTimeout(function () {
        var el = Tools.svg.getElementById(newId);
        if (el) {
          el.style.transition = "filter 0.3s";
          el.style.filter = "drop-shadow(0 0 6px rgba(0,116,217,0.6))";
          setTimeout(function () {
            el.style.filter = "";
            setTimeout(function () {
              el.style.transition = "";
            }, 300);
          }, 400);
        }
      }, 50);
    }

    return newId;
  }

  return { replace: replace };
})();
