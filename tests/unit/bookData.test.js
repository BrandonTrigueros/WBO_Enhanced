/**
 * Unit tests for bookData — book business logic (page management).
 * Uses a fake in-memory storage to isolate from file system.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createBookData } = require("../../server/book/bookData.js");

/** In-memory fake storage implementing the BookStorage interface */
function createFakeStorage() {
  var files = {};
  return {
    readMeta: async function (bookName) {
      return files["meta-" + bookName] || null;
    },
    writeMeta: async function (bookName, meta) {
      files["meta-" + bookName] = JSON.parse(JSON.stringify(meta));
    },
    deletePageFile: async function (bookName, pageNum) {
      delete files["page-" + bookName + "-" + pageNum];
    },
    renamePageFile: async function (bookName, fromPage, toPage) {
      var key = "page-" + bookName + "-" + fromPage;
      if (files[key] !== undefined) {
        files["page-" + bookName + "-" + toPage] = files[key];
        delete files[key];
      }
    },
    _files: files,
  };
}

describe("bookData", function () {
  describe("loadMeta", function () {
    it("should create default metadata for new book", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);
      var meta = await api.loadMeta("newbook");
      assert.equal(meta.pageCount, 1);
      assert.ok(meta.createdAt);
    });

    it("should return existing metadata", async function () {
      var storage = createFakeStorage();
      storage._files["meta-existing"] = { pageCount: 5, createdAt: "2026-01-01" };
      var api = createBookData(storage);
      var meta = await api.loadMeta("existing");
      assert.equal(meta.pageCount, 5);
    });
  });

  describe("addPage", function () {
    it("should increment page count", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      await api.loadMeta("book1"); // creates with pageCount=1
      var result = await api.addPage("book1");
      assert.equal(result.pageCount, 2);
    });

    it("should increment multiple times", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      await api.loadMeta("book1");
      await api.addPage("book1");
      await api.addPage("book1");
      var result = await api.addPage("book1");
      assert.equal(result.pageCount, 4);
    });
  });

  describe("deletePage", function () {
    it("should decrement page count and shift files", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      // Set up a 3-page book
      storage._files["meta-book1"] = { pageCount: 3, createdAt: "2026-01-01" };
      storage._files["page-book1-1"] = "page1data";
      storage._files["page-book1-2"] = "page2data";
      storage._files["page-book1-3"] = "page3data";

      var result = await api.deletePage("book1", 2);
      assert.equal(result.deleted, true);
      assert.equal(result.pageCount, 2);

      // Page 3 should have been renamed to page 2
      assert.equal(storage._files["page-book1-2"], "page3data");
      assert.equal(storage._files["page-book1-3"], undefined);
    });

    it("should not delete when only 1 page remains", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      storage._files["meta-book1"] = { pageCount: 1, createdAt: "2026-01-01" };

      var result = await api.deletePage("book1", 1);
      assert.equal(result.deleted, false);
      assert.equal(result.pageCount, 1);
    });

    it("should not delete invalid page numbers", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      storage._files["meta-book1"] = { pageCount: 3, createdAt: "2026-01-01" };

      var result = await api.deletePage("book1", 0);
      assert.equal(result.deleted, false);

      result = await api.deletePage("book1", 5);
      assert.equal(result.deleted, false);
    });

    it("should delete the last page correctly", async function () {
      var storage = createFakeStorage();
      var api = createBookData(storage);

      storage._files["meta-book1"] = { pageCount: 3, createdAt: "2026-01-01" };
      storage._files["page-book1-3"] = "lastpage";

      var result = await api.deletePage("book1", 3);
      assert.equal(result.deleted, true);
      assert.equal(result.pageCount, 2);
      assert.equal(storage._files["page-book1-3"], undefined);
    });
  });

  describe("pageBoardName", function () {
    it("should format correctly", function () {
      var api = createBookData(createFakeStorage());
      assert.equal(api.pageBoardName("mybook", 1), "book~mybook~p1");
      assert.equal(api.pageBoardName("test", 42), "book~test~p42");
    });
  });
});
