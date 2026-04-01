/**
 * API integration tests — export endpoints.
 * Tests /export/board/{name}.{svg|png|pdf} and /export/book/{name}.{pdf|svg|png}.
 */
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 8491;
let server;
let dataDir;

/**
 * HTTP request helper that returns raw Buffer body.
 */
function request(method, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method: method },
      function (res) {
        var chunks = [];
        res.on("data", function (chunk) { chunks.push(chunk); });
        res.on("end", function () {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

before(async function () {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-export-"));
  process.env["PORT"] = PORT;
  process.env["WBO_HISTORY_DIR"] = dataDir;

  // Seed a board
  var boardData = {
    r1: { id: "r1", x: 50, y: 50, x2: 300, y2: 200, tool: "Rectangle", color: "#ff0000", size: 3 },
    t1: { id: "t1", x: 100, y: 100, tool: "Text", txt: "Test", color: "#000", size: 12 },
  };
  fs.writeFileSync(
    path.join(dataDir, "board-testboard.json"),
    JSON.stringify(boardData),
  );

  // Seed a 2-page book
  var page1 = { p1: { id: "p1", x: 10, y: 10, x2: 400, y2: 300, tool: "Rectangle", color: "#00f", size: 2 } };
  var page2 = { p2: { id: "p2", x: 50, y: 80, tool: "Text", txt: "Page 2", color: "#333", size: 16 } };
  fs.writeFileSync(
    path.join(dataDir, "board-book~testbook~p1.json"),
    JSON.stringify(page1),
  );
  fs.writeFileSync(
    path.join(dataDir, "board-book~testbook~p2.json"),
    JSON.stringify(page2),
  );
  fs.writeFileSync(
    path.join(dataDir, "book-meta-testbook.json"),
    JSON.stringify({ pageCount: 2, createdAt: new Date().toISOString() }),
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

// ---- Board exports ----

describe("Board export", function () {
  describe("GET /export/board/{name}.svg", function () {
    it("should return SVG with correct content-type", async function () {
      var res = await request("GET", "/export/board/testboard.svg");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("image/svg+xml"));
      var body = res.body.toString();
      assert.ok(body.startsWith("<svg "));
      assert.ok(body.includes("</svg>"));
    });
  });

  describe("GET /export/board/{name}.png", function () {
    it("should return PNG with correct content-type", async function () {
      var res = await request("GET", "/export/board/testboard.png");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("image/png"));
      // PNG magic bytes
      assert.equal(res.body[0], 0x89);
      assert.equal(res.body[1], 0x50);
      assert.equal(res.body[2], 0x4e);
      assert.equal(res.body[3], 0x47);
    });
  });

  describe("GET /export/board/{name}.pdf", function () {
    it("should return PDF with correct content-type", async function () {
      var res = await request("GET", "/export/board/testboard.pdf");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/pdf"));
      var header = res.body.slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });
  });

  describe("GET /export/board/{name}.xyz (unsupported)", function () {
    it("should return 400", async function () {
      var res = await request("GET", "/export/board/testboard.xyz");
      assert.equal(res.statusCode, 400);
    });
  });

  describe("GET /export/board/nonexistent.svg", function () {
    it("should return 404", async function () {
      var res = await request("GET", "/export/board/nonexistent.svg");
      assert.equal(res.statusCode, 404);
    });
  });
});

// ---- Book exports ----

describe("Book export", function () {
  describe("GET /export/book/{name}.pdf", function () {
    it("should return multi-page PDF", async function () {
      var res = await request("GET", "/export/book/testbook.pdf");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/pdf"));
      var header = res.body.slice(0, 5).toString("ascii");
      assert.equal(header, "%PDF-");
    });
  });

  describe("GET /export/book/{name}.svg (zip)", function () {
    it("should return zip with SVG files", async function () {
      var res = await request("GET", "/export/book/testbook.svg");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/zip"));
      // ZIP magic bytes: PK (50 4B)
      assert.equal(res.body[0], 0x50);
      assert.equal(res.body[1], 0x4b);
    });
  });

  describe("GET /export/book/{name}.png (zip)", function () {
    it("should return zip with PNG files", async function () {
      var res = await request("GET", "/export/book/testbook.png");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/zip"));
      // ZIP magic bytes
      assert.equal(res.body[0], 0x50);
      assert.equal(res.body[1], 0x4b);
    });
  });

  describe("GET /export/book/{name}/p{N}.png", function () {
    it("should return single page PNG", async function () {
      var res = await request("GET", "/export/book/testbook/p1.png");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("image/png"));
      assert.equal(res.body[0], 0x89);
    });
  });

  describe("GET /export/book/{name}/p{N}.svg", function () {
    it("should return single page SVG", async function () {
      var res = await request("GET", "/export/book/testbook/p1.svg");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("image/svg+xml"));
    });
  });

  describe("GET /export/book/{name}/p{N}.pdf", function () {
    it("should return single page PDF", async function () {
      var res = await request("GET", "/export/book/testbook/p1.pdf");
      assert.equal(res.statusCode, 200);
      assert.ok(res.headers["content-type"].includes("application/pdf"));
    });
  });

  describe("GET /export/book/nonexistent.pdf", function () {
    it("should return 404 for nonexistent book", async function () {
      var res = await request("GET", "/export/book/nonexistent.pdf");
      assert.equal(res.statusCode, 404);
    });
  });
});
