/**
 * Recognized segment — geometry of a linear piece within a stroke.
 * Ported from Xournal++ RecoSegment.cpp (GPLv2+).
 */
function RecoSegment() {
  this.startpt = 0;
  this.endpt = 0;
  this.xcenter = 0;
  this.ycenter = 0;
  this.angle = 0;
  this.radius = 0;
  this.x1 = 0;
  this.y1 = 0;
  this.x2 = 0;
  this.y2 = 0;
  this.reversed = false;
}

/** Find the intersection of two segment edges (line-line in 2D) */
RecoSegment.prototype.calcEdgeIsect = function (r2) {
  var t = (r2.xcenter - this.xcenter) * Math.sin(r2.angle)
        - (r2.ycenter - this.ycenter) * Math.cos(r2.angle);
  t /= Math.sin(r2.angle - this.angle);
  var x = this.xcenter + t * Math.cos(this.angle);
  var y = this.ycenter + t * Math.sin(this.angle);
  return { x: x, y: y };
};

/** Compute geometry (center, angle, endpoints) from inertia tensor */
RecoSegment.prototype.calcSegmentGeometry = function (points, start, end, inertia) {
  this.xcenter = inertia.centerX();
  this.ycenter = inertia.centerY();
  var a = inertia.xx();
  var b = inertia.xy();
  var c = inertia.yy();

  this.angle = Math.atan2(2 * b, a - c) / 2;
  this.radius = Math.sqrt(3 * (a + c));

  var lmin = 0, lmax = 0;
  for (var i = start; i <= end; i++) {
    var l = (points[i].x - this.xcenter) * Math.cos(this.angle)
          + (points[i].y - this.ycenter) * Math.sin(this.angle);
    if (l < lmin) lmin = l;
    if (l > lmax) lmax = l;
  }

  this.x1 = this.xcenter + lmin * Math.cos(this.angle);
  this.y1 = this.ycenter + lmin * Math.sin(this.angle);
  this.x2 = this.xcenter + lmax * Math.cos(this.angle);
  this.y2 = this.ycenter + lmax * Math.sin(this.angle);
};
