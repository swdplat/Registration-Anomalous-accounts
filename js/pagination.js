$(document).ready(function () {
  // 統一 table 分頁控制（以 table wrapper 為單位）
  // scope 省略時掃描整份文件；動態產生的內容（如 dialog）可傳入容器範圍再初始化。
  function initTablePagination(scope) {
    const $scope = scope ? $(scope) : $(document);
    $scope.find("[data-pagination-root]").each(function () {
      const $root = $(this);
      // 已初始化過的表格直接略過：重跑本函式時不會重置其他表格的當前頁
      if ($root.data("paginationInit")) return;
      $root.data("paginationInit", true);
      const $table = $root.find("[data-pagination-table]").first();
      const $tbody = $table.find("[data-pagination-body]").first().length
        ? $table.find("[data-pagination-body]").first()
        : $table.find("tbody").first();
      const $pagination = $root.find("[data-pagination]").first();

      if (!$table.length || !$tbody.length || !$pagination.length) return;

      const pageSize = Number($root.attr("data-page-size")) || 10;
      let currentPage = 1;

      function getRowGroups() {
        const groups = [];
        $tbody.children("tr").each(function () {
          const $row = $(this);
          if ($row.hasClass("child-container") && groups.length) {
            groups[groups.length - 1].children.push($row);
          } else {
            groups.push({ main: $row, children: [] });
          }
        });
        return groups;
      }

      function syncPageButtons(totalPages) {
        const $numberButtons = $pagination.find("[data-pagination-page]");
        if ($numberButtons.length !== totalPages) {
          const $nextButton = $pagination.find('[data-pagination-action="next"]');
          $pagination.find("[data-pagination-page]").remove();
          for (let page = 1; page <= totalPages; page += 1) {
            const button = `<button type="button" class="page-number" data-pagination-page="${page}">${page}</button>`;
            if ($nextButton.length) {
              $nextButton.before(button);
            } else {
              $pagination.append(button);
            }
          }
        }
      }

      function render() {
        const groups = getRowGroups();
        const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);

        syncPageButtons(totalPages);

        groups.forEach((group) => {
          group.main.hide();
          group.children.forEach(($child) => $child.hide());
        });

        const startIndex = (currentPage - 1) * pageSize;
        const currentGroups = groups.slice(startIndex, startIndex + pageSize);
        currentGroups.forEach((group) => {
          group.main.show();
        });

        $pagination.find("[data-pagination-page]").removeClass("active");
        $pagination
          .find(`[data-pagination-page="${currentPage}"]`)
          .addClass("active");

        $pagination
          .find('[data-pagination-action="first"], [data-pagination-action="prev"]')
          .prop("disabled", currentPage === 1);
        $pagination
          .find('[data-pagination-action="last"], [data-pagination-action="next"]')
          .prop("disabled", currentPage === totalPages);

        // 換頁時重置展開列，避免 child row 與當前頁資料不同步
        $root.find(".btn-select").removeClass("active");
        $root
          .find(".btn-select .material-symbols-outlined")
          .text("keyboard_arrow_down");
      }

      $pagination.off("click.pagination").on("click.pagination", "button", function () {
        const $button = $(this);
        const action = $button.attr("data-pagination-action");
        const targetPage = Number($button.attr("data-pagination-page"));
        const groups = getRowGroups();
        const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));

        if (Number.isFinite(targetPage) && targetPage > 0) {
          currentPage = targetPage;
        } else if (action === "first") {
          currentPage = 1;
        } else if (action === "prev") {
          currentPage = Math.max(1, currentPage - 1);
        } else if (action === "next") {
          currentPage = Math.min(totalPages, currentPage + 1);
        } else if (action === "last") {
          currentPage = totalPages;
        }

        render();
      });

      $root.off("pagination:refresh").on("pagination:refresh", function () {
        render();
      });

      render();
    });
  }

  // 對外公開，供 dialog 等動態內容在注入後呼叫
  window.initTablePagination = initTablePagination;

  initTablePagination(document);
});
