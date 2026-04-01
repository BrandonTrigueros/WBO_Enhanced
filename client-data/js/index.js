function showRecentBoards() {
  var parent = document.getElementById("recent-boards");
  var ul = document.querySelector("#recent-boards ul");
  ul && parent.removeChild(ul);
  parent.classList.add("hidden");

  var recentBoards = JSON.parse(localStorage.getItem("recent-boards")) || [];
  // Filter out any stale book page names that shouldn't be here
  recentBoards = recentBoards.filter(function (name) {
    return name.indexOf("book~") !== 0;
  });
  localStorage.setItem("recent-boards", JSON.stringify(recentBoards));
  if (recentBoards.length === 0) return;

  var list = document.createElement("ul");

  recentBoards.forEach(function (name) {
    var listItem = document.createElement("li");
    var link = document.createElement("a");
    link.setAttribute("href", "/boards/" + encodeURIComponent(name));
    link.textContent = name;
    listItem.appendChild(link);
    list.appendChild(listItem);
  });

  parent.appendChild(list);
  parent.classList.remove("hidden");
}

function showRecentBooks() {
  var parent = document.getElementById("recent-books");
  if (!parent) return;
  var ul = document.querySelector("#recent-books ul");
  ul && parent.removeChild(ul);
  parent.classList.add("hidden");

  var recentBooks = JSON.parse(localStorage.getItem("recent-books")) || [];
  if (recentBooks.length === 0) return;

  var list = document.createElement("ul");

  recentBooks.forEach(function (name) {
    var listItem = document.createElement("li");
    var link = document.createElement("a");
    link.setAttribute("href", "/books/" + encodeURIComponent(name));
    link.textContent = name;
    listItem.classList.add("book-item");
    listItem.appendChild(link);
    list.appendChild(listItem);
  });

  parent.appendChild(list);
  parent.classList.remove("hidden");
}

window.addEventListener("pageshow", function () {
  showRecentBoards();
  showRecentBooks();
});
