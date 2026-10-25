// sort.js
// 全域表格排序元件（Table Sort）
// ------------------------------------------------------------
// 使用方式：在可排序的 <th> 加上 data-sort，並放一個 .sort-icon 圖示：
//   <th data-sort>欄位名 <i class="material-symbols-outlined sort-icon">arrow_drop_down</i></th>
//
// 進階（皆為選填）：
//   data-sort-type="text|number|date"  指定該欄比較方式，預設 text（中文筆畫排序）
//   data-sort-default                  該表格載入時自動以此欄做一次預設排序（A→Z）
//
// 與 pagination.js 協作：排序後若表格位於 [data-pagination-root] 內，
// 會觸發 pagination:refresh 讓分頁重新渲染（維持當前頁）。
//
// 採「事件委派」綁定於 document，因此動態產生的表格（例如 dialog 內容）
// 不需額外配線即可自動生效。
// ------------------------------------------------------------

(function ($) {
  // 防止重複載入
  if ($.__tableSortLoaded) return;
  $.__tableSortLoaded = true;

  // 取得某列在指定欄位的文字值
  function _cellValue($row, colIndex) {
    return $row.children("td").eq(colIndex).text().trim();
  }

  // 依 data-sort-type 產生比較結果（正值 = a 在後）
  function _compare(aText, bText, type) {
    if (type === "number") {
      // 去除千分位、貨幣符號等非數字字元後比較
      var an = parseFloat(aText.replace(/[^\d.\-]/g, ""));
      var bn = parseFloat(bText.replace(/[^\d.\-]/g, ""));
      an = isNaN(an) ? -Infinity : an;
      bn = isNaN(bn) ? -Infinity : bn;
      return an - bn;
    }
    if (type === "date") {
      var ad = Date.parse(aText);
      var bd = Date.parse(bText);
      ad = isNaN(ad) ? -Infinity : ad;
      bd = isNaN(bd) ? -Infinity : bd;
      return ad - bd;
    }
    // 預設：中文筆畫排序（zh-Hant + stroke collation）
    return aText.localeCompare(bText, "zh-Hant", { collation: "stroke" });
  }

  // 把 tbody 依「主列 + 其後的 child row」分組，排序時整組一起搬移，
  // 避免展開的子列（.child-container）與主列脫鉤。（與 pagination.js 的分組邏輯一致）
  function _getRowGroups($tbody) {
    var groups = [];
    $tbody.children("tr").each(function () {
      var $row = $(this);
      if ($row.hasClass("child-container") && groups.length) {
        groups[groups.length - 1].children.push($row);
      } else {
        groups.push({ main: $row, children: [] });
      }
    });
    return groups;
  }

  // 對指定表頭執行排序
  function _sortByHeader($th) {
    var $table = $th.closest("table");
    if (!$table.length) return;

    // 優先使用 [data-pagination-body]，否則退回第一個 tbody
    var $tbody = $table.find("[data-pagination-body]").first();
    if (!$tbody.length) $tbody = $table.find("tbody").first();
    if (!$tbody.length) return;

    var colIndex = $th.index();
    var type = $th.attr("data-sort-type") || "text";
    var $icon = $th.find(".sort-icon");

    // 判斷排序方向（與舊 dialog 行為一致）：
    // arrow_drop_down = 由大到小 / 中文筆畫遞減（反向 localeCompare）
    // arrow_drop_up   = 由小到大 / 中文筆畫遞增（正向 localeCompare）
    var prevColIndex = $table.data("sortColIndex");
    if (prevColIndex === colIndex) {
      // 同一欄位：切換方向
      var isDown = $icon.text().trim() === "arrow_drop_down";
      $icon.text(isDown ? "arrow_drop_up" : "arrow_drop_down");
    } else {
      // 不同欄位：重置所有箭頭為向下，設定新的排序欄位
      $table.find("th[data-sort] .sort-icon").text("arrow_drop_down");
      $table.data("sortColIndex", colIndex);
    }

    var sortDir = $icon.text().trim() === "arrow_drop_down" ? "down" : "up";

    // 依主列的欄位值排序（child rows 跟著主列移動）
    var groups = _getRowGroups($tbody);
    groups.sort(function (a, b) {
      var cmp = _compare(
        _cellValue(a.main, colIndex),
        _cellValue(b.main, colIndex),
        type
      );
      return sortDir === "down" ? -cmp : cmp;
    });

    // 重新排列 DOM（主列 + 其 child rows 一起）
    $.each(groups, function (i, group) {
      $tbody.append(group.main);
      $.each(group.children, function (j, $child) {
        $tbody.append($child);
      });
    });

    // 與 pagination.js 協作：若在分頁容器內，重新渲染分頁（維持當前頁）
    var $root = $th.closest("[data-pagination-root]");
    if ($root.length) {
      $root.trigger("pagination:refresh");
    }

    // 對外事件：方便個別頁面接手客製處理
    $table.trigger("table:sorted", [colIndex, sortDir]);
  }

  // 事件委派：任何 th[data-sort] 被點擊都會處理（含動態產生的表格）
  $(document).on("click", "th[data-sort]", function () {
    _sortByHeader($(this));
  });

  // 初始化：對指定範圍內帶 data-sort-default 的欄位，觸發一次預設排序。
  // scope 省略時掃描整份文件；dialog 開啟後可傳入 dialog 容器範圍。
  function initTableSort(scope) {
    var $scope = scope ? $(scope) : $(document);
    $scope.find("th[data-sort][data-sort-default]").each(function () {
      var $th = $(this);
      var $table = $th.closest("table");
      // 尚未排序過才觸發，避免重複初始化
      if ($table.data("sortInit")) return;
      $table.data("sortInit", true);
      _sortByHeader($th);
    });
  }

  // 對外公開，供 dialog 等動態內容在注入後呼叫
  window.initTableSort = initTableSort;

  // 頁面載入時執行一次（處理靜態頁面的預設排序）
  $(function () {
    initTableSort(document);
  });
})(jQuery);
