/**
 * BoardDataStorage — file-system persistence layer for board data.
 *
 * Extracted from boardData.js to satisfy Single Responsibility and
 * Dependency Inversion: BoardData depends on the *interface* this class
 * exposes, not on fs/path/config directly.
 *
 * To swap storage (e.g. database, S3) create a class with the same
 * method signatures and pass it to BoardData's constructor.
 *
 * @module BoardDataStorage
 */

var fs = require("../util/fs_promises.js"),
  path = require("path"),
  config = require("../configuration.js"),
  { log } = require("../util/log.js");

/**
 * Given a board file name, return a name to use for temporary data / backups.
 * @param {string} baseName
 * @returns {string}
 */
function backupFileName(baseName) {
  var date = new Date().toISOString().replace(/:/g, "");
  return baseName + "." + date + ".bak";
}

/** File-system implementation of board persistence */
class BoardStorage {
  /**
   * @param {string} [historyDir] — override for testing; defaults to config.HISTORY_DIR
   */
  constructor(historyDir) {
    this.historyDir = historyDir || config.HISTORY_DIR;
  }

  /**
   * Full path to the board JSON file.
   * @param {string} name Board name
   * @returns {string}
   */
  boardFilePath(name) {
    return path.join(
      this.historyDir,
      "board-" + encodeURIComponent(name) + ".json",
    );
  }

  /**
   * Read a board's data from disk.
   * @param {string} name
   * @returns {Promise<{board: object, raw: Buffer|null}>}
   *   board: the parsed data (empty object if file missing or corrupt)
   *   raw: the raw buffer (null if file was missing; present even on parse error for backup)
   */
  async readBoard(name) {
    var file = this.boardFilePath(name);
    try {
      var data = await fs.promises.readFile(file);
      return { board: JSON.parse(data), raw: data };
    } catch (e) {
      if (e.code === "ENOENT") {
        return { board: {}, raw: null };
      }
      // File exists but is corrupt — return raw for backup
      if (e instanceof SyntaxError) {
        var raw = null;
        try {
          raw = await fs.promises.readFile(file);
        } catch (_) {}
        return { board: {}, raw: raw };
      }
      throw e;
    }
  }

  /**
   * Write board data to disk atomically (write temp, then rename).
   * If the board is empty, remove the file instead.
   * @param {string} name
   * @param {object} board
   */
  async writeBoard(name, board) {
    var file = this.boardFilePath(name);
    var board_txt = JSON.stringify(board);

    if (board_txt === "{}") {
      try {
        await fs.promises.unlink(file);
        log("removed empty board", { board: name });
      } catch (err) {
        if (err.code !== "ENOENT") {
          log("board deletion error", { err: err.toString() });
        }
      }
    } else {
      var tmp_file = backupFileName(file);
      try {
        await fs.promises.writeFile(tmp_file, board_txt, { flag: "wx" });
        await fs.promises.rename(tmp_file, file);
      } catch (err) {
        log("board saving error", {
          board: name,
          err: err.toString(),
          tmp_file: tmp_file,
        });
      }
    }
  }

  /**
   * Write a backup of raw data (used when a board file is corrupt).
   * @param {string} name
   * @param {Buffer} data
   */
  async writeBackup(name, data) {
    var file = this.boardFilePath(name);
    var backup = backupFileName(file);
    try {
      await fs.promises.writeFile(backup, data);
    } catch (err) {
      log("Error writing " + backup + ": " + err);
    }
  }
}

module.exports = { BoardStorage: BoardStorage, backupFileName: backupFileName };
