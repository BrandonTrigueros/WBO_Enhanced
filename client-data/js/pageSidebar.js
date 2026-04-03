/**
 * Page Thumbnail Sidebar — renders page previews in a collapsible sidebar.
 * Single Responsibility: sidebar UI rendering and toggle behavior.
 * Depends on: pageBoardName function (injected via init config).
 */
(function pageSidebarModule() {
  "use strict";

  var sidebar = document.getElementById("pageSidebar");
  var sidebarList = document.getElementById("pageSidebarList");
  var sidebarToggle = document.getElementById("sidebarToggle");
  if (!sidebar || !sidebarList || !sidebarToggle) return;

  var config = {
    pageBoardName: null, // function(pageNum) → board name string
    getPageCount: null,  // function() → number
    getCurrentPage: null, // function() → number
    onPageClick: null,   // function(pageNum)
  };

  function buildThumbnails() {
    var pageCount = config.getPageCount();
    var currentPage = config.getCurrentPage();
    sidebarList.innerHTML = "";
    for (var i = 1; i <= pageCount; i++) {
      sidebarList.appendChild(createThumbnail(i, currentPage));
    }
  }

  function createThumbnail(pageNum, currentPage) {
    var div = document.createElement("div");
    div.className = "pageThumbnail" + (pageNum === currentPage ? " active" : "");
    div.dataset.page = pageNum;

    var img = document.createElement("img");
    var boardName = config.pageBoardName(pageNum);
    img.src = "/preview/" + encodeURIComponent(boardName);
    img.alt = "Page " + pageNum;
    img.loading = "lazy";
    img.onerror = function () { img.style.display = "none"; };
    div.appendChild(img);

    var label = document.createElement("span");
    label.className = "pageThumbnailLabel";
    label.textContent = pageNum;
    div.appendChild(label);

    div.addEventListener("click", function () {
      if (config.onPageClick) config.onPageClick(pageNum);
    });

    return div;
  }

  function highlightActive() {
    var currentPage = config.getCurrentPage();
    var thumbs = sidebarList.querySelectorAll(".pageThumbnail");
    for (var i = 0; i < thumbs.length; i++) {
      thumbs[i].classList.toggle("active", parseInt(thumbs[i].dataset.page) === currentPage);
    }
  }

  function refreshThumbnail(pageNum) {
    var img = sidebarList.querySelector('.pageThumbnail[data-page="' + pageNum + '"] img');
    if (img) {
      var boardName = config.pageBoardName(pageNum);
      img.src = "/preview/" + encodeURIComponent(boardName) + "?t=" + Date.now();
    }
  }

  // Toggle sidebar visibility
  sidebarToggle.addEventListener("click", function () {
    sidebar.classList.toggle("hidden");
    document.body.classList.toggle("sidebar-open");
    if (!sidebar.classList.contains("hidden")) {
      buildThumbnails();
    }
  });

  // Public API on global Tools namespace
  if (typeof Tools !== "undefined") {
    Tools.pageSidebar = {
      init: function (cfg) {
        config.pageBoardName = cfg.pageBoardName;
        config.getPageCount = cfg.getPageCount;
        config.getCurrentPage = cfg.getCurrentPage;
        config.onPageClick = cfg.onPageClick;
      },
      rebuild: buildThumbnails,
      highlightActive: highlightActive,
      refreshThumbnail: refreshThumbnail,
    };
  }
})();
