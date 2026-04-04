/**
 * BookStorage — file-system persistence layer for book metadata and page files.
 *
 * Extracted from bookData.js to satisfy Single Responsibility and
 * Dependency Inversion: BookData depends on the *interface* that this
 * class exposes, not on fs/path/config directly.
 *
 * To swap storage (e.g. database, S3) create a class with the same
 * method signatures and inject it into BookData instead. (Open/Closed)
 *
 * @module BookStorage
 */

var fs = require("../util/fs_promises.js"),
  path = require("path"),
  config = require("../configuration.js");

/**
 * @param {string} bookName
 * @param {number} pageNum  1-based
 * @returns {string} The board name used for this page
 */
function pageBoardName(bookName, pageNum) {
  return "book~" + bookName + "~p" + pageNum;
}

/** File-system implementation of book storage */
class BookStorage {
  /**
   * @param {string} [historyDir] — override for testing; defaults to config.HISTORY_DIR
   */
  constructor(historyDir) {
    this.historyDir = historyDir || config.HISTORY_DIR;
  }

  // ---- Metadata persistence ----

  /**
   * Full path to the metadata JSON for a book.
   * @param {string} bookName
   * @returns {string}
   */
  metaFilePath(bookName) {
    return path.join(
      this.historyDir,
      "book-meta-" + encodeURIComponent(bookName) + ".json",
    );
  }

  /**
   * Read metadata from disk. Returns null if the file does not exist.
   * @param {string} bookName
   * @returns {Promise<object|null>}
   */
  async readMeta(bookName) {
    try {
      var data = await fs.promises.readFile(
        this.metaFilePath(bookName),
        "utf8",
      );
      return JSON.parse(data);
    } catch (err) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  /**
   * Write metadata to disk (atomic overwrite).
   * @param {string} bookName
   * @param {object} meta
   */
  async writeMeta(bookName, meta) {
    await fs.promises.writeFile(
      this.metaFilePath(bookName),
      JSON.stringify(meta),
      "utf8",
    );
  }

  // ---- Page board file operations ----

  /**
   * Full path to the board JSON for a given page.
   * @param {string} bookName
   * @param {number} pageNum 1-based
   * @returns {string}
   */
  pageBoardFilePath(bookName, pageNum) {
    return path.join(
      this.historyDir,
      "board-" + encodeURIComponent(pageBoardName(bookName, pageNum)) + ".json",
    );
  }

  /**
   * Delete the board file for a single page. Silently succeeds if the file
   * does not exist (the page may never have been drawn on).
   * @param {string} bookName
   * @param {number} pageNum
   */
  async deletePageFile(bookName, pageNum) {
    try {
      await fs.promises.unlink(this.pageBoardFilePath(bookName, pageNum));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  /**
   * Rename (shift) a page board file from one page number to another.
   * Silently succeeds if the source does not exist.
   * @param {string} bookName
   * @param {number} fromPage
   * @param {number} toPage
   */
  async renamePageFile(bookName, fromPage, toPage) {
    try {
      await fs.promises.rename(
        this.pageBoardFilePath(bookName, fromPage),
        this.pageBoardFilePath(bookName, toPage),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
}

module.exports = { BookStorage: BookStorage, pageBoardName: pageBoardName };
