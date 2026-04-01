/**
 * Unit tests for BookStorage — file-system persistence for book metadata and pages.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { BookStorage } = require("../../server/book/BookStorage.js");

describe("BookStorage", function () {
  let tmpDir;
  let storage;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-test-bks-"));
    storage = new BookStorage(tmpDir);
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readMeta / writeMeta", function () {
    it("should return null for non-existent book", async function () {
      var meta = await storage.readMeta("nonexistent");
      assert.equal(meta, null);
    });

    it("should round-trip metadata", async function () {
      var meta = { pageCount: 3, createdAt: "2026-01-01T00:00:00.000Z" };
      await storage.writeMeta("mybook", meta);
      var result = await storage.readMeta("mybook");
      assert.deepEqual(result, meta);
    });

    it("should overwrite existing metadata", async function () {
      await storage.writeMeta("book1", { pageCount: 1 });
      await storage.writeMeta("book1", { pageCount: 5 });
      var result = await storage.readMeta("book1");
      assert.equal(result.pageCount, 5);
    });
  });

  describe("deletePageFile", function () {
    it("should delete an existing page file", async function () {
      var filePath = storage.pageBoardFilePath("mybook", 2);
      fs.writeFileSync(filePath, '{"data":true}');
      assert.ok(fs.existsSync(filePath));

      await storage.deletePageFile("mybook", 2);
      assert.ok(!fs.existsSync(filePath));
    });

    it("should silently succeed for non-existent page", async function () {
      await assert.doesNotReject(storage.deletePageFile("mybook", 99));
    });
  });

  describe("renamePageFile", function () {
    it("should rename page file from one number to another", async function () {
      var fromPath = storage.pageBoardFilePath("mybook", 3);
      var toPath = storage.pageBoardFilePath("mybook", 2);
      fs.writeFileSync(fromPath, '{"page":3}');

      await storage.renamePageFile("mybook", 3, 2);

      assert.ok(!fs.existsSync(fromPath));
      assert.ok(fs.existsSync(toPath));
      var content = JSON.parse(fs.readFileSync(toPath, "utf8"));
      assert.deepEqual(content, { page: 3 });
    });

    it("should silently succeed when source does not exist", async function () {
      await assert.doesNotReject(storage.renamePageFile("mybook", 10, 9));
    });
  });

  describe("pageBoardFilePath", function () {
    it("should encode book name in file path", function () {
      var fp = storage.pageBoardFilePath("my book", 1);
      assert.ok(fp.includes("board-book~my%20book~p1.json"));
    });
  });
});
