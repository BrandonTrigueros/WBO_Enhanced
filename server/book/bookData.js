/**
 * BookData — business logic for WBO Enhanced notebooks.
 *
 * Responsibilities (Single Responsibility):
 *   - Manage page count, creation timestamps, and page ordering.
 *   - Coordinate concurrent mutations via per-book mutexes.
 *
 * All file I/O is delegated to an injected storage layer (Dependency Inversion).
 * To change persistence (database, S3, etc.) provide a different storage
 * implementation with the same method signatures (Open/Closed).
 *
 * @module bookData
 */

var Mutex = require("async-mutex").Mutex,
  defaultStorage = require("./BookStorage.js");

// Re-export pageBoardName so existing callers don't break
var pageBoardName = defaultStorage.pageBoardName;

// ---- Concurrency guards (one mutex per book) ----

var metaMutexes = {};

function getMutex(bookName) {
  if (!metaMutexes[bookName]) metaMutexes[bookName] = new Mutex();
  return metaMutexes[bookName];
}

// ---- Default storage instance (can be replaced via createBookData) ----

var _storage = new defaultStorage.BookStorage();

/**
 * Create a bookData API backed by a custom storage instance.
 * Useful for testing or alternative backends.
 *
 * @param {object} storage — object with readMeta, writeMeta,
 *                           deletePageFile, renamePageFile methods
 * @returns {object} bookData API
 */
function createBookData(storage) {
  return buildApi(storage);
}

/**
 * Load book metadata, creating a default if the book is new.
 * @param {object} storage
 * @param {string} bookName
 * @returns {Promise<{pageCount: number, createdAt: string}>}
 */
async function loadMeta(storage, bookName) {
  var meta = await storage.readMeta(bookName);
  if (meta === null) {
    meta = { pageCount: 1, createdAt: new Date().toISOString() };
    await storage.writeMeta(bookName, meta);
  }
  return meta;
}

/**
 * Add a page to the book (appends at end).
 * @param {object} storage
 * @param {string} bookName
 * @returns {Promise<{pageCount: number}>}
 */
async function addPage(storage, bookName) {
  var mutex = getMutex(bookName);
  return mutex.runExclusive(async function () {
    var meta = await loadMeta(storage, bookName);
    meta.pageCount++;
    await storage.writeMeta(bookName, meta);
    return meta;
  });
}

/**
 * Delete a specific page and shift subsequent pages down.
 * Never allows pageCount to drop below 1.
 *
 * File I/O (delete + rename) is delegated entirely to storage (SRP).
 *
 * @param {object} storage
 * @param {string} bookName
 * @param {number} pageNum  1-based page to delete
 * @returns {Promise<{pageCount: number, deleted: boolean}>}
 */
async function deletePage(storage, bookName, pageNum) {
  var mutex = getMutex(bookName);
  return mutex.runExclusive(async function () {
    var meta = await loadMeta(storage, bookName);
    if (meta.pageCount <= 1 || pageNum < 1 || pageNum > meta.pageCount) {
      return { pageCount: meta.pageCount, deleted: false };
    }

    // Delegate file operations to storage layer
    await storage.deletePageFile(bookName, pageNum);

    for (var i = pageNum + 1; i <= meta.pageCount; i++) {
      await storage.renamePageFile(bookName, i, i - 1);
    }

    meta.pageCount--;
    await storage.writeMeta(bookName, meta);
    return { pageCount: meta.pageCount, deleted: true };
  });
}

/**
 * Build a public API bound to a specific storage instance.
 * @param {object} storage
 */
function buildApi(storage) {
  return {
    loadMeta: function (bookName) { return loadMeta(storage, bookName); },
    addPage: function (bookName) { return addPage(storage, bookName); },
    deletePage: function (bookName, pageNum) { return deletePage(storage, bookName, pageNum); },
    pageBoardName: pageBoardName,
    storage: storage,
  };
}

// Default export uses the file-system storage singleton
module.exports = buildApi(_storage);

// Also expose the factory for custom storage injection
module.exports.createBookData = createBookData;
