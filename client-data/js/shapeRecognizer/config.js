/**
 * Shape Recognizer — Configuration & thresholds.
 * Ported from Xournal++ ShapeRecognizerConfig.h (GPLv2+).
 */
var ShapeRecConfig = {
  MAX_POLYGON_SIDES: 4,
  SEGMENT_MAX_DET: 0.045,
  LINE_MAX_DET: 0.015,
  LINE_POINT_DIST2_THRESHOLD: 15,
  CIRCLE_MIN_DET: 0.95,
  CIRCLE_MAX_SCORE: 0.10,
  SLANT_TOLERANCE: 5 * Math.PI / 180,
  TRIANGLE_LINEAR_TOLERANCE: 0.30,
  RECTANGLE_ANGLE_TOLERANCE: 15 * Math.PI / 180,
  RECTANGLE_LINEAR_TOLERANCE: 0.20,
  MIN_STROKE_SIZE: 40,
};
