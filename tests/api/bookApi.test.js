/**
 * API integration tests — spins up the real HTTP server and tests
 * the book API endpoints (/api/books/{name}/meta, addpage, deletepage).
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 8489;
let server;
let dataDir;

/**
 * Simple HTTP request helper (no external deps).
 * @param {string} method
 * @param {string} urlPath
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function request(method, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method: method },
      function (res) {
        var body = "";
        res.on("data", function (chunk) {
          body += chunk;
        });
        res.on("end", function () {
          resolve({ statusCode: res.statusCode, body: body });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function parseBody(res) {
  return JSON.parse(res.body);
}

before(async function () {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-api-"));
  process.env["PORT"] = PORT;
  process.env["WBO_HISTORY_DIR"] = dataDir;

  // Clear module cache so server picks up our env vars
  delete require.cache[require.resolve("../../server/server.js")];
  delete require.cache[require.resolve("../../server/configuration.js")];
  delete require.cache[require.resolve("../../server/http/router.js")];
  delete require.cache[require.resolve("../../server/http/apiRouter.js")];
  delete require.cache[require.resolve("../../server/book/bookData.js")];
  delete require.cache[require.resolve("../../server/book/BookStorage.js")];
  delete require.cache[require.resolve("../../server/board/boardData.js")];
  delete require.cache[require.resolve("../../server/board/BoardStorage.js")];
  delete require.cache[require.resolve("../../server/board/BoardCache.js")];
  delete require.cache[require.resolve("../../server/socket/sockets.js")];
  delete require.cache[require.resolve("../../server/socket/RateLimiter.js")];
  delete require.cache[require.resolve("../../server/util/log.js")];

  server = require("../../server/server.js");
  // Wait a tick for server to start listening
  await new Promise(function (r) {
    setTimeout(r, 300);
  });
});

after(function (_, done) {
  if (server && server.close) {
    server.close(function () {
      fs.rmSync(dataDir, { recursive: true, force: true });
      done();
    });
  } else {
    fs.rmSync(dataDir, { recursive: true, force: true });
    done();
  }
});

describe("Book API", function () {
  describe("GET /api/books/{name}/meta", function () {
    it("should create default metadata for new book", async function () {
      var res = await request("GET", "/api/books/testbook/meta");
      assert.equal(res.statusCode, 200);
      var meta = parseBody(res);
      assert.equal(meta.pageCount, 1);
      assert.ok(meta.createdAt);
    });

    it("should return 400 for invalid book name", async function () {
      var res = await request("GET", "/api/books/bad%20name!/meta");
      assert.equal(res.statusCode, 400);
    });
  });

  describe("POST /api/books/{name}/addpage", function () {
    it("should add a page and return updated meta", async function () {
      // Ensure book exists
      await request("GET", "/api/books/addtest/meta");

      var res = await request("POST", "/api/books/addtest/addpage");
      assert.equal(res.statusCode, 200);
      var meta = parseBody(res);
      assert.equal(meta.pageCount, 2);
    });

    it("should reject GET method", async function () {
      var res = await request("GET", "/api/books/addtest/addpage");
      assert.equal(res.statusCode, 405);
    });
  });

  describe("POST /api/books/{name}/deletepage/{num}", function () {
    it("should delete a page from a multi-page book", async function () {
      // Create a 3-page book
      await request("GET", "/api/books/deltest/meta");
      await request("POST", "/api/books/deltest/addpage");
      await request("POST", "/api/books/deltest/addpage");

      // Verify 3 pages
      var metaRes = await request("GET", "/api/books/deltest/meta");
      assert.equal(parseBody(metaRes).pageCount, 3);

      // Delete page 2
      var res = await request("POST", "/api/books/deltest/deletepage/2");
      assert.equal(res.statusCode, 200);
      var result = parseBody(res);
      assert.equal(result.deleted, true);
      assert.equal(result.pageCount, 2);
    });

    it("should refuse to delete the last page", async function () {
      await request("GET", "/api/books/singlepage/meta");
      var res = await request("POST", "/api/books/singlepage/deletepage/1");
      assert.equal(res.statusCode, 200);
      var result = parseBody(res);
      assert.equal(result.deleted, false);
      assert.equal(result.pageCount, 1);
    });

    it("should return 400 for invalid page number", async function () {
      var res = await request("POST", "/api/books/deltest/deletepage/abc");
      assert.equal(res.statusCode, 400);
    });

    it("should reject GET method", async function () {
      var res = await request("GET", "/api/books/deltest/deletepage/1");
      assert.equal(res.statusCode, 405);
    });
  });

  describe("Route handling", function () {
    it("should return 200 for landing page", async function () {
      var res = await request("GET", "/");
      assert.equal(res.statusCode, 200);
    });

    it("should return 200 for board page", async function () {
      var res = await request("GET", "/boards/testboard");
      assert.equal(res.statusCode, 200);
    });

    it("should return 200 for book page", async function () {
      var res = await request("GET", "/books/testbook");
      assert.equal(res.statusCode, 200);
    });

    it("should return 404 for unknown API routes", async function () {
      var res = await request("GET", "/api/unknown");
      assert.equal(res.statusCode, 404);
    });
  });
});
