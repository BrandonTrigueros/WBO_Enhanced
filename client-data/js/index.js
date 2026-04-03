function createPreviewCard(name, href, previewUrl) {
  var card = document.createElement("a");
  card.className = "preview-card";
  card.href = href;

  var imgWrap = document.createElement("div");
  imgWrap.className = "preview-card-img";
  var img = document.createElement("img");
  img.src = previewUrl;
  img.alt = name;
  img.loading = "lazy";
  imgWrap.appendChild(img);
  card.appendChild(imgWrap);

  var label = document.createElement("span");
  label.className = "preview-card-label";
  label.textContent = name;
  card.appendChild(label);

  return card;
}

function showRecentBoards() {
  var parent = document.getElementById("recent-boards");
  var grid = document.querySelector("#recent-boards .preview-grid");
  if (grid) parent.removeChild(grid);
  parent.classList.add("hidden");

  var recentBoards = JSON.parse(localStorage.getItem("recent-boards")) || [];
  recentBoards = recentBoards.filter(function (name) {
    return name.indexOf("book~") !== 0;
  });
  localStorage.setItem("recent-boards", JSON.stringify(recentBoards));
  if (recentBoards.length === 0) return;

  grid = document.createElement("div");
  grid.className = "preview-grid";

  recentBoards.forEach(function (name) {
    var href = "/boards/" + encodeURIComponent(name);
    var previewUrl = "/preview/" + encodeURIComponent(name);
    grid.appendChild(createPreviewCard(name, href, previewUrl));
  });

  parent.appendChild(grid);
  parent.classList.remove("hidden");
}

function showRecentBooks() {
  var parent = document.getElementById("recent-books");
  if (!parent) return;
  var grid = document.querySelector("#recent-books .preview-grid");
  if (grid) parent.removeChild(grid);
  parent.classList.add("hidden");

  var recentBooks = JSON.parse(localStorage.getItem("recent-books")) || [];
  if (recentBooks.length === 0) return;

  grid = document.createElement("div");
  grid.className = "preview-grid";

  recentBooks.forEach(function (name) {
    var href = "/books/" + encodeURIComponent(name);
    var previewUrl = "/preview/" + encodeURIComponent("book~" + name + "~p1");
    grid.appendChild(createPreviewCard(name, href, previewUrl));
  });

  parent.appendChild(grid);
  parent.classList.remove("hidden");
}

window.addEventListener("pageshow", function () {
  showRecentBoards();
  showRecentBooks();
});
