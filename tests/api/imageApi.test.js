/**
 * API integration tests — image upload and serving endpoints.
 */
var { describe, it, before, after } = require("node:test");
var assert = require("node:assert/strict");
var http = require("http");
var fs = require("fs");
var os = require("os");
var path = require("path");

var PORT = 8492;
var server;
var dataDir;

// Smallest valid PNG (1x1 transparent)
var VALID_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c626000000002000198e1938a0000000049454e44ae426082",
  "hex",
);

/**
 * HTTP request helper.
 */
function request(method, urlPath, body, headers) {
  return new Promise(function (resolve, reject) {
    var opts = {
      hostname: "127.0.0.1",
      port: PORT,
      path: urlPath,
      method: method,
      headers: headers || {},
    };
    var req = http.request(opts, function (res) {
      var chunks = [];
      res.on("data", function (chunk) { chunks.push(chunk); });
      res.on("end", function () {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

before(async function () {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-imgapi-"));
  process.env["PORT"] = PORT;
  process.env["WBO_HISTORY_DIR"] = dataDir;

  // Seed a board so the board name exists
  fs.writeFileSync(
    path.join(dataDir, "board-testboard.json"),
    JSON.stringify({}),
  );

  // Clear module cache
  var modulesToClear = [
    "../../server/server.js",
    "../../server/configuration.js",
    "../../server/http/router.js",
    "../../server/http/apiRouter.js",
    "../../server/http/imageRouter.js",
    "../../server/http/staticMiddleware.js",
    "../../server/export/exportRouter.js",
    "../../server/export/svgRenderer.js",
    "../../server/export/pngRenderer.js",
    "../../server/export/pdfRenderer.js",
    "../../server/book/bookData.js",
    "../../server/book/BookStorage.js",
    "../../server/board/boardData.js",
    "../../server/board/BoardStorage.js",
    "../../server/board/BoardCache.js",
    "../../server/socket/sockets.js",
    "../../server/socket/RateLimiter.js",
    "../../server/util/log.js",
  ];
  modulesToClear.forEach(function (mod) {
    delete require.cache[require.resolve(mod)];
  });

  server = require("../../server/server.js");
  await new Promise(function (r) { setTimeout(r, 500); });
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

describe("Image upload API", function () {
  var uploadedPath;

  describe("POST /api/boards/{name}/images", function () {
    it("should upload a valid PNG and return path", async function () {
      var res = await request("POST", "/api/boards/testboard/images", VALID_PNG, {
        "Content-Type": "image/png",
      });
      assert.equal(res.statusCode, 201);
      var body = JSON.parse(res.body.toString());
      assert.ok(body.path.startsWith("/images/testboard/"));
      assert.ok(body.path.endsWith(".png"));
      uploadedPath = body.path;
    });

    it("should deduplicate identical uploads (200 not 201)", async function () {
      var res = await request("POST", "/api/boards/testboard/images", VALID_PNG, {
        "Content-Type": "image/png",
      });
      assert.equal(res.statusCode, 200);
      var body = JSON.parse(res.body.toString());
      assert.equal(body.path, uploadedPath);
    });

    it("should reject unsupported content type", async function () {
      var res = await request("POST", "/api/boards/testboard/images", Buffer.from("hello"), {
        "Content-Type": "text/plain",
      });
      assert.equal(res.statusCode, 400);
    });

    it("should reject mismatched magic bytes", async function () {
      // Send GIF header with PNG content type
      var fakeBody = Buffer.from("GIF89a\x01\x00\x01\x00", "binary");
      var res = await request("POST", "/api/boards/testboard/images", fakeBody, {
        "Content-Type": "image/png",
      });
      assert.equal(res.statusCode, 400);
    });
  });

  describe("GET /images/{boardName}/{filename}", function () {
    it("should serve the uploaded image", async function () {
      // First upload
      var upRes = await request("POST", "/api/boards/testboard/images", VALID_PNG, {
        "Content-Type": "image/png",
      });
      var imgPath = JSON.parse(upRes.body.toString()).path;

      // Then fetch
      var res = await request("GET", imgPath);
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("image/png"));
      assert.ok(res.headers["cache-control"].includes("immutable"));
      // PNG magic bytes
      assert.equal(res.body[0], 0x89);
      assert.equal(res.body[1], 0x50);
    });

    it("should return 404 for nonexistent image", async function () {
      var res = await request("GET", "/images/testboard/0000000000000000.png");
      assert.equal(res.statusCode, 404);
    });

    it("should reject path traversal attempt", async function () {
      var res = await request("GET", "/images/../../../etc/passwd");
      // Path gets normalized by URL parser; handler returns 400 or router returns 404
      assert.ok(res.statusCode === 400 || res.statusCode === 404, "should not serve file");
    });
  });
});
