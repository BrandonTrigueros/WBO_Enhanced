/**
 * Unit tests for svgRenderer — board JSON to SVG conversion.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { toSVG } = require("../../server/export/svgRenderer.js");

/** Collect toSVG output into a string. */
async function renderToString(boardObj) {
  var chunks = [];
  var fakeStream = { write: function (c) { chunks.push(c); } };
  await toSVG(boardObj, fakeStream);
  return chunks.join("");
}

describe("svgRenderer", function () {
  describe("toSVG", function () {
    it("should produce valid SVG with opening and closing tags", async function () {
      var board = {
        r1: { id: "r1", x: 10, y: 20, x2: 100, y2: 80, tool: "Rectangle", color: "#f00", size: 2 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.startsWith("<svg "), "should start with <svg>");
      assert.ok(svg.endsWith("</svg>"), "should end with </svg>");
      assert.ok(svg.includes("xmlns=\"http://www.w3.org/2000/svg\""), "should have SVG namespace");
    });

    it("should include width and height attributes", async function () {
      var board = {
        r1: { id: "r1", x: 50, y: 60, x2: 200, y2: 180, tool: "Rectangle", color: "#000", size: 1 },
      };
      var svg = await renderToString(board);
      var widthMatch = svg.match(/width="(\d+)"/);
      var heightMatch = svg.match(/height="(\d+)"/);
      assert.ok(widthMatch, "should have width");
      assert.ok(heightMatch, "should have height");
      // Width should be at least x + margin (400)
      assert.ok(parseInt(widthMatch[1]) >= 450, "width should include margin");
    });

    it("should render a Rectangle as <rect>", async function () {
      var board = {
        r1: { id: "r1", x: 10, y: 20, x2: 100, y2: 80, tool: "Rectangle", color: "#ff0000", size: 3 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<rect"), "should contain <rect>");
      assert.ok(svg.includes('stroke="#ff0000"'), "should have correct color");
      assert.ok(svg.includes('stroke-width="3"'), "should have correct stroke width");
    });

    it("should render Text as <text>", async function () {
      var board = {
        t1: { id: "t1", x: 50, y: 100, tool: "Text", txt: "Hello", color: "#000", size: 16 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<text"), "should contain <text>");
      assert.ok(svg.includes("Hello"), "should contain text content");
      assert.ok(svg.includes('font-size="16"'), "should have correct font size");
    });

    it("should render Pencil paths from _children", async function () {
      var board = {
        p1: {
          id: "p1", tool: "Pencil", color: "#00f", size: 4,
          _children: [
            { x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 15 }, { x: 40, y: 25 },
          ],
        },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<path"), "should contain <path>");
      assert.ok(svg.includes('stroke="#00f"'), "should have correct stroke color");
    });

    it("should render Ellipse as a path", async function () {
      var board = {
        e1: { id: "e1", x: 50, y: 50, x2: 150, y2: 100, tool: "Ellipse", color: "#0f0", size: 2 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<path"), "should contain <path> for ellipse");
    });

    it("should render Straight line as a path", async function () {
      var board = {
        l1: { id: "l1", x: 10, y: 10, x2: 200, y2: 150, tool: "Straight line", color: "#333", size: 1 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<path"), "should contain <path>");
      assert.ok(svg.includes("M10 10L200 150"), "should have correct line path");
    });

    it("should handle transform (deltax, deltay)", async function () {
      var board = {
        r1: { id: "r1", x: 10, y: 20, x2: 100, y2: 80, tool: "Rectangle", color: "#000", size: 1, deltax: 50, deltay: 30 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes('transform="translate(50,30)"'), "should include transform");
    });

    it("should handle empty board", async function () {
      var svg = await renderToString({});
      assert.ok(svg.startsWith("<svg "), "should still produce valid SVG");
      assert.ok(svg.endsWith("</svg>"), "should close SVG tag");
    });

    it("should skip unknown tools without crashing", async function () {
      var board = {
        u1: { id: "u1", x: 10, y: 10, tool: "UnknownTool", color: "#000", size: 1 },
      };
      var svg = await renderToString(board);
      assert.ok(svg.includes("<svg"), "should still produce SVG");
      assert.ok(!svg.includes("UnknownTool"), "should not render unknown tool as element");
    });
  });
});
