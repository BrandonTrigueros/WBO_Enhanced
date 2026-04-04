/**
 * exportRouter — orchestrates file I/O, rendering, and HTTP responses
 * for all export endpoints.
 *
 * Routes:
 *   GET /export/board/{name}.svg   → SVG download
 *   GET /export/board/{name}.png   → PNG download
 *   GET /export/board/{name}.pdf   → single-page PDF download (vector)
 *   GET /export/book/{name}.pdf    → multi-page PDF download (vector)
 *   GET /export/book/{name}/p{N}.png → single book page PNG
 *   GET /export/book/{name}/p{N}.svg → single book page SVG
 *   GET /export/book/{name}/p{N}.pdf → single book page PDF
 *
 * @module exportRouter
 */

var fs = require("fs"),
  path = require("path"),
  archiver = require("archiver"),
  config = require("../configuration.js"),
  { toSVG } = require("./svgRenderer.js"),
  { svgToPng } = require("./pngRenderer.js"),
  { boardToPdf, bookToPdf } = require("./pdfRenderer.js"),
  bookData = require("../book/bookData.js"),
  { log } = require("../util/log.js");

/**
 * Collect toSVG output into a string (toSVG writes to a stream interface).
 * @param {object} boardObj — parsed board JSON
 * @returns {Promise<string>} complete SVG markup
 */
async function boardToSvgString(boardObj) {
  var chunks = [];
  var fakeStream = {
    write: function (chunk) {
      chunks.push(chunk);
    },
  };
  await toSVG(boardObj, fakeStream);
  return chunks.join("");
}

/**
 * Read and parse a board JSON file.
 * @param {string} boardName
 * @returns {Promise<object>} parsed board data
 */
function readBoardJson(boardName) {
  var filePath = path.join(config.HISTORY_DIR, "board-" + boardName + ".json");
  return new Promise(function (resolve, reject) {
    fs.readFile(filePath, "utf8", function (err, data) {
      if (err) return reject(err);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ---- Route dispatch ----

/**
 * Handle all /export/* requests.
 * @param {string[]} parts — URL path segments (["export", ...])
 * @param {URL} parsedUrl
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 */
function handleExportRequest(parts, parsedUrl, request, response) {
  if (parts.length < 3) {
    sendError(response, 400, "Invalid export path");
    return;
  }

  var scope = parts[1]; // "board" or "book"

  if (scope === "board") {
    handleBoardExport(parts[2], request, response);
  } else if (scope === "book") {
    handleBookExport(parts, request, response);
  } else {
    sendError(response, 404, "Unknown export scope: " + scope);
  }
}

// ---- Board export ----

function handleBoardExport(nameWithExt, request, response) {
  var dotIdx = nameWithExt.lastIndexOf(".");
  if (dotIdx === -1) {
    sendError(response, 400, "Missing file extension (.svg, .png, .pdf)");
    return;
  }
  var boardName = decodeURIComponent(nameWithExt.substring(0, dotIdx));
  var ext = nameWithExt.substring(dotIdx + 1).toLowerCase();

  if (!boardName || !/^[\w%\-_~()]+$/.test(boardName)) {
    sendError(response, 400, "Invalid board name");
    return;
  }

  switch (ext) {
    case "svg":
      exportBoardSvg(boardName, response);
      break;
    case "png":
      exportBoardPng(boardName, response);
      break;
    case "pdf":
      exportBoardPdf(boardName, response);
      break;
    default:
      sendError(response, 400, "Unsupported format: " + ext);
  }
}

function exportBoardSvg(boardName, response) {
  readBoardJson(boardName)
    .then(function (boardObj) {
      return boardToSvgString(boardObj);
    })
    .then(function (svg) {
      response.writeHead(200, {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": 'attachment; filename="' + boardName + '.svg"',
      });
      response.end(svg);
    })
    .catch(function (err) {
      handleRenderError(err, "board-svg", boardName, response);
    });
}

function exportBoardPng(boardName, response) {
  readBoardJson(boardName)
    .then(function (boardObj) {
      return boardToSvgString(boardObj);
    })
    .then(function (svg) {
      return svgToPng(svg);
    })
    .then(function (pngBuf) {
      response.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": pngBuf.length,
        "Content-Disposition": 'attachment; filename="' + boardName + '.png"',
      });
      response.end(pngBuf);
    })
    .catch(function (err) {
      handleRenderError(err, "board-png", boardName, response);
    });
}

function exportBoardPdf(boardName, response, opts) {
  readBoardJson(boardName)
    .then(function (boardObj) {
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + boardName + '.pdf"',
      });
      return boardToPdf(boardObj, response, opts);
    })
    .catch(function (err) {
      handleRenderError(err, "board-pdf", boardName, response);
    });
}

// ---- Book export ----

function handleBookExport(parts, request, response) {
  var nameWithExt = parts[2];

  // Single-page export: /export/book/{bookName}/p{N}.{ext}
  if (parts.length >= 4) {
    var bookName = decodeURIComponent(nameWithExt);
    var pageWithExt = parts[3]; // e.g. "p3.png"
    var pageMatch = pageWithExt.match(/^p(\d+)\.(png|svg|pdf)$/);
    if (!pageMatch) {
      sendError(
        response,
        400,
        "Invalid page format. Use p{N}.png, p{N}.svg, or p{N}.pdf",
      );
      return;
    }
    if (!bookName || !/^[\w%\-_~()]+$/.test(bookName)) {
      sendError(response, 400, "Invalid book name");
      return;
    }
    var pageNum = parseInt(pageMatch[1], 10);
    var pageExt = pageMatch[2];
    var pageBoardName = bookData.pageBoardName(bookName, pageNum);

    if (pageExt === "png") {
      exportBoardPng(pageBoardName, response);
    } else if (pageExt === "svg") {
      exportBoardSvg(pageBoardName, response);
    } else if (pageExt === "pdf") {
      exportBoardPdf(pageBoardName, response, { bookPage: true });
    }
    return;
  }

  // Full book export: /export/book/{name}.{pdf|svg|png}
  var dotIdx = nameWithExt.lastIndexOf(".");
  if (dotIdx === -1) {
    sendError(response, 400, "Missing file extension (.pdf, .svg, .png)");
    return;
  }
  var bookName = decodeURIComponent(nameWithExt.substring(0, dotIdx));
  var ext = nameWithExt.substring(dotIdx + 1).toLowerCase();

  if (!bookName || !/^[\w%\-_~()]+$/.test(bookName)) {
    sendError(response, 400, "Invalid book name");
    return;
  }

  switch (ext) {
    case "pdf":
      exportBookPdf(bookName, response);
      break;
    case "svg":
      exportBookSvgZip(bookName, response);
      break;
    case "png":
      exportBookPngZip(bookName, response);
      break;
    default:
      sendError(response, 400, "Unsupported format: " + ext);
  }
}

function exportBookPdf(bookName, response) {
  bookData
    .loadMeta(bookName)
    .then(function (meta) {
      var promises = [];
      for (var i = 1; i <= meta.pageCount; i++) {
        var pageName = bookData.pageBoardName(bookName, i);
        promises.push(
          readBoardJson(pageName).catch(function () {
            return {}; // empty page
          }),
        );
      }
      return Promise.all(promises);
    })
    .then(function (boardObjects) {
      var validObjects = boardObjects.filter(function (obj) {
        return obj && Object.keys(obj).length > 0;
      });
      if (validObjects.length === 0) {
        sendError(response, 404, "No pages found for this book");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="' + bookName + '.pdf"',
      });
      return bookToPdf(validObjects, response);
    })
    .catch(function (err) {
      handleRenderError(err, "book-pdf", bookName, response);
    });
}

