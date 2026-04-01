/**
 * Static file serving middleware and error page handler.
 * @module staticMiddleware
 */

var path = require("path"),
  fs = require("fs"),
  serveStatic = require("serve-static"),
  config = require("../configuration.js");

var CSP =
  "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:";

var fileserver = serveStatic(config.WEBROOT, {
  maxAge: 2 * 3600 * 1000,
  setHeaders: function (res) {
    res.setHeader("X-UA-Compatible", "IE=Edge");
    res.setHeader("Content-Security-Policy", CSP);
  },
});

var errorPage = fs.readFileSync(path.join(config.WEBROOT, "error.html"));

/**
 * Serve the error page with a 500 or 404 status.
 * @param {import("http").IncomingMessage} request
 * @param {import("http").ServerResponse} response
 * @returns {function} Error callback for serve-static
 */
function serveError(request, response) {
  var { log } = require("../util/log.js");
  return function (err) {
    log("error", { error: err && err.toString(), url: request.url });
    response.writeHead(err ? 500 : 404, { "Content-Length": errorPage.length });
    response.end(errorPage);
  };
}

module.exports = {
  CSP: CSP,
  fileserver: fileserver,
  serveError: serveError,
};
