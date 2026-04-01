/**
 * socketManager.js — Socket Manager Module
 * Manages socket.io connection, message sending (send / drawAndSend),
 * the inbound message pipeline (handleMessage, messageForTool, batchCall),
 * pending messages queue, and unread message tracking.
 */
(function () {
  "use strict";

  // ── Connection ──
  Tools.socket = null;

  Tools.connect = function () {
    var self = this;

    if (self.socket) {
      self.socket.destroy();
      delete self.socket;
      self.socket = null;
    }

    var url = new URL(window.location);
    var params = new URLSearchParams(url.search);

    var socket_params = {
      path:
        window.location.pathname.replace(/\/(boards|books)\/.*/, "") +
        "/socket.io",
      reconnection: true,
      reconnectionDelay: 100,
      timeout: 1000 * 60 * 20,
    };
    if (params.has("token")) {
      socket_params.query = "token=" + params.get("token");
    }

    this.socket = io.connect("", socket_params);

    this.socket.on("broadcast", function (msg) {
      handleMessage(msg).finally(function afterload() {
        var loadingEl = document.getElementById("loadingMessage");
        loadingEl.classList.add("hidden");
      });
    });

    this.socket.on("reconnect", function onReconnection() {
      Tools.socket.emit("joinboard", Tools.boardName);
    });
  };

  Tools.connect();

  // In book mode, book.js will handle joining the correct page board
  if (!Tools.isBookMode) {
    Tools.socket.emit("getboard", Tools.boardName);
  }

  // ── Outbound Messaging ──
  Tools.send = function (data, toolName) {
    toolName = toolName || Tools.curTool.name;
    data.tool = toolName;
    Tools.applyHooks(Tools.messageHooks, data);
    var message = {
      board: Tools.boardName,
      data: data,
    };
    Tools.socket.emit("broadcast", message);
  };

  Tools.drawAndSend = function (data, tool) {
    if (tool == null) tool = Tools.curTool;
    tool.draw(data, true);
    Tools.send(data, tool.name);
  };

  // ── Pending Messages ──
  Tools.pendingMessages = {};

  function messageForTool(message) {
    var name = message.tool,
      tool = Tools.list[name];

    if (tool) {
      Tools.applyHooks(Tools.messageHooks, message);
      tool.draw(message, false);
    } else {
      if (!Tools.pendingMessages[name]) Tools.pendingMessages[name] = [message];
      else Tools.pendingMessages[name].push(message);
    }

    if (message.tool !== "Hand" && message.transform != null) {
      messageForTool({
        tool: "Hand",
        type: "update",
        transform: message.transform,
        id: message.id,
      });
    }
  }

  // ── Batch Processing ──
  var BATCH_SIZE = 1024;

  function batchCall(fn, args, index) {
    index = index | 0;
    if (index >= args.length) {
      return Promise.resolve();
    } else {
      var batch = args.slice(index, index + BATCH_SIZE);
      return Promise.all(batch.map(fn))
        .then(function () {
          return new Promise(requestAnimationFrame);
        })
        .then(function () {
          return batchCall(fn, args, index + BATCH_SIZE);
        });
    }
  }

  function handleMessage(message) {
    if (!message.tool && !message._children) {
      console.error("Received a badly formatted message (no tool). ", message);
    }
    if (message.tool) messageForTool(message);
    if (message._children)
      return batchCall(childMessageHandler(message), message._children);
    else return Promise.resolve();
  }

  function childMessageHandler(parent) {
    if (!parent.id) return handleMessage;
    return function handleChild(child) {
      child.parent = parent.id;
      child.tool = parent.tool;
      child.type = "child";
      return handleMessage(child);
    };
  }

  // ── Unread Messages ──
  Tools.unreadMessagesCount = 0;

  Tools.newUnreadMessage = function () {
    Tools.unreadMessagesCount++;
    updateDocumentTitle();
  };

  window.addEventListener("focus", function () {
    Tools.unreadMessagesCount = 0;
    updateDocumentTitle();
  });

  function updateDocumentTitle() {
    document.title =
      (Tools.unreadMessagesCount
        ? "(" + Tools.unreadMessagesCount + ") "
        : "") +
      Tools.boardName +
      " | WBO";
  }

  function updateUnreadCount(m) {
    if (document.hidden && ["child", "update"].indexOf(m.type) === -1) {
      Tools.newUnreadMessage();
    }
  }
  Tools.messageHooks.push(updateUnreadCount);
})();
