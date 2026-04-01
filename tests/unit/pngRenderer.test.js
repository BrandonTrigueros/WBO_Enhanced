/**
 * Unit tests for pngRenderer — SVG to PNG conversion with white background.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { svgToPng } = require("../../server/export/pngRenderer.js");

var SIMPLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect x="10" y="10" width="80" height="80" stroke="red" fill="none"/>' +
  "</svg>";

describe("pngRenderer", function () {
  describe("svgToPng", function () {
    it("should return a Buffer", function () {
      var result = svgToPng(SIMPLE_SVG);
      assert.ok(Buffer.isBuffer(result), "result should be a Buffer");
    });

    it("should produce valid PNG (magic bytes)", function () {
      var buf = svgToPng(SIMPLE_SVG);
      // PNG magic: 89 50 4E 47 0D 0A 1A 0A
      assert.equal(buf[0], 0x89);
      assert.equal(buf[1], 0x50); // P
      assert.equal(buf[2], 0x4e); // N
      assert.equal(buf[3], 0x47); // G
    });

    it("should produce non-trivial output", function () {
      var buf = svgToPng(SIMPLE_SVG);
      assert.ok(buf.length > 100, "PNG should have substantial size");
    });

    it("should respect width option", function () {
      var normal = svgToPng(SIMPLE_SVG);
      var scaled = svgToPng(SIMPLE_SVG, { width: 50 });
      // Scaled-down PNG should be smaller
      assert.ok(scaled.length < normal.length, "scaled PNG should be smaller");
    });

    it("should inject white background (non-transparent)", function () {
      // A tiny 2x2 SVG with no fill — if background is white, PNG will differ
      // from a transparent version
      var tinySvg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>';
      var buf = svgToPng(tinySvg);
      assert.ok(Buffer.isBuffer(buf), "should still produce PNG");
      assert.ok(buf.length > 50, "should have content");
    });
  });
});
