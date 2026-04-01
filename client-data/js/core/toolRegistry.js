/**
 * toolRegistry.js — Tool Registry Module
 * Manages the tool lifecycle: registration, UI addition, tool switching,
 * event listener binding/unbinding, and active-tool state.
 */
(function () {
  "use strict";

  // ── Active Tool State ──
  Tools.curTool = null;
  Tools.drawingEvent = true;
  Tools.showMarker = true;
  Tools.showOtherCursors = true;
  Tools.showMyCursor = true;

  // ── Tool List ──
  Tools.list = {};

  Tools.isBlocked = function toolIsBanned(tool) {
    if (tool.name.includes(","))
      throw new Error("Tool Names must not contain a comma");
    return Tools.server_config.BLOCKED_TOOLS.includes(tool.name);
  };

  /**
   * Register a new tool, without touching the User Interface.
   */
  Tools.register = function registerTool(newTool) {
    if (Tools.isBlocked(newTool)) return;

    if (newTool.name in Tools.list) {
      console.log(
        "Tools.add: The tool '" +
          newTool.name +
          "' is already in the list. Updating it...",
      );
    }

    Tools.applyHooks(Tools.toolHooks, newTool);
    Tools.list[newTool.name] = newTool;

    if (newTool.onSizeChange)
      Tools.sizeChangeHandlers.push(newTool.onSizeChange);

    var pending = Tools.pendingMessages[newTool.name];
    if (pending) {
      console.log("Drawing pending messages for '%s'.", newTool.name);
      var msg;
      while ((msg = pending.shift())) {
        newTool.draw(msg, false);
      }
    }
  };

  /**
   * Add a new tool to the user interface.
   */
  Tools.add = function (newTool) {
    if (Tools.isBlocked(newTool)) return;

    Tools.register(newTool);

    if (newTool.stylesheet) {
      Tools.HTML.addStylesheet(newTool.stylesheet);
    }

    Tools.HTML.addTool(
      newTool.name,
      newTool.icon,
      newTool.iconHTML,
      newTool.shortcut,
      newTool.oneTouch,
    );
  };

  // ── Tool Switching ──
  Tools.change = function (toolName) {
    var newTool = Tools.list[toolName];
    var oldTool = Tools.curTool;
    if (!newTool)
      throw new Error("Trying to select a tool that has never been added!");
    if (newTool === oldTool) {
      if (newTool.secondary) {
        newTool.secondary.active = !newTool.secondary.active;
        var props = newTool.secondary.active ? newTool.secondary : newTool;
        Tools.HTML.toggle(newTool.name, props.name, props.icon);
        if (newTool.secondary.switch) newTool.secondary.switch();
      }
      return;
    }
    if (!newTool.oneTouch) {
      var curToolName = Tools.curTool ? Tools.curTool.name : "";
      try {
        Tools.HTML.changeTool(curToolName, toolName);
      } catch (e) {
        console.error("Unable to update the GUI with the new tool. " + e);
      }
      Tools.svg.style.cursor = newTool.mouseCursor || "auto";
      Tools.board.title = Tools.i18n.t(newTool.helpText || "");

      if (Tools.curTool !== null) {
        if (newTool === Tools.curTool) return;
        Tools.removeToolListeners(Tools.curTool);
        Tools.curTool.onquit(newTool);
      }

      Tools.addToolListeners(newTool);
      Tools.curTool = newTool;
    }

    newTool.onstart(oldTool);
  };

  // ── Event Listener Management ──
  Tools.addToolListeners = function addToolListeners(tool) {
    for (var event in tool.compiledListeners) {
      var listener = tool.compiledListeners[event];
      var target = listener.target || Tools.board;
      target.addEventListener(event, listener, { passive: false });
    }
  };

  Tools.removeToolListeners = function removeToolListeners(tool) {
    for (var event in tool.compiledListeners) {
      var listener = tool.compiledListeners[event];
      var target = listener.target || Tools.board;
      target.removeEventListener(event, listener);
      if (Tools.isIE) target.removeEventListener(event, listener, true);
    }
  };

  // ── Shift Key Secondary Tool Toggle ──
  (function () {
    function handleShift(active, evt) {
      if (
        evt.keyCode === 16 &&
        Tools.curTool.secondary &&
        Tools.curTool.secondary.active !== active
      ) {
        Tools.change(Tools.curTool.name);
      }
    }
    window.addEventListener("keydown", handleShift.bind(null, true));
    window.addEventListener("keyup", handleShift.bind(null, false));
  })();
})();
