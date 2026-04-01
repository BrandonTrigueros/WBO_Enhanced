/**
 * Unit tests for BoardData — board business logic.
 * Tests message processing, validation, item limits, and load/save lifecycle.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { BoardData } = require("../../server/board/boardData.js");
const { BoardStorage } = require("../../server/board/BoardStorage.js");

describe("BoardData", function () {
  let tmpDir;
  let storage;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-bd-"));
    storage = new BoardStorage(tmpDir);
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("set / get", function () {
    it("should store and retrieve an element", function () {
      var board = new BoardData("test", storage);
      board.set("elem1", { x: 10, y: 20, tool: "Pencil" });
      var elem = board.get("elem1");
      assert.equal(elem.x, 10);
      assert.equal(elem.y, 20);
    });

    it("should add a timestamp to elements", function () {
      var board = new BoardData("test", storage);
      board.set("elem1", { x: 0, y: 0 });
      assert.ok(board.get("elem1").time > 0);
    });
  });

  describe("delete", function () {
    it("should remove an element", function () {
      var board = new BoardData("test", storage);
      board.set("elem1", { x: 0, y: 0 });
      board.delete("elem1");
      assert.equal(board.get("elem1"), undefined);
    });
  });

  describe("addChild", function () {
    it("should add a child to an existing element", function () {
      var board = new BoardData("test", storage);
      board.set("parent", { x: 0, y: 0 });
      var result = board.addChild("parent", { x: 5, y: 5 });
      assert.equal(result, true);
      assert.equal(board.get("parent")._children.length, 1);
    });

    it("should return false for non-existent parent", function () {
      var board = new BoardData("test", storage);
      var result = board.addChild("ghost", { x: 0, y: 0 });
      assert.equal(result, false);
    });

    it("should enforce max children limit", function () {
      var board = new BoardData("test", storage, {
        maxChildren: 2,
        maxItemCount: 1000,
        maxBoardSize: 65536,
      });
      board.set("parent", { x: 0, y: 0 });
      board.addChild("parent", { x: 1, y: 1 });
      board.addChild("parent", { x: 2, y: 2 });
      var result = board.addChild("parent", { x: 3, y: 3 });
      assert.equal(result, false);
    });
  });

  describe("validate", function () {
    it("should clamp size to 1–50 range", function () {
      var board = new BoardData("test", storage);
      var item = { size: 999 };
      board.validate(item);
      assert.equal(item.size, 50);

      item = { size: -5 };
      board.validate(item);
      assert.equal(item.size, 1);
    });

    it("should clamp coordinates to board size", function () {
      var board = new BoardData("test", storage, {
        maxChildren: 100,
        maxItemCount: 1000,
        maxBoardSize: 100,
      });
      var item = { x: 200, y: -10 };
      board.validate(item);
      assert.equal(item.x, 100);
      assert.equal(item.y, 0);
    });

    it("should clamp opacity to 0.1–1 range", function () {
      var board = new BoardData("test", storage);
      var item = { opacity: 0.01 };
      board.validate(item);
      assert.equal(item.opacity, 0.1);
    });

    it("should remove opacity when it equals 1", function () {
      var board = new BoardData("test", storage);
      var item = { opacity: 1 };
      board.validate(item);
      assert.equal(item.opacity, undefined);
    });

    it("should clamp width and height to board size", function () {
      var board = new BoardData("test", storage, {
        maxChildren: 100,
        maxItemCount: 1000,
        maxBoardSize: 500,
      });
      var item = { width: 9999, height: -10 };
      board.validate(item);
      assert.equal(item.width, 500);
      assert.equal(item.height, 0);
    });

    it("should accept valid image src path", function () {
      var board = new BoardData("test", storage);
      var item = { src: "/images/testboard/abc123def456.png" };
      board.validate(item);
      assert.equal(item.src, "/images/testboard/abc123def456.png");
    });

    it("should reject invalid src paths", function () {
      var board = new BoardData("test", storage);
      var item = { src: "https://evil.com/image.png" };
      board.validate(item);
      assert.equal(item.src, undefined, "absolute URL should be rejected");

      item = { src: "/images/../../../etc/passwd" };
      board.validate(item);
      assert.equal(item.src, undefined, "path traversal should be rejected");

      item = { src: 12345 };
      board.validate(item);
      assert.equal(item.src, undefined, "non-string should be rejected");
    });
  });

  describe("processMessage", function () {
    it("should handle set (default) message", function () {
      var board = new BoardData("test", storage);
      board.processMessage({ id: "e1", x: 5, y: 10 });
      assert.equal(board.get("e1").x, 5);
    });

    it("should handle delete message", function () {
      var board = new BoardData("test", storage);
      board.set("e1", { x: 0, y: 0 });
      board.processMessage({ id: "e1", type: "delete" });
      assert.equal(board.get("e1"), undefined);
    });

    it("should handle update message", function () {
      var board = new BoardData("test", storage);
      board.set("e1", { x: 0, y: 0 });
      board.processMessage({ id: "e1", type: "update", x: 99, y: 99 });
      assert.equal(board.get("e1").x, 99);
    });

    it("should handle child message", function () {
      var board = new BoardData("test", storage);
      board.set("parent", { x: 0, y: 0 });
      board.processMessage({
        parent: "parent",
        type: "child",
        tool: "Pencil",
        x: 10,
        y: 20,
      });
      assert.equal(board.get("parent")._children.length, 1);
    });
  });

  describe("getAll", function () {
    it("should return all elements", function () {
      var board = new BoardData("test", storage);
      board.set("a", { x: 0, y: 0 });
      board.set("b", { x: 1, y: 1 });
      var all = board.getAll();
      assert.equal(all.length, 2);
    });
  });

  describe("clean", function () {
    it("should remove oldest elements when exceeding maxItemCount", function () {
      var board = new BoardData("test", storage, {
        maxChildren: 100,
        maxItemCount: 3,
        maxBoardSize: 65536,
      });
      board.board = {
        a: { time: 1 },
        b: { time: 2 },
        c: { time: 3 },
        d: { time: 4 },
        e: { time: 5 },
      };
      board.clean();
      assert.equal(Object.keys(board.board).length, 3);
      // Should keep the 3 newest (c, d, e)
      assert.ok(!board.board.a);
      assert.ok(!board.board.b);
      assert.ok(board.board.c);
    });
  });

  describe("load / save", function () {
    it("should persist and reload board from disk", async function () {
      var board = new BoardData("persist-test", storage);
      board.board["e1"] = { x: 42, y: 84, time: Date.now() };
      board.validate(board.board["e1"]);
      await board.storage.writeBoard("persist-test", board.board);

      var loaded = await BoardData.load("persist-test", storage);
      assert.equal(loaded.get("e1").x, 42);
      assert.equal(loaded.get("e1").y, 84);
    });

    it("should load empty board when no file exists", async function () {
      var loaded = await BoardData.load("brand-new", storage);
      assert.deepEqual(loaded.getAll(), []);
    });
  });
});
