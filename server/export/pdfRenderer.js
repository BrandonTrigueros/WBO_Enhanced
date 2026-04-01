/**
 * pdfRenderer — renders board JSON directly to PDFKit vector commands.
 *
 * No SVG or PNG intermediate. Produces crisp, resolution-independent PDFs.
 * Supports: Pencil (cubic bezier paths), Text, Rectangle, Ellipse, Straight line.
 *
 * @module pdfRenderer
 */

var PDFDocument = require("pdfkit");
var nodeFs = require("fs");
var nodePath = require("path");
var config = require("../configuration.js");
var wboPencilPoint =
  require("../../client-data/tools/pencil/wbo_pencil_point.js").wboPencilPoint;

// A4 at 96 DPI (browser canvas pixels) — must match book.html / book.css
var A4_PX_WIDTH = 794;
var A4_PX_HEIGHT = 1123;

// Scale factor: PDF points (72 DPI) / browser pixels (96 DPI)
var PX_TO_PT = 72 / 96; // 0.75

// A4 in PDF points (595.28 × 841.89 — matches PDFKit's built-in "A4")
var A4_PT_WIDTH = A4_PX_WIDTH * PX_TO_PT;
var A4_PT_HEIGHT = A4_PX_HEIGHT * PX_TO_PT;

// ---- Element renderers (board JSON → PDFKit calls) ----

/**
 * Build an SVG path string from pencil point data,
 * reusing the same wboPencilPoint algorithm as svgRenderer.js.
 */
function buildPencilPath(el) {
  if (!el._children || !el._children.length) return null;
  var pts = el._children.reduce(function (pts, point) {
    return wboPencilPoint(pts, point.x, point.y);
  }, []);
  return pts
    .map(function (op) {
      return op.type + " " + op.values.join(" ");
    })
    .join(" ");
}

function applyTranslate(doc, el) {
  if (el.deltax || el.deltay) {
    doc.translate(el.deltax || 0, el.deltay || 0);
  }
}

function renderPencil(doc, el) {
  var pathStr = buildPencilPath(el);
  if (!pathStr) return;
  doc.save();
  applyTranslate(doc, el);
  doc
    .path(pathStr)
    .lineWidth(el.size | 0)
    .lineCap("round")
    .lineJoin("round")
    .strokeOpacity(el.opacity ? parseFloat(el.opacity) : 1)
    .stroke(el.color || "#000");
  doc.restore();
}

function renderText(doc, el) {
  doc.save();
  applyTranslate(doc, el);
  doc
    .fontSize(el.size | 0)
    .fillColor(el.color || "#000")
    .text(el.txt || "", el.x | 0, el.y | 0, { lineBreak: false });
  doc.restore();
}

function renderRectangle(doc, el) {
  doc.save();
  applyTranslate(doc, el);
  doc
    .rect(el.x || 0, el.y || 0, el.x2 - el.x, el.y2 - el.y)
    .lineWidth(el.size | 0)
    .strokeOpacity(el.opacity ? parseFloat(el.opacity) : 1)
    .stroke(el.color || "#000");
  doc.restore();
}

function renderEllipse(doc, el) {
  var cx = Math.round((el.x2 + el.x) / 2);
  var cy = Math.round((el.y2 + el.y) / 2);
  var rx = Math.abs(el.x2 - el.x) / 2;
  var ry = Math.abs(el.y2 - el.y) / 2;
  doc.save();
  applyTranslate(doc, el);
  doc
    .ellipse(cx, cy, rx, ry)
    .lineWidth(el.size | 0)
    .strokeOpacity(el.opacity ? parseFloat(el.opacity) : 1)
    .stroke(el.color || "#000");
  doc.restore();
}

function renderStraightLine(doc, el) {
  var pathStr = "M" + el.x + " " + el.y + "L" + el.x2 + " " + el.y2;
  doc.save();
  applyTranslate(doc, el);
  doc
    .path(pathStr)
    .lineWidth(el.size | 0)
    .lineCap("round")
    .strokeOpacity(el.opacity ? parseFloat(el.opacity) : 1)
    .stroke(el.color || "#000");
  doc.restore();
}

