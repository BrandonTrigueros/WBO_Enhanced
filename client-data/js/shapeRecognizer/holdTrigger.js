/**
 * Shape Recognition Trigger — pen-up recognition.
 *
 * Collects points while the pencil draws, then on pen-up (stroke end)
 * runs the recognizer. If a shape is found, the freehand path is replaced
 * with a clean geometric element. Same approach as Xournal++.
 *
 * Depends on: ShapeRecognizer, ShapeRecConfig, Tools (global)
 */
(function shapeTrigger() {
  "use strict";

  var collectedPoints = [];
  var currentLineId = "";
  var isActive = false;

  /** Called by pencil's startLine — begin collecting points. */
  function onStrokeStart(lineId) {
    currentLineId = lineId;
    collectedPoints = [];
    isActive = true;
  }

  /** Called by pencil's continueLine — collect the point. */
  function onStrokePoint(x, y) {
    if (!isActive) return;
    collectedPoints.push({ x: x, y: y });
  }

  /** Called by pencil's stopLine — run recognition, then clean up. */
  function onStrokeEnd() {
    if (isActive && currentLineId && collectedPoints.length >= 3) {
      var result = ShapeRecognizer.recognize(collectedPoints);
      if (result) {
        replaceWithShape(currentLineId, result);
      }
    }
    isActive = false;
    collectedPoints = [];
    currentLineId = "";
  }

  /**
   * Replace a freehand <path> element with the recognized shape.
   * Sends delete + create messages so all clients see the new shape.
   */
  function replaceWithShape(pathId, shape) {
    var pathElem = Tools.svg.getElementById(pathId);
    if (!pathElem) return;

    // Grab style from the freehand path
    var color = pathElem.getAttribute("stroke") || "#000000";
    var size = parseFloat(pathElem.getAttribute("stroke-width")) || 2;
    var opacity = parseFloat(pathElem.getAttribute("opacity")) || 1;

    // Delete the freehand path (use Eraser tool's draw function)
    var eraserTool = Tools.list["Eraser"];
    if (eraserTool) {
      Tools.drawAndSend({ type: "delete", id: pathId }, eraserTool);
    }

    // Create the clean shape using the appropriate tool
    var newId, shapeMsg;

    switch (shape.type) {
      case "line":
        newId = Tools.generateUID("s");
        shapeMsg = {
          type: "straight",
          id: newId,
          color: color,
          size: size,
          opacity: opacity,
          x: shape.x1,
          y: shape.y1,
          x2: shape.x2,
          y2: shape.y2,
        };
        var lineTool = Tools.list["Straight line"];
        if (lineTool) Tools.drawAndSend(shapeMsg, lineTool);
        break;

      case "rectangle":
        newId = Tools.generateUID("r");
        var v = shape.vertices;
        var xs = v.map(function (p) { return p.x; });
        var ys = v.map(function (p) { return p.y; });
        var xMin = Math.min.apply(null, xs);
        var xMax = Math.max.apply(null, xs);
        var yMin = Math.min.apply(null, ys);
        var yMax = Math.max.apply(null, ys);

        shapeMsg = {
          type: "rect",
          id: newId,
          color: color,
          size: size,
          opacity: opacity,
          x: xMin,
          y: yMin,
          x2: xMax,
          y2: yMax,
        };
        var rectTool = Tools.list["Rectangle"];
        if (rectTool) Tools.drawAndSend(shapeMsg, rectTool);
        break;

      case "circle":
        newId = Tools.generateUID("e");
        shapeMsg = {
          type: "ellipse",
          id: newId,
          color: color,
          size: size,
          opacity: opacity,
          x: shape.cx - shape.r,
          y: shape.cy - shape.r,
          x2: shape.cx + shape.r,
          y2: shape.cy + shape.r,
        };
        var ellipseTool = Tools.list["Ellipse"];
        if (ellipseTool) Tools.drawAndSend(shapeMsg, ellipseTool);
        break;

      case "triangle":
        // Draw as 3 straight line segments (pencil path would Bézier-smooth
        // the 3–4 points into curves, producing a leaf shape).
        var triTool = Tools.list["Straight line"];
        if (!triTool) break;
        var triVerts = shape.vertices; // [v0, v1, v2, v0copy]
        var triIds = [];
        for (var ti = 0; ti < 3; ti++) {
          var segId = Tools.generateUID("s");
          triIds.push(segId);
          Tools.drawAndSend({
            type: "straight",
            id: segId,
            color: color,
            size: size,
            opacity: opacity,
            x:  triVerts[ti].x,
            y:  triVerts[ti].y,
            x2: triVerts[ti + 1].x,
            y2: triVerts[ti + 1].y,
          }, triTool);
        }
        newId = triIds[0]; // used for the glow pulse below
        break;
    }

    // Brief visual pulse on the new element
    setTimeout(function () {
      var newElem = Tools.svg.getElementById(newId);
      if (newElem) {
        newElem.style.transition = "filter 0.3s";
        newElem.style.filter = "drop-shadow(0 0 6px rgba(0,116,217,0.6))";
        setTimeout(function () {
          newElem.style.filter = "";
          setTimeout(function () { newElem.style.transition = ""; }, 300);
        }, 400);
      }
    }, 50);
  }

  // Expose globally for pencil tool integration
  window.ShapeHoldTrigger = {
    onStrokeStart: onStrokeStart,
    onStrokePoint: onStrokePoint,
    onStrokeEnd: onStrokeEnd,
  };
})();
