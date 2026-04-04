/**
 * Image upload and serving for embedded images.
 *
 * Upload:  POST /api/boards/{name}/images  (raw binary body)
 * Serve:   GET  /images/{boardName}/{filename}
 *
 * Images are stored in {HISTORY_DIR}/images/{boardName}/{sha256hash}.{ext}
 *
 * @module imageRouter
 */

var fs = require("fs"),
  path = require("path"),
  crypto = require("crypto"),
  config = require("../configuration.js"),
  { log } = require("../util/log.js");

var MIME_TO_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Ensure the images directory for a board exists.
 * @param {string} boardName
 * @returns {string} absolute path to the directory
 */
function ensureImageDir(boardName) {
  var dir = path.join(config.HISTORY_DIR, "images", boardName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Handle POST /api/boards/{name}/images
 * Expects raw image bytes in the request body with Content-Type header.
 *
 * @param {string} boardName — validated board name
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 */
function handleImageUpload(boardName, request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  var contentType = (request.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  var ext = MIME_TO_EXT[contentType];
  if (!ext) {
    sendJson(response, 400, {
      error:
        "Unsupported image type. Allowed: " +
        config.ALLOWED_IMAGE_TYPES.join(", "),
    });
    return;
  }

  var chunks = [];
  var totalSize = 0;

  request.on("data", function (chunk) {
    totalSize += chunk.length;
    if (totalSize > config.MAX_IMAGE_SIZE) {
      request.destroy();
      sendJson(response, 413, {
        error:
          "Image too large. Maximum: " +
          config.MAX_IMAGE_SIZE / 1024 / 1024 +
          " MB",
      });
      return;
    }
    chunks.push(chunk);
  });

  request.on("end", function () {
    if (totalSize > config.MAX_IMAGE_SIZE) return; // already responded
    if (totalSize === 0) {
      sendJson(response, 400, { error: "Empty request body" });
      return;
    }

    var buffer = Buffer.concat(chunks);

    // Verify magic bytes match claimed content type
    if (!validateMagicBytes(buffer, contentType)) {
      sendJson(response, 400, {
        error: "File content does not match Content-Type",
      });
      return;
    }

    var hash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex")
      .slice(0, 16);
    var filename = hash + "." + ext;
    var dir = ensureImageDir(boardName);
    var filePath = path.join(dir, filename);

    // If file already exists (same content), skip write
    if (fs.existsSync(filePath)) {
      var imagePath = "/images/" + boardName + "/" + filename;
      log("image upload (dedup)", {
        board: boardName,
        file: filename,
        size: totalSize,
      });
      sendJson(response, 200, { path: imagePath });
      return;
    }

    fs.writeFile(filePath, buffer, function (err) {
      if (err) {
        log("image write error", { error: err.toString() });
        sendJson(response, 500, { error: "Failed to save image" });
        return;
      }
      var imagePath = "/images/" + boardName + "/" + filename;
      log("image upload", {
        board: boardName,
        file: filename,
        size: totalSize,
      });
      sendJson(response, 201, { path: imagePath });
    });
  });

  request.on("error", function (err) {
    log("image upload stream error", { error: err.toString() });
    sendJson(response, 500, { error: "Upload failed" });
  });
}

/**
 * Handle GET /images/{boardName}/{filename}
 * Serves the image file with proper caching headers.
 *
 * @param {string[]} parts — ["images", boardName, filename]
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 */
function handleImageServe(parts, request, response) {
  if (parts.length !== 3) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  var boardName = parts[1];
  var filename = parts[2];

  // Validate: no path traversal, only hash.ext pattern
  if (
    !/^[\w%\-_~()]+$/.test(boardName) ||
    !/^[a-f0-9]+\.(png|jpg|gif|webp)$/.test(filename)
  ) {
    response.writeHead(400);
    response.end("Invalid path");
    return;
  }

  var filePath = path.join(config.HISTORY_DIR, "images", boardName, filename);

  fs.stat(filePath, function (err, stats) {
    if (err || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    var ext = path.extname(filename).slice(1);
    var mimeTypes = {
      png: "image/png",
      jpg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };

    response.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    fs.createReadStream(filePath).pipe(response);
  });
}

// ---- Helpers ----

function sendJson(response, statusCode, data) {
  if (response.writableEnded) return;
  var body = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

/**
 * Validate that the file's magic bytes match the claimed MIME type.
 * @param {Buffer} buffer
 * @param {string} mime
 * @returns {boolean}
 */
function validateMagicBytes(buffer, mime) {
  if (buffer.length < 4) return false;
  switch (mime) {
    case "image/png":
      return (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "image/jpeg":
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/gif":
      return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46 &&
        buffer[8] === 0x57 &&
        buffer[9] === 0x45 &&
        buffer[10] === 0x42 &&
        buffer[11] === 0x50
      );
    default:
      return false;
  }
}

module.exports = {
  handleImageUpload: handleImageUpload,
  handleImageServe: handleImageServe,
};
