/**
 * Socket.io connection handler.
 *
 * Responsibilities (after refactoring):
 *   - Wire socket.io to the HTTP server
 *   - JWT authentication middleware (if configured)
 *   - Delegate rate-limiting to RateLimiter
 *   - Delegate board lifecycle to BoardCache
 *   - Route socket messages to board operations
 *
 * @module sockets
 */

var iolib = require("socket.io"),
  { log, gauge, monitorFunction } = require("../util/log.js"),
  config = require("../configuration"),
  jsonwebtoken = require("jsonwebtoken"),
  { RateLimiter } = require("./RateLimiter.js"),
  boardCache = require("../board/BoardCache.js");

/**
 * Prevents a function from throwing errors.
 * If the inner function throws, the outer function just returns undefined
 * and logs the error.
 * @template A
 * @param {A} fn
 * @returns {A}
 */
function noFail(fn) {
  var monitored = monitorFunction(fn);
  return function noFailWrapped(arg) {
    try {
      return monitored(arg);
    } catch (e) {
      console.trace(e);
    }
  };
}

function startIO(app) {
  var io = iolib(app);

  if (config.AUTH_SECRET_KEY) {
    io.use(function (socket, next) {
      if (socket.handshake.query && socket.handshake.query.token) {
        jsonwebtoken.verify(
          socket.handshake.query.token,
          config.AUTH_SECRET_KEY,
          function (err, decoded) {
            if (err)
              return next(new Error("Authentication error: Invalid JWT"));
            next();
          },
        );
      } else {
        next(new Error("Authentication error: No jwt provided"));
      }
    });
  }

  io.on("connection", noFail(handleSocketConnection));
  return io;
}

/**
 * Executes on every new connection
 * @param {iolib.Socket} socket
 */
function handleSocketConnection(socket) {
  var limiter = new RateLimiter();

  /**
   * Function to call when a user joins a board
   * @param {string} name
   */
  async function joinBoard(name) {
    if (!name) name = "anonymous";

    socket.join(name);

    var board = await boardCache.getBoard(name);
    board.users.add(socket.id);
    log("board joined", { board: board.name, users: board.users.size });
    gauge("connected." + name, board.users.size);
    return board;
  }

  socket.on(
    "error",
    noFail(function onSocketError(error) {
      log("ERROR", error);
    }),
  );

  socket.on("getboard", async function onGetBoard(name) {
    var board = await joinBoard(name);
    socket.emit("broadcast", { _children: board.getAll() });
  });

  socket.on("joinboard", noFail(joinBoard));

  socket.on(
    "broadcast",
    noFail(function onBroadcast(message) {
      if (!limiter.allow(socket)) return;

      var boardName = message.board || "anonymous";
      var data = message.data;

      if (!socket.rooms.has(boardName)) socket.join(boardName);

      if (!data) {
        console.warn("Received invalid message: %s.", JSON.stringify(message));
        return;
      }

      if (
        !(data.tool || data.type === "child") ||
        config.BLOCKED_TOOLS.includes(data.tool)
      ) {
        log("BLOCKED MESSAGE", data);
        return;
      }

      // Save the message in the board
      handleMessage(boardName, data, socket);

      // Send data to all other users connected on the same board
      socket.broadcast.to(boardName).emit("broadcast", data);
    }),
  );

  socket.on("disconnecting", function onDisconnecting(reason) {
    socket.rooms.forEach(async function disconnectFrom(room) {
      if (boardCache.has(room)) {
        var board = await boardCache.getCached(room);
        board.users.delete(socket.id);
        var userCount = board.users.size;
        log("disconnection", {
          board: board.name,
          users: board.users.size,
          reason,
        });
        gauge("connected." + board.name, userCount);
        if (userCount === 0) boardCache.unloadBoard(room);
      }
    });
  });
}

function handleMessage(boardName, message, socket) {
  if (message.tool === "Cursor") {
    message.socket = socket.id;
  } else {
    saveHistory(boardName, message);
  }
}

async function saveHistory(boardName, message) {
  if (!(message.tool || message.type === "child") && !message._children) {
    console.error("Received a badly formatted message (no tool). ", message);
  }
  var board = await boardCache.getBoard(boardName);
  board.processMessage(message);
}

if (exports) {
  exports.start = startIO;
}
