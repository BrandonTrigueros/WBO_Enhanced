/**
 * Unit tests for imageRouter — upload validation and magic byte checks.
 */
var { describe, it, before, after } = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var os = require("os");
var path = require("path");

// --- Minimal PNG, JPEG, GIF, WEBP buffers for testing ---

// Smallest valid PNG (1x1 transparent)
var VALID_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c626000000002000198e1938a0000000049454e44ae426082",
  "hex",
);

// JPEG starts with FF D8 FF
var VALID_JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(100, 0x00),
]);

// GIF starts with GIF89a
var VALID_GIF = Buffer.from("GIF89a" + "\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x00\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;", "binary");

// WEBP starts with RIFF....WEBP
var VALID_WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.alloc(100, 0x00),
]);

describe("imageRouter", function () {
  var tmpDir;
  var imageRouter;

  before(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-img-"));
    process.env["WBO_HISTORY_DIR"] = tmpDir;

    // Clear cached config and imageRouter
    delete require.cache[require.resolve("../../server/configuration.js")];
    delete require.cache[require.resolve("../../server/http/imageRouter.js")];

    imageRouter = require("../../server/http/imageRouter.js");
  });

  after(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("handleImageUpload", function () {
    function mockRequest(method, contentType, body) {
      var events = {};
      return {
        method: method,
        headers: { "content-type": contentType },
        on: function (event, cb) {
          events[event] = cb;
        },
        destroy: function () {},
        _emit: function (event, data) {
          if (events[event]) events[event](data);
        },
      };
    }

    function mockResponse() {
      var res = {
        statusCode: null,
        headers: {},
        body: "",
        writableEnded: false,
        writeHead: function (code, hdrs) {
          res.statusCode = code;
          Object.assign(res.headers, hdrs || {});
        },
        end: function (data) {
          res.body = data || "";
          res.writableEnded = true;
        },
      };
      return res;
    }

    it("should reject non-POST methods", function () {
      var req = mockRequest("GET", "image/png", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("testboard", req, res);
      assert.equal(res.statusCode, 405);
    });

    it("should reject unsupported content types", function () {
      var req = mockRequest("POST", "text/plain", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("testboard", req, res);
      assert.equal(res.statusCode, 400);
      assert.ok(res.body.includes("Unsupported"));
    });

    it("should reject empty body", function (_, done) {
      var req = mockRequest("POST", "image/png", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("testboard", req, res);
      // Simulate empty body
      req._emit("end");
      setTimeout(function () {
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.includes("Empty"));
        done();
      }, 50);
    });

    it("should reject mismatched magic bytes", function (_, done) {
      var req = mockRequest("POST", "image/png", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("testboard", req, res);
      // Send JPEG data with PNG content-type
      req._emit("data", VALID_JPEG);
      req._emit("end");
      setTimeout(function () {
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.includes("does not match"));
        done();
      }, 50);
    });

    it("should accept valid PNG upload", function (_, done) {
      var req = mockRequest("POST", "image/png", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("testboard", req, res);
      req._emit("data", VALID_PNG);
      req._emit("end");
      setTimeout(function () {
        assert.equal(res.statusCode, 201);
        var parsed = JSON.parse(res.body);
        assert.ok(parsed.path.startsWith("/images/testboard/"));
        assert.ok(parsed.path.endsWith(".png"));
        done();
      }, 100);
    });

    it("should deduplicate identical uploads", function (_, done) {
      var req1 = mockRequest("POST", "image/png", null);
      var res1 = mockResponse();
      imageRouter.handleImageUpload("testboard", req1, res1);
      req1._emit("data", VALID_PNG);
      req1._emit("end");
      setTimeout(function () {
        var path1 = JSON.parse(res1.body).path;
        // Second upload of same content
        var req2 = mockRequest("POST", "image/png", null);
        var res2 = mockResponse();
        imageRouter.handleImageUpload("testboard", req2, res2);
        req2._emit("data", VALID_PNG);
        req2._emit("end");
        setTimeout(function () {
          assert.equal(res2.statusCode, 200); // 200 not 201 for dedup
          assert.equal(JSON.parse(res2.body).path, path1);
          done();
        }, 100);
      }, 100);
    });

    it("should accept valid JPEG upload", function (_, done) {
      var req = mockRequest("POST", "image/jpeg", null);
      var res = mockResponse();
      imageRouter.handleImageUpload("jpegboard", req, res);
      req._emit("data", VALID_JPEG);
      req._emit("end");
      setTimeout(function () {
        assert.equal(res.statusCode, 201);
        assert.ok(JSON.parse(res.body).path.endsWith(".jpg"));
        done();
      }, 100);
    });
  });

  describe("handleImageServe", function () {
    it("should return 400 for invalid path", function () {
      var res = mockResponse();
      imageRouter.handleImageServe(["images", "../etc", "passwd"], {}, res);
      assert.equal(res.statusCode, 400);

      function mockResponse() {
        var r = { statusCode: null, writeHead: function (c) { r.statusCode = c; }, end: function () {} };
        return r;
      }
    });

    it("should return 404 for missing file", function (_, done) {
      var res = {
        statusCode: null,
        writeHead: function (c) { res.statusCode = c; },
        end: function () {
          assert.equal(res.statusCode, 404);
          done();
        },
      };
      imageRouter.handleImageServe(["images", "nonexistent", "abc123.png"], {}, res);
    });

    it("should reject paths with too few segments", function () {
      var res = { statusCode: null, writeHead: function (c) { res.statusCode = c; }, end: function () {} };
      imageRouter.handleImageServe(["images", "boardonly"], {}, res);
      assert.equal(res.statusCode, 404);
    });
  });
});
