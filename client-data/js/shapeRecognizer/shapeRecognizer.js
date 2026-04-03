/**
 * Shape Recognizer — main recognition pipeline.
 * Ported from Xournal++ ShapeRecognizer.cpp (GPLv2+).
 *
 * Decomposes a freehand stroke into polygonal segments, then classifies
 * as line, triangle, rectangle, or circle.
 *
 * Usage:
 *   var result = ShapeRecognizer.recognize(points);
 *   // result = null | { type: "line", ... } | { type: "rect", ... } | etc.
 */
var ShapeRecognizer = (function () {
  "use strict";

  var C = ShapeRecConfig;

  function dist2(p, q) {
    var dx = p.x - q.x, dy = p.y - q.y;
    return dx * dx + dy * dy;
  }

  // ---- Polygonal decomposition ----

  /**
   * Recursively find up to nsides linear segments in points[start..finish].
   * Fills breaks[] and ss[] (Inertia objects).
   * Returns number of segments found (0 = failed).
   */
  function findPolygonal(points, start, finish, nsides, breaks, ss) {
    if (finish === start || nsides <= 0) return 0;
    if (finish - start < 5) nsides = 1;

    var s = new Inertia();
    var i1, i2, k;

    // look for a linear piece that's big enough
    for (k = 0; k < nsides; k++) {
      i1 = start + Math.floor(k * (finish - start) / nsides);
      i2 = start + Math.floor((k + 1) * (finish - start) / nsides);
      s.calc(points, i1, i2);
      if (s.det() < C.SEGMENT_MAX_DET) break;
    }
    if (k === nsides) return 0;

    // grow the linear piece
    var s1, s2, det1, det2;
    while (true) {
      det1 = 1.0;
      det2 = 1.0;
      if (i1 > start) {
        s1 = s.copy();
        s1.increase(points[i1 - 1], points[i1], 1);
        det1 = s1.det();
      }
      if (i2 < finish) {
        s2 = s.copy();
        s2.increase(points[i2], points[i2 + 1], 1);
        det2 = s2.det();
      }
      if (det1 < det2 && det1 < C.SEGMENT_MAX_DET) {
        i1--;
        s = s1;
      } else if (det2 < det1 && det2 < C.SEGMENT_MAX_DET) {
        i2++;
        s = s2;
      } else {
        break;
      }
    }

    // recurse on left remainder
    var n1 = 0;
    if (i1 > start) {
      n1 = findPolygonal(points, start, i1,
        (i2 === finish) ? (nsides - 1) : (nsides - 2), breaks, ss);
      if (n1 === 0) return 0;
    }

    breaks[n1] = i1;
    breaks[n1 + 1] = i2;
    ss[n1] = s;

    // recurse on right remainder
    var n2 = 0;
    if (i2 < finish) {
      // Use offset arrays for right side
      var rightBreaks = [];
      var rightSS = [];
      n2 = findPolygonal(points, i2, finish, nsides - n1 - 1, rightBreaks, rightSS);
      if (n2 === 0) return 0;
      for (var j = 0; j <= n2; j++) {
        breaks[n1 + 1 + j] = rightBreaks[j];
      }
      for (var j = 0; j < n2; j++) {
        ss[n1 + 1 + j] = rightSS[j];
      }
    }

    return n1 + n2 + 1;
  }

  /** Optimize segment break points to improve fit */
  function optimizePolygonal(points, nsides, breaks, ss) {
    for (var i = 1; i < nsides; i++) {
      var cost = ss[i - 1].det() * ss[i - 1].det() + ss[i].det() * ss[i].det();
      var s1 = ss[i - 1].copy();
      var s2 = ss[i].copy();
      var improved = false;

      // try moving break left
      while (breaks[i] > breaks[i - 1] + 1) {
        s1.increase(points[breaks[i] - 1], points[breaks[i] - 2], -1);
        s2.increase(points[breaks[i] - 1], points[breaks[i] - 2], 1);
        var newcost = s1.det() * s1.det() + s2.det() * s2.det();
        if (newcost >= cost) break;
        improved = true;
        cost = newcost;
        breaks[i]--;
        ss[i - 1] = s1.copy();
        ss[i] = s2.copy();
      }

      if (improved) continue;

      s1 = ss[i - 1].copy();
      s2 = ss[i].copy();
      // try moving break right
      while (breaks[i] < breaks[i + 1] - 1) {
        s1.increase(points[breaks[i]], points[breaks[i] + 1], 1);
        s2.increase(points[breaks[i]], points[breaks[i] + 1], -1);
        var newcost = s1.det() * s1.det() + s2.det() * s2.det();
        if (newcost >= cost) break;
        cost = newcost;
        breaks[i]++;
        ss[i - 1] = s1.copy();
        ss[i] = s2.copy();
      }
    }
  }

  // ---- Shape classifiers ----

  function tryTriangle(queue, n) {
    if (n < 3) return null;
    var rs = queue.slice(n - 3, n);
    if (rs[0].startpt !== 0) return null;

    // Orient segments so each points toward the next
    for (var i = 0; i < 3; i++) {
      var r1 = rs[i], r2 = rs[(i + 1) % 3];
      var P = { x: r1.x1, y: r1.y1 }, Q = { x: r1.x2, y: r1.y2 };
      var R = { x: r2.x1, y: r2.y1 }, S = { x: r2.x2, y: r2.y2 };
      var minPR_PS = Math.min(dist2(P, R), dist2(P, S));
      var minQR_QS = Math.min(dist2(Q, R), dist2(Q, S));
      r1.reversed = minPR_PS < minQR_QS;
    }

    // Check vertex gaps
    for (var i = 0; i < 3; i++) {
      var r1 = rs[i], r2 = rs[(i + 1) % 3];
      var ex = r1.reversed ? r1.x1 : r1.x2;
      var ey = r1.reversed ? r1.y1 : r1.y2;
      var sx = r2.reversed ? r2.x2 : r2.x1;
      var sy = r2.reversed ? r2.y2 : r2.y1;
      var d = Math.hypot(ex - sx, ey - sy);
      if (d > C.TRIANGLE_LINEAR_TOLERANCE * (r1.radius + r2.radius)) return null;
    }

    var vertices = [];
    for (var i = 0; i < 3; i++) {
      vertices.push(rs[i].calcEdgeIsect(rs[(i + 1) % 3]));
    }
    vertices.push({ x: vertices[0].x, y: vertices[0].y }); // close

    return { type: "triangle", vertices: vertices };
  }

  function tryRectangle(queue, n) {
    if (n < 4) return null;
    var rs = queue.slice(n - 4, n);
    if (rs[0].startpt !== 0) return null;

    var avgAngle = 0;
    for (var i = 0; i < 4; i++) {
      var r1 = rs[i], r2 = rs[(i + 1) % 4];
      if (Math.abs(Math.abs(r1.angle - r2.angle) - Math.PI / 2) > C.RECTANGLE_ANGLE_TOLERANCE) {
        return null;
      }
      avgAngle += r1.angle;
      if (r2.angle > r1.angle) {
        avgAngle += (i + 1) * Math.PI / 2;
      } else {
        avgAngle -= (i + 1) * Math.PI / 2;
      }

      r1.reversed = ((r1.x2 - r1.x1) * (r2.xcenter - r1.xcenter) +
                      (r1.y2 - r1.y1) * (r2.ycenter - r1.ycenter)) < 0;
    }

    // Check vertex gaps
    for (var i = 0; i < 4; i++) {
      var r1 = rs[i], r2 = rs[(i + 1) % 4];
      var d = Math.hypot(
        (r1.reversed ? r1.x1 : r1.x2) - (r2.reversed ? r2.x2 : r2.x1),
        (r1.reversed ? r1.y1 : r1.y2) - (r2.reversed ? r2.y2 : r2.y1)
      );
      if (d > C.RECTANGLE_LINEAR_TOLERANCE * (r1.radius + r2.radius)) return null;
    }

    avgAngle /= 4;
    if (Math.abs(avgAngle) < C.SLANT_TOLERANCE) avgAngle = 0;
    if (Math.abs(avgAngle) > Math.PI / 2 - C.SLANT_TOLERANCE) avgAngle = Math.PI / 2;

    // Reassign snapped angles
    for (var i = 0; i < 4; i++) {
      rs[i].angle = avgAngle + i * Math.PI / 2;
    }

    var vertices = [];
    for (var i = 0; i < 4; i++) {
      vertices.push(rs[i].calcEdgeIsect(rs[(i + 1) % 4]));
    }
    vertices.push({ x: vertices[0].x, y: vertices[0].y }); // close

    return { type: "rectangle", vertices: vertices };
  }

  // ---- Main entry point ----

  /**
   * Try to recognize a shape from an array of {x, y} points.
   * Returns null if no shape detected, or a descriptor object:
   *   { type: "line", x1, y1, x2, y2 }
   *   { type: "rectangle", vertices: [{x,y}...] }
   *   { type: "triangle", vertices: [{x,y}...] }
   *   { type: "circle", cx, cy, r }
   */
  function recognize(points) {
    if (!points || points.length < 3) return null;

    // Size check
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < points.length; i++) {
      if (points[i].x < minX) minX = points[i].x;
      if (points[i].x > maxX) maxX = points[i].x;
      if (points[i].y < minY) minY = points[i].y;
      if (points[i].y > maxY) maxY = points[i].y;
    }
    if (Math.hypot(maxX - minX, maxY - minY) < C.MIN_STROKE_SIZE) return null;

    var ss = new Array(C.MAX_POLYGON_SIDES);
    var brk = new Array(C.MAX_POLYGON_SIDES + 1);

    var n = findPolygonal(points, 0, points.length - 1, C.MAX_POLYGON_SIDES, brk, ss);

    if (n > 0) {
      optimizePolygonal(points, n, brk, ss);

      // Build segment queue
      var queue = [];
      for (var i = 0; i < n; i++) {
        var seg = new RecoSegment();
        seg.startpt = brk[i];
        seg.endpt = brk[i + 1];
        seg.calcSegmentGeometry(points, brk[i], brk[i + 1], ss[i]);
        queue.push(seg);
      }

      // Try polygon shapes
      var result;
      result = tryTriangle(queue, n);
      if (result) return result;

      result = tryRectangle(queue, n);
      if (result) return result;

      // Try line
      if (n === 1 && ss[0].det() < C.LINE_MAX_DET) {
        var rs = queue[0];
        var aligned = true;

        if (Math.abs(rs.angle) < C.SLANT_TOLERANCE) {
          rs.angle = 0;
          rs.y1 = rs.y2 = rs.ycenter;
        } else if (Math.abs(rs.angle) > Math.PI / 2 - C.SLANT_TOLERANCE) {
          rs.angle = (rs.angle > 0) ? Math.PI / 2 : -Math.PI / 2;
          rs.x1 = rs.x2 = rs.xcenter;
        } else {
          aligned = false;
        }

        if (aligned) {
          return { type: "line", x1: rs.x1, y1: rs.y1, x2: rs.x2, y2: rs.y2 };
        }

        // Check if endpoints are close to the principal-axis endpoints
        var last = points[points.length - 1];
        var P = { x: rs.x1, y: rs.y1 }, Q = { x: rs.x2, y: rs.y2 };
        var dx = Q.x - P.x, dy = Q.y - P.y;
        var num = dy * last.x - dx * last.y + Q.x * P.y - Q.y * P.x;
        var ptDist2 = (num * num) / (dy * dy + dx * dx);

        if (ptDist2 < C.LINE_POINT_DIST2_THRESHOLD) {
          return { type: "line", x1: rs.x1, y1: rs.y1, x2: rs.x2, y2: rs.y2 };
        } else {
          return { type: "line", x1: points[0].x, y1: points[0].y, x2: last.x, y2: last.y };
        }
      }
    }

    // Not a polygon — try circle
    return CircleRecognizer.recognize(points);
  }

  return { recognize: recognize };
})();
