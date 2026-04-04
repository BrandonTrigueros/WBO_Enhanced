/**
 * Circle Recognizer — detects circular strokes via inertia analysis.
 * Ported from Xournal++ CircleRecognizer.cpp (GPLv2+).
 */
var CircleRecognizer = {
  /**
   * Score how circular a stroke is.
   * Returns 0 for a perfect circle, higher = worse fit.
   */
  scoreCircle: function (points, inertia) {
    var r0 = inertia.rad();
    var divisor = inertia.getMass() * r0;
    if (divisor === 0) return Infinity;

    var sum = 0;
    var x0 = inertia.centerX();
    var y0 = inertia.centerY();

    for (var i = 0; i < points.length - 1; i++) {
      var dm = Math.hypot(
        points[i + 1].x - points[i].x,
        points[i + 1].y - points[i].y,
      );
      var deltar = Math.hypot(points[i].x - x0, points[i].y - y0) - r0;
      sum += dm * Math.abs(deltar);
    }

    return sum / divisor;
  },

  /**
   * Try to recognize a circle from the given points.
   * Returns {cx, cy, r} on success, or null.
   */
  recognize: function (points) {
    var s = new Inertia();
    s.calc(points);

    if (s.det() > ShapeRecConfig.CIRCLE_MIN_DET) {
      var score = CircleRecognizer.scoreCircle(points, s);
      if (score < ShapeRecConfig.CIRCLE_MAX_SCORE) {
        return {
          type: "circle",
          cx: s.centerX(),
          cy: s.centerY(),
          r: s.rad(),
        };
      }
    }
    return null;
  },
};
