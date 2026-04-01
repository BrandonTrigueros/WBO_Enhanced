/**
 * Book API route handler.
 * Handles all /api/books/{name}/... requests.
 * @module apiRouter
 */

var { log } = require("../util/log.js"),
  bookData = require("../book/bookData.js");

/**
 * Validate a board/book name.
 * @param {string} name
 * @returns {string} The validated name
 * @throws {Error} If the name contains disallowed characters
 */
function validateName(name) {
  if (/^[\w%\-_~()]*$/.test(name)) return name;
  throw new Error("Illegal name: " + name);
}

/**
 * Send a JSON response.
 * @param {import("http").ServerResponse} response
 * @param {number} statusCode
 * @param {object} data
 */
function sendJson(response, statusCode, data) {
  var body = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

/**
 * Handle API requests for book operations.
 * Routes:
 *   GET  /api/books/{name}/meta                  → book metadata
 *   POST /api/books/{name}/addpage               → add page
 *   POST /api/books/{name}/deletepage/{pageNum}  → delete page
 *
 * @param {string[]} parts - URL path segments
 * @param {URL} parsedUrl
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 */
function handleApiRequest(parts, parsedUrl, request, response) {
  if (parts[1] !== "books" || parts.length < 4) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  var bookName;
  try {
    bookName = validateName(parts[2]);
  } catch (e) {
    sendJson(response, 400, { error: "Invalid book name" });
    return;
  }

  var action = parts[3];

  switch (action) {
    case "meta":
      bookData
        .loadMeta(bookName)
        .then(function (meta) {
          sendJson(response, 200, meta);
        })
        .catch(function (err) {
          log("error", { error: err.toString() });
          sendJson(response, 500, { error: "Failed to load book metadata" });
        });
      break;

    case "addpage":
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      bookData
        .addPage(bookName)
        .then(function (meta) {
          sendJson(response, 200, meta);
        })
        .catch(function (err) {
          log("error", { error: err.toString() });
          sendJson(response, 500, { error: "Failed to add page" });
        });
      break;

    case "deletepage":
      if (request.method !== "POST") {
        sendJson(response, 405, { error: "Method not allowed" });
        return;
      }
      var pageNum = parseInt(parts[4], 10);
      if (isNaN(pageNum) || pageNum < 1) {
        sendJson(response, 400, { error: "Invalid page number" });
        return;
      }
      bookData
        .deletePage(bookName, pageNum)
        .then(function (result) {
          sendJson(response, 200, result);
        })
        .catch(function (err) {
          log("error", { error: err.toString() });
          sendJson(response, 500, { error: "Failed to delete page" });
        });
      break;

    default:
      sendJson(response, 404, { error: "Unknown action" });
  }
}

module.exports = {
  handleApiRequest: handleApiRequest,
  validateName: validateName,
};
