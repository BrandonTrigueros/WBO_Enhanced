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

      /** Drawing tools that should only respond to stylus/mouse, not finger */
      var drawingToolNames = {
        Pencil: true,
        "Straight line": true,
        Rectangle: true,
        Ellipse: true,
        Text: true,
        Eraser: true,
      };

      /**
       * Compile a pointer-event listener that discriminates by pointerType.
       * - "pen"   → always handle (stylus drawing)
       * - "mouse" → always handle (desktop)
       * - "touch" → on drawing tools, finger-pan instead of drawing;
       *             on Hand/Zoom/other tools, handle normally.
       */
      var fingerPanState = null;
      /** Count of active touch pointers (used to suppress pan during pinch) */
      var activeTouchCount = 0;

      function compilePointer(listener, eventPhase) {
        return function pointerListen(evt) {
          // Track active touch pointers for pinch detection
          if (evt.pointerType === "touch") {
            if (eventPhase === "press") {
              activeTouchCount++;
              // Invalidate finger-pan when a second finger arrives (pinch)
              if (activeTouchCount >= 2) fingerPanState = null;
            } else if (eventPhase === "release") {
              activeTouchCount = Math.max(0, activeTouchCount - 1);
            }
          }

          // Finger on a drawing tool → pan instead of drawing
          if (
            evt.pointerType === "touch" &&
            drawingToolNames[Tools.curTool && Tools.curTool.name]
          ) {
            if (eventPhase === "press" && activeTouchCount < 2) {
              evt.preventDefault();
              if (Tools.isBookMode) {
                fingerPanState = {
                  pointerId: evt.pointerId,
                  startX: evt.clientX,
                  startY: evt.clientY,
                  panX: Tools.bookPan.x,
                  panY: Tools.bookPan.y,
                };
              } else {
                fingerPanState = {
                  pointerId: evt.pointerId,
                  startX: evt.clientX,
                  startY: evt.clientY,
                  scrollX: document.documentElement.scrollLeft,
                  scrollY: document.documentElement.scrollTop,
                };
              }
            } else if (
              eventPhase === "move" &&
              fingerPanState &&
              fingerPanState.pointerId === evt.pointerId &&
              activeTouchCount < 2
            ) {
              evt.preventDefault();
              if (Tools.isBookMode) {
                Tools.bookPan.x =
                  fingerPanState.panX + (evt.clientX - fingerPanState.startX);
                Tools.bookPan.y =
                  fingerPanState.panY + (evt.clientY - fingerPanState.startY);
                Tools.applyBookTransform();
              } else {
                window.scrollTo(
                  fingerPanState.scrollX -
                    (evt.clientX - fingerPanState.startX),
                  fingerPanState.scrollY -
                    (evt.clientY - fingerPanState.startY),
                );
              }
            } else if (
              eventPhase === "release" &&
              fingerPanState &&
              fingerPanState.pointerId === evt.pointerId
            ) {
              fingerPanState = null;
            }
            return;
          }

          // For pen input, capture the pointer so we get all move/up events
          // even if the pen moves outside the board element
          if (evt.pointerType === "pen" && evt.type === "pointerdown") {
            evt.currentTarget.setPointerCapture(evt.pointerId);
          }

          evt.preventDefault();

          var x, y;
          if (Tools.isBookMode) {
            // Pure math: board has translate(panX,panY) scale(s) with origin 0,0
            // so SVG coord = (clientCoord - pan) / scale
            // Avoids getBoundingClientRect() which forces a layout recalc
            x = (evt.clientX - Tools.bookPan.x) / Tools.scale;
            y = (evt.clientY - Tools.bookPan.y) / Tools.scale;
          } else {
            x = evt.pageX / Tools.getScale();
            y = evt.pageY / Tools.getScale();
          }
          return listener(x, y, evt, false);
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
        compiled["pointerdown"] = wrapUnsetHover(
          compilePointer(listeners.press, "press"),
        );
      }
      if (listeners.move) {
        compiled["pointermove"] = compilePointer(listeners.move, "move");
      }
      if (listeners.release) {
        var releasePointer = compilePointer(listeners.release, "release");
        compiled["pointerup"] = releasePointer;
        compiled["pointercancel"] = releasePointer;
        if (!Tools.isIE) compiled["pointerleave"] = releasePointer;
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
