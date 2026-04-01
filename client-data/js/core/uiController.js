/**
 * uiController.js — UI Controller Module
 * Manages the toolbar HTML (template, shortcuts, tool buttons, secondary
 * toggle, stylesheets, color buttons), color presets, color/size/opacity
 * choosers, and menu scroll behavior.
 */
(function () {
  "use strict";

  // ── Toolbar HTML Interface ──
  Tools.HTML = {
    template: new Minitpl("#tools > .tool"),
    addShortcut: function addShortcut(key, callback) {
      window.addEventListener("keydown", function (e) {
        if (e.key === key && !e.target.matches("input[type=text], textarea")) {
          callback();
        }
      });
    },
    addTool: function (
      toolName,
      toolIcon,
      toolIconHTML,
      toolShortcut,
      oneTouch,
    ) {
      var callback = function () {
        Tools.change(toolName);
      };
      this.addShortcut(toolShortcut, function () {
        Tools.change(toolName);
        document.activeElement.blur && document.activeElement.blur();
      });
      return this.template.add(function (elem) {
        elem.addEventListener("click", callback);
        elem.id = "toolID-" + toolName;
        elem.getElementsByClassName("tool-name")[0].textContent =
          Tools.i18n.t(toolName);
        var toolIconElem = elem.getElementsByClassName("tool-icon")[0];
        toolIconElem.src = toolIcon;
        toolIconElem.alt = toolIcon;
        if (oneTouch) elem.classList.add("oneTouch");
        elem.title =
          Tools.i18n.t(toolName) +
          " (" +
          Tools.i18n.t("keyboard shortcut") +
          ": " +
          toolShortcut +
          ")" +
          (Tools.list[toolName].secondary
            ? " [" + Tools.i18n.t("click_to_toggle") + "]"
            : "");
        if (Tools.list[toolName].secondary) {
          elem.classList.add("hasSecondary");
          var secondaryIcon = elem.getElementsByClassName("secondaryIcon")[0];
          secondaryIcon.src = Tools.list[toolName].secondary.icon;
          toolIconElem.classList.add("primaryIcon");
        }
      });
    },
    changeTool: function (oldToolName, newToolName) {
      var oldTool = document.getElementById("toolID-" + oldToolName);
      var newTool = document.getElementById("toolID-" + newToolName);
      if (oldTool) oldTool.classList.remove("curTool");
      if (newTool) newTool.classList.add("curTool");
    },
    toggle: function (toolName, name, icon) {
      var elem = document.getElementById("toolID-" + toolName);

      var primaryIcon = elem.getElementsByClassName("primaryIcon")[0];
      var secondaryIcon = elem.getElementsByClassName("secondaryIcon")[0];
      var primaryIconSrc = primaryIcon.src;
      var secondaryIconSrc = secondaryIcon.src;
      primaryIcon.src = secondaryIconSrc;
      secondaryIcon.src = primaryIconSrc;

      elem.getElementsByClassName("tool-icon")[0].src = icon;
      elem.getElementsByClassName("tool-name")[0].textContent =
        Tools.i18n.t(name);
    },
    addStylesheet: function (href) {
      var link = document.createElement("link");
      link.href = href;
      link.rel = "stylesheet";
      link.type = "text/css";
      document.head.appendChild(link);
    },
    colorPresetTemplate: new Minitpl("#colorPresetSel .colorPresetButton"),
    addColorButton: function (button) {
      var setColor = Tools.setColor.bind(Tools, button.color);
      if (button.key) this.addShortcut(button.key, setColor);
      return this.colorPresetTemplate.add(function (elem) {
        elem.addEventListener("click", setColor);
        elem.id = "color_" + button.color.replace(/^#/, "");
        elem.style.backgroundColor = button.color;
        if (button.key) {
          elem.title = Tools.i18n.t("keyboard shortcut") + ": " + button.key;
        }
      });
    },
  };

  // ── Color Presets & Chooser ──
  Tools.colorPresets = [
    { color: "#001f3f", key: "1" },
    { color: "#FF4136", key: "2" },
    { color: "#0074D9", key: "3" },
    { color: "#FF851B", key: "4" },
    { color: "#FFDC00", key: "5" },
    { color: "#3D9970", key: "6" },
    { color: "#91E99B", key: "7" },
    { color: "#90468b", key: "8" },
    { color: "#7FDBFF", key: "9" },
    { color: "#AAAAAA", key: "0" },
    { color: "#E65194" },
  ];

  Tools.color_chooser = document.getElementById("chooseColor");

  Tools.setColor = function (color) {
    Tools.color_chooser.value = color;
  };

  Tools.getColor = (function color() {
    var color_index = (Math.random() * Tools.colorPresets.length) | 0;
    var initial_color = Tools.colorPresets[color_index].color;
    Tools.setColor(initial_color);
    return function () {
      return Tools.color_chooser.value;
    };
  })();

  Tools.colorPresets.forEach(Tools.HTML.addColorButton.bind(Tools.HTML));

  // ── Size Chooser ──
  Tools.sizeChangeHandlers = [];

  Tools.setSize = (function size() {
    var chooser = document.getElementById("chooseSize");

    function update() {
      var size = Math.max(1, Math.min(50, chooser.value | 0));
      chooser.value = size;
      Tools.sizeChangeHandlers.forEach(function (handler) {
        handler(size);
      });
    }
    update();

    chooser.onchange = chooser.oninput = update;
    return function (value) {
      if (value !== null && value !== undefined) {
        chooser.value = value;
        update();
      }
      return parseInt(chooser.value);
    };
  })();

  Tools.getSize = function () {
    return Tools.setSize();
  };

  // ── Opacity Chooser ──
  Tools.getOpacity = (function opacity() {
    var chooser = document.getElementById("chooseOpacity");
    var opacityIndicator = document.getElementById("opacityIndicator");

    function update() {
      opacityIndicator.setAttribute("opacity", chooser.value);
    }
    update();

    chooser.onchange = chooser.oninput = update;
    return function () {
      return Math.max(0.1, Math.min(1, chooser.value));
    };
  })();

  // ── Menu Scroll ──
  (function () {
    var pos = { top: 0, scroll: 0 };
    var menu = document.getElementById("menu");
    function menu_mousedown(evt) {
      pos = {
        top: menu.scrollTop,
        scroll: evt.clientY,
      };
      menu.addEventListener("mousemove", menu_mousemove);
      document.addEventListener("mouseup", menu_mouseup);
    }
    function menu_mousemove(evt) {
      var dy = evt.clientY - pos.scroll;
      menu.scrollTop = pos.top - dy;
    }
    function menu_mouseup() {
      menu.removeEventListener("mousemove", menu_mousemove);
      document.removeEventListener("mouseup", menu_mouseup);
    }
    menu.addEventListener("mousedown", menu_mousedown);
  })();
})();
