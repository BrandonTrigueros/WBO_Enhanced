/**
 * 2D Moment of Inertia Tensor — measures linearity/circularity of a stroke.
 * Ported from Xournal++ Inertia.cpp (GPLv2+).
 *
 * Usage:
 *   var s = new Inertia();
 *   s.calc(points);       // points = [{x, y}, ...]
 *   s.det();              // 0 = perfect line, 1 = perfect circle
 *   s.centerX/Y();        // centroid
 *   s.rad();              // radius
 */
function Inertia() {
  this.mass = 0;
  this.sx = 0;
  this.sy = 0;
  this.sxx = 0;
  this.syy = 0;
  this.sxy = 0;
}

Inertia.prototype.centerX = function () { return this.sx / this.mass; };
Inertia.prototype.centerY = function () { return this.sy / this.mass; };

Inertia.prototype.xx = function () {
  if (this.mass <= 0) return 0;
  return (this.sxx - this.sx * this.sx / this.mass) / this.mass;
};

Inertia.prototype.xy = function () {
  if (this.mass <= 0) return 0;
  return (this.sxy - this.sx * this.sy / this.mass) / this.mass;
};

Inertia.prototype.yy = function () {
  if (this.mass <= 0) return 0;
  return (this.syy - this.sy * this.sy / this.mass) / this.mass;
};

Inertia.prototype.rad = function () {
  var ixx = this.xx(), iyy = this.yy();
  if (ixx + iyy <= 0) return 0;
  return Math.sqrt(ixx + iyy);
};

/** Determinant: 0 = line, 1 = circle */
Inertia.prototype.det = function () {
  var ixx = this.xx(), iyy = this.yy(), ixy = this.xy();
  if (this.mass <= 0) return 0;
  var sum = ixx + iyy;
  if (sum <= 0) return 0;
  return 4 * (ixx * iyy - ixy * ixy) / (sum * sum);
};

Inertia.prototype.getMass = function () { return this.mass; };

/** Add or remove an edge segment between p1 and p2 (coef = 1 or -1) */
Inertia.prototype.increase = function (p1, p2, coef) {
  var dm = coef * Math.hypot(p2.x - p1.x, p2.y - p1.y);
  this.mass += dm;
  this.sx += dm * p1.x;
  this.sy += dm * p1.y;
  this.sxx += dm * p1.x * p1.x;
  this.syy += dm * p1.y * p1.y;
  this.sxy += dm * p1.x * p1.y;
};

/** Calculate inertia for a range of points (start to end inclusive) */
Inertia.prototype.calc = function (points, start, end) {
  this.mass = this.sx = this.sy = this.sxx = this.sxy = this.syy = 0;
  if (start === undefined) start = 0;
  if (end === undefined) end = points.length - 1;
  for (var i = start; i < end; i++) {
    this.increase(points[i], points[i + 1], 1);
  }
};

/** Clone this inertia */
Inertia.prototype.copy = function () {
  var c = new Inertia();
  c.mass = this.mass;
  c.sx = this.sx;
  c.sy = this.sy;
  c.sxx = this.sxx;
  c.syy = this.syy;
  c.sxy = this.sxy;
  return c;
};
