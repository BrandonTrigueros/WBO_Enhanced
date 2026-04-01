/**
 * BoardCache — in-memory cache of active BoardData instances.
 *
 * Extracted from sockets.js for Single Responsibility.
 * Manages the lifecycle: load on first access, unload when empty.
 *
 * @module BoardCache
 */

var { log, gauge } = require("../util/log.js"),
  BoardData = require("./boardData.js").BoardData;

/** @type {{[boardName: string]: Promise<BoardData>}} */
var boards = {};

/**
 * Returns a promise to a BoardData with the given name.
 * Loads from disk on first access, returns cached afterwards.
 * @param {string} name
 * @returns {Promise<BoardData>}
 */
function getBoard(name) {
  if (boards.hasOwnProperty(name)) {
    return boards[name];
  } else {
    var board = BoardData.load(name);
    boards[name] = board;
    gauge("boards in memory", Object.keys(boards).length);
    return board;
  }
}

/**
 * Unloads a board from memory after saving it.
 * Called when the last user disconnects from a board.
 * @param {string} boardName
 */
async function unloadBoard(boardName) {
  if (boards.hasOwnProperty(boardName)) {
    var board = await boards[boardName];
    await board.save();
    log("unload board", { board: board.name, users: board.users.size });
    delete boards[boardName];
    gauge("boards in memory", Object.keys(boards).length);
  }
}

/**
 * Check whether a board name is currently cached.
 * @param {string} name
 * @returns {boolean}
 */
function has(name) {
  return boards.hasOwnProperty(name);
}

/**
 * Get the raw promise for a cached board (without auto-loading).
 * Returns undefined if not cached.
 * @param {string} name
 * @returns {Promise<BoardData>|undefined}
 */
function getCached(name) {
  return boards[name];
}

module.exports = {
  getBoard: getBoard,
  unloadBoard: unloadBoard,
  has: has,
  getCached: getCached,
};
