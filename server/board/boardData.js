/**
 *                  WHITEBOPHIR SERVER
 *********************************************************
 * @licstart  The following is the entire license notice for the
 *  JavaScript code in this page.
 *
 * Copyright (C) 2013-2014  Ophir LOJKINE
 *
 *
 * The JavaScript code in this page is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License (GNU GPL) as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.  The code is distributed WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU GPL for more details.
 *
 * As additional permission under GNU GPL version 3 section 7, you
 * may distribute non-source (e.g., minimized or compacted) forms of
 * that code without the copy of the GNU GPL normally required by
 * section 4, provided you include this license notice and a URL
 * through which recipients can access the Corresponding Source.
 *
 * @licend
 * @module boardData
 */

var log = require("../util/log.js").log,
  config = require("../configuration.js"),
  Mutex = require("async-mutex").Mutex,
  jwtauth = require("../auth/jwtBoardnameAuth.js"),
  { BoardStorage } = require("./BoardStorage.js");

// ---- Default storage instance (can be overridden) ----
var _defaultStorage = new BoardStorage();

// ---- Validation limits (extracted from config for clarity) ----
var validationLimits = {
  maxChildren: config.MAX_CHILDREN,
  maxItemCount: config.MAX_ITEM_COUNT,
  maxBoardSize: config.MAX_BOARD_SIZE,
};

/**
 * Represents a board.
 * @typedef {{[object_id:string]: any}} BoardElem
 */
class BoardData {
  /**
   * @param {string} name
   * @param {object} [storage] - Persistence layer (default: file-system BoardStorage)
   * @param {object} [limits] - Validation limits override for testing
   */
  constructor(name, storage, limits) {
    this.name = name;
    /** @type {{[name: string]: BoardElem}} */
    this.board = {};
    this.storage = storage || _defaultStorage;
    this.limits = limits || validationLimits;
    this.lastSaveDate = Date.now();
    this.users = new Set();
    this.saveMutex = new Mutex();
  }

  /** Adds data to the board
   * @param {string} id
   * @param {BoardElem} data
   */
  set(id, data) {
    data.time = Date.now();
    this.validate(data);
    this.board[id] = data;
    this.delaySave();
  }

  /** Adds a child to an element that is already in the board
   * @param {string} parentId - Identifier of the parent element.
   * @param {BoardElem} child - Object containing the the values to update.
   * @returns {boolean} - True if the child was added, else false
   */
  addChild(parentId, child) {
    var obj = this.board[parentId];
    if (typeof obj !== "object") return false;
    this.validate(child);
    if (Array.isArray(obj._children)) {
      if (obj._children.length >= this.limits.maxChildren) return false;
      obj._children.push(child);
    } else {
      obj._children = [child];
    }
    this.delaySave();
    return true;
  }

  /** Update the data in the board
   * @param {string} id - Identifier of the data to update.
   * @param {BoardElem} data - Object containing the values to update.
   * @param {boolean} create - True if the object should be created if it's not currently in the DB.
   */
  update(id, data, create) {
    delete data.type;
    delete data.tool;

    var obj = this.board[id];
    if (typeof obj === "object") {
      for (var i in data) {
        obj[i] = data[i];
      }
    } else if (create || obj !== undefined) {
      this.board[id] = data;
    }
    this.delaySave();
  }

  /** Copy elements in the board
   * @param {string} id - Identifier of the data to copy.
   * @param {BoardElem} data - Object containing the id of the new copied element.
   */
  copy(id, data) {
    var obj = this.board[id];
    var newid = data.newid;
    if (obj) {
      var newobj = JSON.parse(JSON.stringify(obj));
      newobj.id = newid;
      if (newobj._children) {
        for (var child of newobj._children) {
          child.parent = newid;
        }
      }
      this.board[newid] = newobj;
    } else {
      log("Copied object does not exist in board.", { object: id });
    }
    this.delaySave();
  }

  /** Clear the board of all data */
  clear() {
    this.board = {};
    this.delaySave();
  }

  /** Removes data from the board
   * @param {string} id - Identifier of the data to delete.
   */
  delete(id) {
    delete this.board[id];
    this.delaySave();
  }

  /** Process a batch of messages
   * @param {BoardMessage[]} children
   */
  processMessageBatch(children) {
    for (const message of children) {
      this.processMessage(message);
    }
  }

  /** Process a single message
   * @param {BoardMessage} message instruction to apply to the board
   */
  processMessage(message) {
    if (message._children) return this.processMessageBatch(message._children);
    let id = message.id;
    switch (message.type) {
      case "delete":
        if (id) this.delete(id);
        break;
      case "update":
        if (id) this.update(id, message);
        break;
      case "copy":
        if (id) this.copy(id, message);
        break;
      case "child":
        const { parent, type, tool, ...childData } = message;
        this.addChild(parent, childData);
        break;
      case "clear":
        if (jwtauth.roleInBoard(message.token, message.board) === "moderator") {
          this.clear();
        } else {
          console.error("User is not a moderator and tried to clear the board");
        }
        break;
      default:
        if (id) this.set(id, message);
        else console.error("Invalid message: ", message);
    }
  }

