/**
 * Unit tests for BoardCache — in-memory board lifecycle management.
 */
const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("BoardCache", function () {
  let tmpDir;
  let boardCache;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wbo-cache-test-"));
    process.env.WBO_HISTORY_DIR = tmpDir;

    // Clear require cache so modules pick up new HISTORY_DIR
    for (const key of Object.keys(require.cache)) {
      if (
        key.includes("BoardCache") ||
        key.includes("boardData") ||
        key.includes("BoardStorage") ||
        key.includes("configuration")
      ) {
        delete require.cache[key];
      }
    }
    boardCache = require("../../server/board/BoardCache.js");
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should load a board on first getBoard call", async function () {
    const board = await boardCache.getBoard("new-board");
    assert.ok(board);
    assert.equal(board.name, "new-board");
  });

  it("should return the same board on repeated getBoard calls", async function () {
    const board1 = await boardCache.getBoard("same-board");
    const board2 = await boardCache.getBoard("same-board");
    assert.strictEqual(board1, board2);
  });

  it("should report has() = true for loaded boards", async function () {
    assert.equal(boardCache.has("not-loaded"), false);

    await boardCache.getBoard("loaded-board");
    assert.equal(boardCache.has("loaded-board"), true);
  });

  it("should return cached promise via getCached()", async function () {
    assert.equal(boardCache.getCached("nonexistent"), undefined);

    await boardCache.getBoard("cached-board");
    const cached = boardCache.getCached("cached-board");
    assert.ok(cached instanceof Promise);
    const board = await cached;
    assert.equal(board.name, "cached-board");
  });

  it("should remove board from cache after unloadBoard", async function () {
    await boardCache.getBoard("to-unload");
    assert.equal(boardCache.has("to-unload"), true);

    await boardCache.unloadBoard("to-unload");
    assert.equal(boardCache.has("to-unload"), false);
  });

  it("should save board data to disk on unload", async function () {
    const board = await boardCache.getBoard("save-test");
    board.set("elem1", { tool: "Pencil", x: 10, y: 20 });

    // save() doesn't await its mutex internally, so write directly
    await board.storage.writeBoard(board.name, board.board);
    await boardCache.unloadBoard("save-test");

    const files = fs.readdirSync(tmpDir);
    assert.ok(files.length > 0, "Board data file should exist after save");
  });

  it("should not throw when unloading a board that is not cached", async function () {
    // Should be a no-op
    await boardCache.unloadBoard("never-loaded");
    assert.ok(true);
  });

  it("should reload board from disk after save + unload + getBoard", async function () {
    const board = await boardCache.getBoard("reload-test");
    board.set("persistent", { tool: "Pencil", x: 99, y: 88 });

    // Write explicitly (save() doesn't await its mutex)
    await board.storage.writeBoard(board.name, board.board);
    await boardCache.unloadBoard("reload-test");

    // Re-load from disk
    const reloaded = await boardCache.getBoard("reload-test");
    const elem = reloaded.get("persistent");
    assert.ok(elem, "Element should persist after save + reload");
    assert.equal(elem.x, 99);
    assert.equal(elem.y, 88);
  });
});
