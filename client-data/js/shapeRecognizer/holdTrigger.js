/**
 * Shape Recognition Trigger — pen-up recognition.
 *
 * Collects points while the pencil draws, then on pen-up (stroke end)
 * runs the recognizer. If a shape is found, delegates to ShapeRenderer
 * to replace the freehand path. Same approach as Xournal++.
 *
 * Depends on: ShapeRecognizer, ShapeRenderer (global)
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
        ShapeRenderer.replace(currentLineId, result);
      }
    }
    isActive = false;
    collectedPoints = [];
    currentLineId = "";
  }

  // Expose globally for pencil tool integration
  window.ShapeHoldTrigger = {
    onStrokeStart: onStrokeStart,
    onStrokePoint: onStrokePoint,
    onStrokeEnd: onStrokeEnd,
  };
})();