  /** Reads data from the board
   * @param {string} id
   * @returns {BoardElem}
   */
  get(id) {
    return this.board[id];
  }

  /** Reads all data from the board
   * @param {string} [id] - Identifier of the first element to get.
   * @returns {BoardElem[]}
   */
  getAll(id) {
    return Object.entries(this.board)
      .filter(([i]) => !id || i > id)
      .map(([_, elem]) => elem);
  }

  /** Delays the triggering of auto-save by SAVE_INTERVAL seconds */
  delaySave() {
    if (this.saveTimeoutId !== undefined) clearTimeout(this.saveTimeoutId);
    this.saveTimeoutId = setTimeout(this.save.bind(this), config.SAVE_INTERVAL);
    if (Date.now() - this.lastSaveDate > config.MAX_SAVE_DELAY)
      setTimeout(this.save.bind(this), 0);
  }

  /** Saves the data in the board to a file. */
  async save() {
    this.saveMutex.runExclusive(this._unsafe_save.bind(this));
  }

  /** Save the board to disk. Delegates I/O to storage layer. */
  async _unsafe_save() {
    this.lastSaveDate = Date.now();
    this.clean();
    var startTime = Date.now();
    await this.storage.writeBoard(this.name, this.board);
    var board_txt = JSON.stringify(this.board);
    if (board_txt !== "{}") {
      log("saved board", {
        board: this.name,
        size: board_txt.length,
        delay_ms: Date.now() - startTime,
      });
    }
  }

  /** Remove old elements from the board */
  clean() {
    var board = this.board;
    var ids = Object.keys(board);
    if (ids.length > this.limits.maxItemCount) {
      var toDestroy = ids
        .sort(function (x, y) {
          return (board[x].time | 0) - (board[y].time | 0);
        })
        .slice(0, -this.limits.maxItemCount);
      for (var i = 0; i < toDestroy.length; i++) delete board[toDestroy[i]];
      log("cleaned board", { removed: toDestroy.length, board: this.name });
    }
  }

  /** Validates and constrains an item to follow the board's policy
   * @param {object} item The object to edit
   */
  validate(item) {
    if (item.hasOwnProperty("size")) {
      item.size = parseInt(item.size) || 1;
      item.size = Math.min(Math.max(item.size, 1), 50);
    }
    if (item.hasOwnProperty("x") || item.hasOwnProperty("y")) {
      item.x = parseFloat(item.x) || 0;
      item.x = Math.min(Math.max(item.x, 0), this.limits.maxBoardSize);
      item.x = Math.round(10 * item.x) / 10;
      item.y = parseFloat(item.y) || 0;
      item.y = Math.min(Math.max(item.y, 0), this.limits.maxBoardSize);
      item.y = Math.round(10 * item.y) / 10;
    }
    if (item.hasOwnProperty("opacity")) {
      item.opacity = Math.min(Math.max(item.opacity, 0.1), 1) || 1;
      if (item.opacity === 1) delete item.opacity;
    }
    if (item.hasOwnProperty("width")) {
      item.width = parseFloat(item.width) || 0;
      item.width = Math.min(Math.max(item.width, 0), this.limits.maxBoardSize);
    }
    if (item.hasOwnProperty("height")) {
      item.height = parseFloat(item.height) || 0;
      item.height = Math.min(Math.max(item.height, 0), this.limits.maxBoardSize);
    }
    if (item.hasOwnProperty("src")) {
      // Only allow relative image paths — no absolute URLs or protocols
      if (typeof item.src !== "string" || !/^\/images\/[\w%\-_~()]+\/[a-f0-9]+\.(png|jpg|gif|webp)$/.test(item.src)) {
        delete item.src;
      }
    }
    if (item.hasOwnProperty("_children")) {
      if (!Array.isArray(item._children)) item._children = [];
      if (item._children.length > this.limits.maxChildren)
        item._children.length = this.limits.maxChildren;
      for (var i = 0; i < item._children.length; i++) {
        this.validate(item._children[i]);
      }
    }
  }

  /** Load a board from persistent storage.
   * @param {string} name - name of the board
   * @param {object} [storage] - optional storage override
   */
  static async load(name, storage) {
    var st = storage || _defaultStorage;
    var boardData = new BoardData(name, st);
    var result = await st.readBoard(name);

    boardData.board = result.board;

    if (Object.keys(boardData.board).length > 0) {
      for (const id in boardData.board) boardData.validate(boardData.board[id]);
      log("disk load", { board: boardData.name });
    } else if (result.raw) {
      // Corrupt data — write backup
      log("board load error", { board: name, error: "corrupt JSON" });
      await st.writeBackup(name, result.raw);
    } else {
      log("empty board creation", { board: boardData.name });
    }

    return boardData;
  }
}

module.exports.BoardData = BoardData;
