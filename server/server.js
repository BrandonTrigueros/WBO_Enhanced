/**
 * WBO Enhanced — Application entry point (bootstrap).
 *
 * Responsibilities: create HTTP server, wire modules, start listening.
 * All routing lives in router.js, static serving in staticMiddleware.js,
 * API dispatch in apiRouter.js.
 *
 * @module server
 */

var { log, monitorFunction } = require("./util/log.js"),
  config = require("./configuration.js"),
  check_output_directory = require("./util/check_output_directory.js"),
  sockets = require("./socket/sockets.js"),
  { handleRequest } = require("./http/router.js");

var MIN_NODE_VERSION = 10.0;

if (parseFloat(process.versions.node) < MIN_NODE_VERSION) {
  console.warn(
    "!!! You are using node " +
      process.version +
      ", wbo requires at least " +
      MIN_NODE_VERSION +
      " !!!",
  );
}

check_output_directory(config.HISTORY_DIR);

var monitoredHandler = monitorFunction(handleRequest);

function handler(request, response) {
  try {
    monitoredHandler(request, response);
  } catch (err) {
    console.trace(err);
    response.writeHead(500, { "Content-Type": "text/plain" });
    response.end(err.toString());
  }
}

var app = require("http").createServer(handler);

sockets.start(app);

app.listen(config.PORT, config.HOST);
log("server started", { port: config.PORT });

module.exports = app;
