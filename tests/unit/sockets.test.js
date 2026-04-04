/**
 * Integration tests for sockets.js — socket.io connection handler.
 * Uses real socket.io client/server but with temp board storage.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { io: ioClient } = require("socket.io-client");
const jsonwebtoken = require("jsonwebtoken");

const SECRET = "socket-test-secret";

/**
 * Helper: create a throwaway HTTP server + WBO sockets.
 * Overrides HISTORY_DIR so tests don't touch real data.
 */
function createTestServer(authEnabled) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-sock-test-"));

  // Set env before loading modules (they read config at require time)
  process.env.WBO_HISTORY_DIR = tmpDir;
  if (authEnabled) {
    process.env.AUTH_SECRET_KEY = SECRET;
  } else {
    delete process.env.AUTH_SECRET_KEY;
  }

  // Clear cached modules so they pick up new env
  for (const key of Object.keys(require.cache)) {
    if (
      key.includes("server/") ||
      key.includes("socket.io") ||
      key.includes("BoardCache") ||
      key.includes("boardData") ||
      key.includes("BoardStorage") ||
      key.includes("configuration")
    ) {
      delete require.cache[key];
    }
  }

  const sockets = require("../../server/socket/sockets.js");
  const app = http.createServer();
  const ioServer = sockets.start(app);

  return new Promise((resolve) => {
    app.listen(0, function () {
      const port = app.address().port;
      resolve({ app, ioServer, port, tmpDir });
    });
  });
}

/** Connect a socket.io client to the test server */
function connectClient(port, token) {
  const opts = {
    forceNew: true,
    transports: ["websocket"],
  };
  if (token) opts.query = { token };
  return ioClient(`http://localhost:${port}`, opts);
}

/** Wait for a specific event on a socket */
function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for '${event}'`)),
      timeoutMs,
    );
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("sockets – no auth", function () {
  let server;
  let clients = [];

  beforeEach(async function () {
    server = await createTestServer(false);
  });

  afterEach(async function () {
    for (const c of clients) c.disconnect();
    clients = [];
    server.ioServer.close();
    await new Promise((r) => server.app.close(r));
    fs.rmSync(server.tmpDir, { recursive: true, force: true });
  });

  it("should allow connection without token when auth is disabled", async function () {
    const client = connectClient(server.port);
    clients.push(client);
    await waitFor(client, "connect");
    assert.ok(client.connected);
  });

  it("should return board contents on getboard", async function () {
    const client = connectClient(server.port);
    clients.push(client);
    await waitFor(client, "connect");

    client.emit("getboard", "test-board");
    const data = await waitFor(client, "broadcast");
    assert.ok(data._children !== undefined);
    assert.ok(Array.isArray(data._children));
  });

  it("should broadcast messages to other clients in the same board", async function () {
    const client1 = connectClient(server.port);
    const client2 = connectClient(server.port);
    clients.push(client1, client2);

    await waitFor(client1, "connect");
    await waitFor(client2, "connect");

    // Both join the same board
    client1.emit("getboard", "shared-board");
    await waitFor(client1, "broadcast"); // initial board state

    client2.emit("getboard", "shared-board");
    await waitFor(client2, "broadcast"); // initial board state

    // client1 sends a draw message
    const msg = {
      board: "shared-board",
      data: { id: "elem1", tool: "Pencil", x: 10, y: 20 },
    };
    client1.emit("broadcast", msg);

    // client2 should receive it
    const received = await waitFor(client2, "broadcast");
    assert.equal(received.tool, "Pencil");
    assert.equal(received.x, 10);
  });

  it("should not broadcast messages with blocked tools", async function () {
    const client1 = connectClient(server.port);
    const client2 = connectClient(server.port);
    clients.push(client1, client2);

    await waitFor(client1, "connect");
    await waitFor(client2, "connect");

    client1.emit("getboard", "block-board");
    await waitFor(client1, "broadcast");
    client2.emit("getboard", "block-board");
    await waitFor(client2, "broadcast");

    // Send a message with no tool (should be blocked)
    client1.emit("broadcast", {
      board: "block-board",
      data: { id: "bad1" },
    });

    // client2 should NOT receive anything — wait 500ms to confirm
    let received = false;
    client2.once("broadcast", () => { received = true; });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(received, false, "Should not broadcast a message with no tool");
  });

  it("should tag Cursor messages with socket id", async function () {
    const client1 = connectClient(server.port);
    const client2 = connectClient(server.port);
    clients.push(client1, client2);

    await waitFor(client1, "connect");
    await waitFor(client2, "connect");

    client1.emit("getboard", "cursor-board");
    await waitFor(client1, "broadcast");
    client2.emit("getboard", "cursor-board");
    await waitFor(client2, "broadcast");

    client1.emit("broadcast", {
      board: "cursor-board",
      data: { tool: "Cursor", x: 50, y: 60 },
    });

    const received = await waitFor(client2, "broadcast");
    assert.equal(received.tool, "Cursor");
    assert.ok(typeof received.socket === "string");
    assert.ok(received.socket.length > 0);
  });
});

describe("sockets – JWT authentication", function () {
  let server;
  let clients = [];

  beforeEach(async function () {
    server = await createTestServer(true);
  });

  afterEach(async function () {
    for (const c of clients) c.disconnect();
    clients = [];
    server.ioServer.close();
    await new Promise((r) => server.app.close(r));
    fs.rmSync(server.tmpDir, { recursive: true, force: true });
  });

  it("should accept connection with a valid JWT", async function () {
    const token = jsonwebtoken.sign({ roles: ["editor"] }, SECRET);
    const client = connectClient(server.port, token);
    clients.push(client);
    await waitFor(client, "connect");
    assert.ok(client.connected);
  });

  it("should reject connection with no token", async function () {
    const client = connectClient(server.port);
    clients.push(client);

    const err = await waitFor(client, "connect_error");
    assert.ok(err.message.includes("Authentication error"));
  });

  it("should reject connection with an invalid token", async function () {
    const client = connectClient(server.port, "invalid.jwt.token");
    clients.push(client);

    const err = await waitFor(client, "connect_error");
    assert.ok(err.message.includes("Authentication error"));
  });

  it("should reject connection with a token signed by wrong secret", async function () {
    const token = jsonwebtoken.sign({ roles: ["editor"] }, "wrong-secret");
    const client = connectClient(server.port, token);
    clients.push(client);

    const err = await waitFor(client, "connect_error");
    assert.ok(err.message.includes("Authentication error"));
  });
});