function exportBookSvgZip(bookName, response) {
  bookData
    .loadMeta(bookName)
    .then(function (meta) {
      var promises = [];
      for (var i = 1; i <= meta.pageCount; i++) {
        (function (pageNum) {
          var pageName = bookData.pageBoardName(bookName, pageNum);
          promises.push(
            readBoardJson(pageName)
              .then(function (boardObj) {
                return boardToSvgString(boardObj).then(function (svg) {
                  return { pageNum: pageNum, data: svg };
                });
              })
              .catch(function () {
                return null;
              }),
          );
        })(i);
      }
      return Promise.all(promises);
    })
    .then(function (pages) {
      var validPages = pages.filter(function (p) {
        return p !== null;
      });
      if (validPages.length === 0) {
        sendError(response, 404, "No pages found for this book");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="' + bookName + '-svg.zip"',
      });
      var archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(response);
      validPages.forEach(function (page) {
        archive.append(page.data, {
          name: bookName + "-p" + page.pageNum + ".svg",
        });
      });
      archive.finalize();
    })
    .catch(function (err) {
      handleRenderError(err, "book-svg-zip", bookName, response);
    });
}

function exportBookPngZip(bookName, response) {
  bookData
    .loadMeta(bookName)
    .then(function (meta) {
      var promises = [];
      for (var i = 1; i <= meta.pageCount; i++) {
        (function (pageNum) {
          var pageName = bookData.pageBoardName(bookName, pageNum);
          promises.push(
            readBoardJson(pageName)
              .then(function (boardObj) {
                return boardToSvgString(boardObj).then(function (svg) {
                  return { pageNum: pageNum, data: svgToPng(svg) };
                });
              })
              .catch(function () {
                return null;
              }),
          );
        })(i);
      }
      return Promise.all(promises);
    })
    .then(function (pages) {
      var validPages = pages.filter(function (p) {
        return p !== null;
      });
      if (validPages.length === 0) {
        sendError(response, 404, "No pages found for this book");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="' + bookName + '-png.zip"',
      });
      var archive = archiver("zip", { zlib: { level: 6 } });
      archive.pipe(response);
      validPages.forEach(function (page) {
        archive.append(page.data, {
          name: bookName + "-p" + page.pageNum + ".png",
        });
      });
      archive.finalize();
    })
    .catch(function (err) {
      handleRenderError(err, "book-png-zip", bookName, response);
    });
}

// ---- Helpers ----

function sendError(response, status, message) {
  var body = JSON.stringify({ error: message });
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function handleRenderError(err, action, name, response) {
  if (err.code === "ENOENT") {
    sendError(response, 404, "Board not found: " + name);
  } else {
    log("error", { action: "export-" + action, error: err.toString() });
    sendError(response, 500, "Export failed");
  }
}

module.exports = { handleExportRequest: handleExportRequest };