function renderImage(doc, el) {
  if (!el.src) return;
  try {
    var filePath = nodePath.join(config.HISTORY_DIR, el.src.replace(/^\//, ""));
    if (!nodeFs.existsSync(filePath)) return;
    doc.save();
    applyTranslate(doc, el);
    if (el.opacity && el.opacity < 1) doc.opacity(parseFloat(el.opacity));
    doc.image(filePath, el.x || 0, el.y || 0, {
      width: el.width || 100,
      height: el.height || 100,
    });
    doc.restore();
  } catch (e) {
    // Skip image if file is missing or corrupt
  }
}

var elementRenderers = {
  Pencil: renderPencil,
  Text: renderText,
  Rectangle: renderRectangle,
  Ellipse: renderEllipse,
  "Straight line": renderStraightLine,
  Image: renderImage,
};

/**
 * Render a single board element to the PDFKit document.
 * @param {PDFDocument} doc
 * @param {object} el — board element from JSON
 */
function renderElement(doc, el) {
  var fn = elementRenderers[el.tool];
  if (fn) fn(doc, el);
}

// ---- Bounding box computation (same logic as svgRenderer.toSVG) ----

function computeBoundingBox(boardObj) {
  var margin = 400;
  var elems = Object.values(boardObj);
  return elems.reduce(
    function (dim, elem) {
      if (elem._children && elem._children.length) elem = elem._children[0];
      var ex = (elem.x || 0) + (elem.deltax | 0);
      var ey = (elem.y || 0) + (elem.deltay | 0);
      if (elem.width) ex += (elem.width | 0);
      if (elem.height) ey += (elem.height | 0);
      return {
        width: Math.max((ex + margin) | 0, dim.width),
        height: Math.max((ey + margin) | 0, dim.height),
      };
    },
    { width: margin, height: margin },
  );
}

// ---- Public API ----

/**
 * Render a single board as a PDF and pipe to a writable stream.
 * For boards: page size matches content bounding box (no forced A4).
 * For book pages: use opts.bookPage = true to get fixed A4 sizing.
 *
 * @param {object} boardObj — parsed board JSON
 * @param {import("stream").Writable} writeable
 * @param {object} [opts]
 * @param {boolean} [opts.bookPage] — if true, use A4 page with 96→72 DPI scaling
 * @returns {Promise<void>}
 */
function boardToPdf(boardObj, writeable, opts) {
  return new Promise(function (resolve, reject) {
    var isBookPage = opts && opts.bookPage;
    var pageOpts;

    if (isBookPage) {
      pageOpts = { size: "A4", margin: 0 };
    } else {
      // Custom page size derived from content bounding box
      var bbox = computeBoundingBox(boardObj);
      pageOpts = {
        size: [bbox.width * PX_TO_PT, bbox.height * PX_TO_PT],
        margin: 0,
      };
    }

    var doc = new PDFDocument({
      size: pageOpts.size,
      margin: 0,
      autoFirstPage: true,
    });
    doc.pipe(writeable);
    writeable.on("finish", resolve);
    writeable.on("error", reject);

    // White background
    var pw = isBookPage ? A4_PT_WIDTH : pageOpts.size[0];
    var ph = isBookPage ? A4_PT_HEIGHT : pageOpts.size[1];
    doc.rect(0, 0, pw, ph).fill("white");

    // Scale from 96 DPI pixel coords to 72 DPI PDF points
    doc.scale(PX_TO_PT);

    var elems = Object.values(boardObj);
    elems.forEach(function (el) {
      renderElement(doc, el);
    });

    doc.end();
  });
}

/**
 * Render multiple board objects as a multi-page A4 PDF.
 * Each boardObj becomes one page.
 *
 * @param {object[]} boardObjects — array of parsed board JSON objects
 * @param {import("stream").Writable} writeable
 * @returns {Promise<void>}
 */
function bookToPdf(boardObjects, writeable) {
  return new Promise(function (resolve, reject) {
    var doc = new PDFDocument({
      size: "A4",
      margin: 0,
      autoFirstPage: false,
    });
    doc.pipe(writeable);
    writeable.on("finish", resolve);
    writeable.on("error", reject);

    boardObjects.forEach(function (boardObj) {
      doc.addPage({ size: "A4", margin: 0 });

      // White background
      doc.rect(0, 0, A4_PT_WIDTH, A4_PT_HEIGHT).fill("white");

      // Scale from 96 DPI pixel coords to 72 DPI PDF points
      doc.save();
      doc.scale(PX_TO_PT);

      var elems = Object.values(boardObj);
      elems.forEach(function (el) {
        renderElement(doc, el);
      });

      doc.restore();
    });

    doc.end();
  });
}

module.exports = {
  boardToPdf: boardToPdf,
  bookToPdf: bookToPdf,
  PX_TO_PT: PX_TO_PT,
  A4_PX_WIDTH: A4_PX_WIDTH,
  A4_PX_HEIGHT: A4_PX_HEIGHT,
};
