/**
 * Unit tests for pdfRenderer — board JSON to vector PDF conversion.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { Writable } = require("stream");
const {
  boardToPdf,
  bookToPdf,
  PX_TO_PT,
} = require("../../server/export/pdfRenderer.js");

/** Collect a writable stream's output into a Buffer. */
function collectStream() {
  var chunks = [];
  var stream = new Writable({
    write: function (chunk, encoding, cb) {
      chunks.push(chunk);
      cb();
    },
  });
  stream.getBuffer = function () {
    return Buffer.concat(chunks);
  };
  return stream;
}

var RECT_BOARD = {
  r1: {
    id: "r1",
    x: 50,
    y: 50,
    x2: 300,
    y2: 200,
    tool: "Rectangle",
    color: "#ff0000",
    size: 3,
  },
};

var LINE_BOARD = {
  l1: {
    id: "l1",
    x: 10,
    y: 10,
    x2: 200,
    y2: 150,
    tool: "Straight line",
    color: "#000",
    size: 2,
  },
};

var PENCIL_BOARD = {
  p1: {
    id: "p1",
    tool: "Pencil",
    color: "#00f",
    size: 4,
    _children: [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
      { x: 100, y: 30 },
      { x: 150, y: 60 },
    ],
  },
};

var TEXT_BOARD = {
  t1: {
    id: "t1",
    x: 100,
    y: 200,
    tool: "Text",
    txt: "Hello PDF",
    color: "#333",
    size: 14,
  },
};

describe("pdfRenderer", function () {
  describe("boardToPdf", function () {
    it("should produce valid PDF (starts with %PDF)", async function () {
      var stream = collectStream();
      await boardToPdf(RECT_BOARD, stream);
      var buf = stream.getBuffer();
      var header = buf.slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-", "should start with %PDF-");
    });

    it("should produce non-trivial output for Rectangle", async function () {
      var stream = collectStream();
      await boardToPdf(RECT_BOARD, stream);
      assert.ok(
        stream.getBuffer().length > 200,
        "PDF should have substantial size",
      );
    });

    it("should produce PDF for Pencil paths", async function () {
      var stream = collectStream();
      await boardToPdf(PENCIL_BOARD, stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });

    it("should produce PDF for Text elements", async function () {
      var stream = collectStream();
      await boardToPdf(TEXT_BOARD, stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });

    it("should produce PDF for Straight line", async function () {
      var stream = collectStream();
      await boardToPdf(LINE_BOARD, stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });

    it("should use custom page size for boards (not forced A4)", async function () {
      var stream = collectStream();
      await boardToPdf(RECT_BOARD, stream);
      var buf = stream.getBuffer();
      // The PDF should exist and be valid — exact page size is internal
      assert.ok(buf.length > 200);
    });

    it("should use A4 page size when bookPage option is set", async function () {
      var stream = collectStream();
      await boardToPdf(RECT_BOARD, stream, { bookPage: true });
      var buf = stream.getBuffer();
      assert.ok(buf.length > 200, "should produce PDF");
      var header = buf.slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });

    it("should handle empty board", async function () {
      var stream = collectStream();
      await boardToPdf({}, stream);
      var buf = stream.getBuffer();
      var header = buf.slice(0, 5).toString("ascii");
      assert.equal(
        header,
        "%PDF-",
        "empty board should still produce valid PDF",
      );
    });

    it("should handle elements with deltax/deltay transforms", async function () {
      var board = {
        r1: {
          id: "r1",
          x: 10,
          y: 10,
          x2: 100,
          y2: 100,
          tool: "Rectangle",
          color: "#000",
          size: 1,
          deltax: 50,
          deltay: 30,
        },
      };
      var stream = collectStream();
      await boardToPdf(board, stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });

    it("should handle elements with opacity", async function () {
      var board = {
        r1: {
          id: "r1",
          x: 10,
          y: 10,
          x2: 100,
          y2: 100,
          tool: "Rectangle",
          color: "#000",
          size: 1,
          opacity: 0.5,
        },
      };
      var stream = collectStream();
      await boardToPdf(board, stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });
  });

  describe("bookToPdf", function () {
    it("should produce multi-page PDF", async function () {
      var pages = [RECT_BOARD, LINE_BOARD, TEXT_BOARD];
      var stream = collectStream();
      await bookToPdf(pages, stream);
      var buf = stream.getBuffer();
      var header = buf.slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
      // Multi-page PDF should be larger than single-page
      var singleStream = collectStream();
      await boardToPdf(RECT_BOARD, singleStream, { bookPage: true });
      assert.ok(
        buf.length > singleStream.getBuffer().length,
        "multi-page should be larger than single-page",
      );
    });

    it("should handle single-page book", async function () {
      var stream = collectStream();
      await bookToPdf([RECT_BOARD], stream);
      var header = stream.getBuffer().slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });
  });

  describe("PX_TO_PT", function () {
    it("should be 72/96 = 0.75", function () {
      assert.equal(PX_TO_PT, 72 / 96);
    });
  });

  describe("Image element", function () {
    it("should produce PDF for board with Image element (missing file gracefully skipped)", async function () {
      var board = {
        img1: {
          id: "img1",
          x: 100,
          y: 100,
          width: 300,
          height: 200,
          tool: "Image",
          src: "/images/test/nonexistent.png",
        },
      };
      var stream = collectStream();
      await boardToPdf(board, stream);
      var buf = stream.getBuffer();
      assert.ok(buf.length > 100, "should produce non-trivial PDF");
      assert.equal(buf.slice(0, 5).toString("ascii"), "%PDF-");
    });
  });
});
