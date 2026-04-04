/**
 * Unit tests for BoardStorage — file-system persistence for boards.
 * Uses Node 18 built-in test runner (node:test).
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { BoardStorage } = require("../../server/board/BoardStorage.js");

describe("BoardStorage", function () {
  let tmpDir;
  let storage;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-bs-"));
    storage = new BoardStorage(tmpDir);
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("boardFilePath", function () {
    it("should encode the board name in the file path", function () {
      var fp = storage.boardFilePath("hello world");
      assert.ok(fp.includes("board-hello%20world.json"));
    });

    it("should use the configured history directory", function () {
      var fp = storage.boardFilePath("test");
      assert.ok(fp.startsWith(tmpDir));
    });
  });

  describe("readBoard", function () {
    it("should return empty board when file does not exist", async function () {
      var result = await storage.readBoard("nonexistent");
      assert.deepEqual(result.board, {});
      assert.equal(result.raw, null);
    });

    it("should read and parse existing board data", async function () {
      var boardData = { elem1: { x: 10, y: 20, tool: "Pencil" } };
      var filePath = storage.boardFilePath("testboard");
      fs.writeFileSync(filePath, JSON.stringify(boardData));

      var result = await storage.readBoard("testboard");
      assert.deepEqual(result.board, boardData);
      assert.ok(result.raw !== null);
    });

    it("should return empty board with raw data on corrupt JSON", async function () {
      var filePath = storage.boardFilePath("corrupt");
      fs.writeFileSync(filePath, "not valid json {{{");

      var result = await storage.readBoard("corrupt");
      assert.deepEqual(result.board, {});
      assert.ok(result.raw !== null);
    });
  });

  describe("writeBoard", function () {
    it("should write board data to disk", async function () {
      var data = { elem1: { x: 5, y: 10 } };
      await storage.writeBoard("myboard", data);

      var filePath = storage.boardFilePath("myboard");
      var content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      assert.deepEqual(content, data);
    });

    it("should remove the file when board is empty", async function () {
      // First write some data
      var filePath = storage.boardFilePath("emptyboard");
      fs.writeFileSync(filePath, '{"a":1}');
      assert.ok(fs.existsSync(filePath));

      // Now write empty board
      await storage.writeBoard("emptyboard", {});
      assert.ok(!fs.existsSync(filePath));
    });

    it("should not throw when removing a non-existent empty board", async function () {
      await assert.doesNotReject(storage.writeBoard("ghost", {}));
    });
  });

  describe("writeBackup", function () {
    it("should write a backup file with timestamp suffix", async function () {
      await storage.writeBackup("badboard", Buffer.from("corrupt data"));

      var files = fs.readdirSync(tmpDir);
      var backupFiles = files.filter(function (f) {
        return f.includes("badboard") && f.includes(".bak");
      });
      assert.ok(backupFiles.length >= 1, "Expected at least one backup file");

      var content = fs.readFileSync(path.join(tmpDir, backupFiles[0]), "utf8");
      assert.equal(content, "corrupt data");
    });
  });
});
