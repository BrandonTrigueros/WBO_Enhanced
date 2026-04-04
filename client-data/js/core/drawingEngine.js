/**
 * drawingEngine.js — Drawing Engine Module
 * Provides tool hooks (attribute validation and listener compilation with
 * coordinate transforms for both regular and book mode), plus SVG utility
 * functions: generateUID, createSVGElement, positionElement.
 */
(function () {
  "use strict";

  // ── Tool Hooks ──
  Tools.toolHooks = [
    function checkToolAttributes(tool) {
      if (typeof tool.name !== "string") throw "A tool must have a name";
      if (typeof tool.listeners !== "object") {
        tool.listeners = {};
      }
      if (typeof tool.onstart !== "function") {
        tool.onstart = function () {};
      }
      if (typeof tool.onquit !== "function") {
        tool.onquit = function () {};
      }
    },
    function compileListeners(tool) {
      var listeners = tool.listeners;

      var compiled = tool.compiledListeners || {};
      tool.compiledListeners = compiled;

      function compile(listener) {
        return function listen(evt) {
          var x, y;
          if (Tools.isBookMode) {
            var rect = Tools.svg.getBoundingClientRect();
            x =
              (evt.clientX - rect.left) *
              (Tools.svg.width.baseVal.value / rect.width);
            y =
              (evt.clientY - rect.top) *
              (Tools.svg.height.baseVal.value / rect.height);
          } else {
            x = evt.pageX / Tools.getScale();
            y = evt.pageY / Tools.getScale();
          }
          return listener(x, y, evt, false);
        };
      }

      /** Drawing tools that should only respond to stylus, not finger */
      var drawingToolNames = {
        "Pencil": true, "Straight line": true, "Rectangle": true,
        "Ellipse": true, "Text": true, "Eraser": true,
      };

      function compileTouch(listener) {
        return function touchListen(evt) {
          if (evt.changedTouches.length === 1) {
            var touch = evt.changedTouches[0];

            // On tablets with stylus support: finger touch on a drawing tool
            // should pan (let browser handle it), not draw.
            // touchType is "stylus" for Apple Pencil, "direct" for finger.
            // If touchType is undefined (non-Apple), fall through normally.
            if (touch.touchType === "direct" &&
                drawingToolNames[Tools.curTool && Tools.curTool.name]) {
              return true; // let browser handle native scroll/pan
            }

            var x, y;
            if (Tools.isBookMode) {
              var rect = Tools.svg.getBoundingClientRect();
              x =
                (touch.clientX - rect.left) *
                (Tools.svg.width.baseVal.value / rect.width);
              y =
                (touch.clientY - rect.top) *
                (Tools.svg.height.baseVal.value / rect.height);
            } else {
              x = touch.pageX / Tools.getScale();
              y = touch.pageY / Tools.getScale();
            }
            return listener(x, y, evt, true);
          }
          return true;
        };
      }

      function wrapUnsetHover(f) {
        return function unsetHover(evt) {
          document.activeElement &&
            document.activeElement.blur &&
            document.activeElement.blur();
          return f(evt);
        };
      }

      if (listeners.press) {
        compiled["mousedown"] = wrapUnsetHover(compile(listeners.press));
        compiled["touchstart"] = wrapUnsetHover(
          compileTouch(listeners.press),
        );
      }
      if (listeners.move) {
        compiled["mousemove"] = compile(listeners.move);
        compiled["touchmove"] = compileTouch(listeners.move);
      }
      if (listeners.release) {
        var release = compile(listeners.release),
          releaseTouch = compileTouch(listeners.release);
        compiled["mouseup"] = release;
        if (!Tools.isIE) compiled["mouseleave"] = release;
        compiled["touchleave"] = releaseTouch;
        compiled["touchend"] = releaseTouch;
        compiled["touchcancel"] = releaseTouch;
      }
    },
  ];

  // ── SVG Utility Functions ──
  Tools.generateUID = function (prefix, suffix) {
    var uid = Date.now().toString(36);
    uid += Math.round(Math.random() * 36).toString(36);
    if (prefix) uid = prefix + uid;
    if (suffix) uid = uid + suffix;
    return uid;
  };

  Tools.createSVGElement = function createSVGElement(name, attrs) {
    var elem = document.createElementNS(Tools.svg.namespaceURI, name);
    if (typeof attrs !== "object") return elem;
    Object.keys(attrs).forEach(function (key) {
      elem.setAttributeNS(null, key, attrs[key]);
    });
    return elem;
  };

  Tools.positionElement = function (elem, x, y) {
    elem.style.top = y + "px";
    elem.style.left = x + "px";
  };
})();
