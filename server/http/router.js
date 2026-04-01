/**
 * URL router — maps incoming HTTP requests to the correct handler.
 * Pure dispatch logic with no I/O or side effects of its own.
 * @module router
 */

var path = require("path"),
  fs = require("fs"),
  crypto = require("crypto"),
  polyfillLibrary = require("polyfill-library"),
  config = require("../configuration.js"),
  templating = require("./templating.js"),
  createSVG = require("../export/svgRenderer.js"),
  jwtauth = require("../auth/jwtauth.js"),
  jwtBoardName = require("../auth/jwtBoardnameAuth.js"),
  { log } = require("../util/log.js"),
  { CSP, fileserver, serveError } = require("./staticMiddleware.js"),
  { handleApiRequest, validateName } = require("./apiRouter.js"),
  { handleExportRequest } = require("../export/exportRouter.js"),
  { handleImageServe } = require("./imageRouter.js");

// ---- Templates (loaded once) ----

var boardTemplate = new templating.BoardTemplate(
  path.join(config.WEBROOT, "board.html"),
);
var indexTemplate = new templating.Template(
  path.join(config.WEBROOT, "index.html"),
);
var bookTemplate = new templating.BookTemplate(
  path.join(config.WEBROOT, "book.html"),
);

// ---- Helpers ----

/**
 * Write a request to the logs.
 * @param {import("http").IncomingMessage} request
 */
function logRequest(request) {
  log("connection", {
    ip: request.socket.remoteAddress,
    original_ip:
      request.headers["x-forwarded-for"] || request.headers["forwarded"],
    user_agent: request.headers["user-agent"],
    referer: request.headers["referer"],
    language: request.headers["accept-language"],
    url: request.url,
  });
}

// ---- Route handler ----

/**
 * Main request dispatcher. Routes the request to the correct handler
 * based on the first URL path segment.
 *
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 */
function handleRequest(request, response) {
  var parsedUrl = new URL(request.url, "http://wbo/");
  var parts = parsedUrl.pathname.split("/");
  if (parts[0] === "") parts.shift();

  var fileExt = path.extname(parsedUrl.pathname);
  var staticResources = [".js", ".css", ".svg", ".ico", ".png", ".jpg", "gif"];
  var isModerator = false;
  if (!staticResources.includes(fileExt)) {
    isModerator = jwtauth.checkUserPermission(parsedUrl);
  }

  switch (parts[0]) {
    case "boards":
      handleBoards(parts, parsedUrl, request, response, isModerator);
      break;

    case "download":
      handleDownload(parts, parsedUrl, request, response);
      break;

    case "export":
      handleExportRequest(parts, parsedUrl, request, response);
      break;

    case "preview":
      handlePreview(parts, parsedUrl, request, response);
      break;

    case "random":
      var name = crypto
        .randomBytes(32)
        .toString("base64")
        .replace(/[^\w]/g, "-");
      response.writeHead(307, { Location: "boards/" + name });
      response.end(name);
      break;

    case "randombook":
      var bookName = crypto
        .randomBytes(32)
        .toString("base64")
        .replace(/[^\w]/g, "-");
      response.writeHead(307, { Location: "books/" + bookName });
      response.end(bookName);
      break;

    case "books":
      handleBooks(parts, parsedUrl, request, response, isModerator);
      break;

    case "api":
      handleApiRequest(parts, parsedUrl, request, response);
      break;

    case "images":
      handleImageServe(parts, request, response);
      break;

    case "polyfill.js":
    case "polyfill.min.js":
      handlePolyfill(request, response);
      break;

    case "":
      logRequest(request);
      if (config.DEFAULT_BOARD) {
        response.writeHead(302, {
          Location: "boards/" + encodeURIComponent(config.DEFAULT_BOARD),
        });
        response.end();
      } else {
        indexTemplate.serve(request, response);
      }
      break;

    default:
      fileserver(request, response, serveError(request, response));
  }
}

// ---- Route implementations ----

function handleBoards(parts, parsedUrl, request, response, isModerator) {
  if (parts.length === 1) {
    var boardName = parsedUrl.searchParams.get("board") || "anonymous";
    jwtBoardName.checkBoardnameInToken(parsedUrl, boardName);
    response.writeHead(301, {
      Location: "boards/" + encodeURIComponent(boardName),
    });
    response.end();
  } else if (parts.length === 2 && parsedUrl.pathname.indexOf(".") === -1) {
    var boardName = validateName(parts[1]);
    jwtBoardName.checkBoardnameInToken(parsedUrl, boardName);
    boardTemplate.serve(request, response, isModerator);
  } else {
    request.url = "/" + parts.slice(1).join("/");
    fileserver(request, response, serveError(request, response));
  }
}

function handleDownload(parts, parsedUrl, request, response) {
  var boardName = validateName(parts[1]);
  var history_file = path.join(
    config.HISTORY_DIR,
    "board-" + boardName + ".json",
  );
  jwtBoardName.checkBoardnameInToken(parsedUrl, boardName);
  if (parts.length > 2 && /^[0-9A-Za-z.\-]+$/.test(parts[2])) {
    history_file += "." + parts[2] + ".bak";
  }
  log("download", { file: history_file });
  fs.readFile(history_file, function (err, data) {
    if (err) return serveError(request, response)(err);
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="' + boardName + '.wbo"',
      "Content-Length": data.length,
    });
    response.end(data);
  });
}

function handlePreview(parts, parsedUrl, request, response) {
  var boardName = validateName(parts[1]);
  var history_file = path.join(
    config.HISTORY_DIR,
    "board-" + boardName + ".json",
  );
  jwtBoardName.checkBoardnameInToken(parsedUrl, boardName);
  response.writeHead(200, {
    "Content-Type": "image/svg+xml",
    "Content-Security-Policy": CSP,
    "Cache-Control": "public, max-age=30",
  });
  var t = Date.now();
  createSVG
    .renderBoard(history_file, response)
    .then(function () {
      log("preview", { board: boardName, time: Date.now() - t });
      response.end();
    })
    .catch(function (err) {
      log("error", { error: err.toString(), stack: err.stack });
      response.end("<text>Sorry, an error occured</text>");
    });
}

function handleBooks(parts, parsedUrl, request, response, isModerator) {
  if (parts.length === 1) {
    var bName = parsedUrl.searchParams.get("book") || "notebook";
    response.writeHead(301, {
      Location: "books/" + encodeURIComponent(bName),
    });
    response.end();
  } else if (parts.length === 2 && parsedUrl.pathname.indexOf(".") === -1) {
    validateName(parts[1]);
    bookTemplate.serve(request, response, isModerator);
  } else {
    request.url = "/" + parts.slice(1).join("/");
    fileserver(request, response, serveError(request, response));
  }
}

function handlePolyfill(request, response) {
  polyfillLibrary
    .getPolyfillString({
      uaString: request.headers["user-agent"],
      minify: request.url.endsWith(".min.js"),
      features: {
        default: { flags: ["gated"] },
        es5: { flags: ["gated"] },
        es6: { flags: ["gated"] },
        es7: { flags: ["gated"] },
        es2017: { flags: ["gated"] },
        es2018: { flags: ["gated"] },
        es2019: { flags: ["gated"] },
        "performance.now": { flags: ["gated"] },
      },
    })
    .then(function (bundleString) {
      response.setHeader(
        "Cache-Control",
        "private, max-age=172800, stale-while-revalidate=1728000",
      );
      response.setHeader("Vary", "User-Agent");
      response.setHeader("Content-Type", "application/javascript");
      response.end(bundleString);
    });
}

module.exports = { handleRequest: handleRequest };
