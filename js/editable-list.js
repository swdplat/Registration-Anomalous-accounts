// ============================================================================
// editable-list.js — 可即時編輯的資料列表（新增 / 刪除 / 單列修改）
// ============================================================================
//
// 【與 components.js initDynamicRowHandler 的差異】
//   components.js 的 data-section="dynamic-*" 是「複製空白範本列」的新增方式，
//   且刻意保留「至少需要保留一筆自訂條件，無法刪除。」的限制。
//   本檔是另一套獨立邏輯，不改動也不覆寫原本那組行為：
//     1. 新增列的內容來自區塊外的輸入框，而非複製一列空白欄位。
//     2. 不套用「至少保留一筆」限制 —— 這種列表可以刪到 0 筆。
//     3. 支援單列切換為編輯狀態（範本內容變輸入框、出現確定 / 取消）。
//   兩者以不同的 data-* 屬性區分，同一頁可並存；一個 <tbody> 只掛其中一種。
//
// 【HTML 宣告方式】
//   輸入框：      data-editable-source="<列表名稱>"
//   新增按鈕：    data-editable-add="<列表名稱>"
//                 data-editable-add-message="<文案>" ← 選填，新增成功的 toast 文字
//                                                      （預設「新增成功」）
//   資料 <tbody>：data-editable-list="<列表名稱>"，內含 tr.data-row
//   空狀態 <tbody>：data-editable-empty（與資料 tbody 同一個 <table>）
//   列內欄位：    [data-editable-cell] 內放
//                   <span data-editable-text>   ← 檢視狀態顯示的文字
//                   [data-editable-field]        ← 編輯狀態顯示的 .field 輸入框，
//                                                  預設加 .hide，內含輸入框與
//                                                  .input-buttons（確定 / 取消）
//   列內按鈕：    功能欄  data-action="delete-row" / "edit-row"
//                 輸入框內 data-action="confirm-edit" / "cancel-edit"
//   離開守門：    data-editable-guard="<列表名稱>"（包住 header 的儲存 / 取消等按鈕）
//
// 【行為】
//   1. 輸入框有值 → 按「新增」把值追加成新的一列（沿用第一列當範本 clone），
//      並跳成功 toast（文案見 data-editable-add-message）；沒填值則跳
//      「請輸入範本內容」。
//   2. 「刪除」→ 確認後移除該列，可刪到 0 筆，改顯示空狀態 tbody。
//   3. 「修改」→ 該列文字換成輸入框、顯示確定 / 取消，並把刪除 / 修改設為 disabled。
//   4. 「確定」寫回新值、「取消」還原原值，兩者都會結束編輯狀態。
//   5. Enter 快捷：新增輸入框 = 按「新增」，編輯中的列 = 按「確定」。
//   6. 還有列停在編輯狀態時，點 data-editable-guard 內的按鈕會先跳彈窗提醒，
//      並擋下該次動作（提醒使用者未按「確定」的內容不會被存下來）。
//
// 【disable 做法】沿用 components.js 的 $el.prop("disabled", ...)；
//   顯示 / 隱藏一律用共用的 .hide（display: none !important）。
//
// 【分頁】列數變動後對外層 [data-pagination-root] 觸發 pagination:refresh，
//   由 pagination.js 重算頁數，不在本檔重複實作分頁。
// ============================================================================

$(function () {
    "use strict";

    var DEFAULT_ADD_MESSAGE = "新增成功";

    // ---- 共用小工具 --------------------------------------------------------

    // 依名稱取得資料列所在的 <tbody>
    function findList(name) {
        return $('[data-editable-list="' + name + '"]').first();
    }

    // 取得該列目前（檢視狀態）的文字
    function getRowText($row) {
        return ($row.find("[data-editable-text]").first().text() || "").trim();
    }

    // 沒有任何資料列時顯示空狀態，有資料則隱藏
    function toggleEmptyState($list) {
        var hasRow = $list.children("tr").length > 0;
        $list.closest("table").find("[data-editable-empty]").toggleClass("hide", hasRow);
    }

    // 列數變動後請 pagination.js 重算頁數（沒有分頁容器時什麼都不會發生）
    function refreshPagination($list) {
        $list.closest("[data-pagination-root]").trigger("pagination:refresh");
    }

    // 切換單列的檢視 / 編輯狀態
    function setRowEditing($row, isEditing) {
        var $cell = $row.find("[data-editable-cell]");
        $cell.find("[data-editable-text]").toggleClass("hide", isEditing);
        // 確定 / 取消是疊在輸入框右側內緣的 .input-buttons，包在 [data-editable-field]
        // 裡面，跟著整組一起顯示 / 隱藏，不需要再各自切 class
        $cell.find("[data-editable-field]").toggleClass("hide", !isEditing);

        // 編輯中：該列的刪除 / 修改 disabled
        $row
            .find('[data-action="delete-row"], [data-action="edit-row"]')
            .prop("disabled", isEditing);
    }

    // 該列表目前是否還有列停在編輯狀態（[data-editable-field] 沒被 .hide 蓋掉）
    function hasRowEditing($list) {
        return $list.find("[data-editable-field]").not(".hide").length > 0;
    }

    // 共用 toast（單獨載入、沒引入 toast-message.js 時不報錯）
    function notify(message) {
        if (typeof toastMessage === "function") {
            toastMessage(message);
        }
    }

    // 空值提示：共用 toast，並把游標留在輸入框
    function warnEmpty($input) {
        notify("請輸入範本內容");
        $input.trigger("focus");
    }

    // ---- 初始化 ------------------------------------------------------------

    // 依目前列數決定要不要顯示空狀態（HTML 可直接寫死一筆或零筆資料）
    $("[data-editable-list]").each(function () {
        toggleEmptyState($(this));
    });

    // ---- 新增 --------------------------------------------------------------

    $("[data-editable-add]").each(function () {
        var $addBtn = $(this);
        var listName = $addBtn.attr("data-editable-add");
        var $list = findList(listName);
        if ($list.length === 0) return;

        var $source = $('[data-editable-source="' + listName + '"]').first();
        var addMessage =
            $addBtn.attr("data-editable-add-message") || DEFAULT_ADD_MESSAGE;

        // 進畫面時先存一份範本列，之後即使全部刪光仍能新增
        // （沿用 components.js initDynamicRowHandler 的作法：HTML 至少提供一列當範本）
        var $templateRow = $list.children(".data-row").first().clone();
        if ($templateRow.length === 0) return;

        $addBtn.on("click", function () {
            var value = ($source.val() || "").trim();
            if (!value) {
                warnEmpty($source);
                return;
            }

            var $newRow = $templateRow.clone();
            $newRow.find("[data-editable-text]").text(value);
            $newRow.find("[data-editable-field]").find("input").val(value);
            setRowEditing($newRow, false); // 新列一律以檢視狀態加入

            $list.append($newRow);
            $source.val("");

            toggleEmptyState($list);
            refreshPagination($list);
            notify(addMessage);
        });

        // 在輸入框按 Enter 等同按「新增」
        // （components.js 已全域擋掉 input 的 Enter 送出，這裡再擋一次確保單獨載入也安全）
        $source.on("keydown", function (e) {
            if (e.key !== "Enter" && e.keyCode !== 13) return;
            e.preventDefault();
            $addBtn.trigger("click");
        });
    });

    // ---- 刪除 / 修改 / 確定 / 取消（事件委派） -------------------------------

    $(document).on("click", "[data-editable-list] [data-action]", function () {
        var $btn = $(this);
        var action = $btn.attr("data-action");
        var $row = $btn.closest("tr");
        var $list = $row.closest("[data-editable-list]");
        var $input = $row.find("[data-editable-field]").find("input").first();

        if (action === "delete-row") {
            // 此列表不套用「至少保留一筆」限制，可以全部刪除
            if (!confirm("確定要刪除這筆資料嗎？")) return;

            $row.remove();
            toggleEmptyState($list);
            refreshPagination($list);
            return;
        }

        if (action === "edit-row") {
            $input.val(getRowText($row));
            setRowEditing($row, true);
            $input.trigger("focus");
            return;
        }

        if (action === "confirm-edit") {
            var value = ($input.val() || "").trim();
            if (!value) {
                warnEmpty($input);
                return;
            }

            $row.find("[data-editable-text]").text(value);
            setRowEditing($row, false);
            return;
        }

        if (action === "cancel-edit") {
            // 取消不寫回，[data-editable-text] 仍是原值，直接結束編輯狀態即可
            setRowEditing($row, false);
        }
    });

    // ---- 編輯未結束就要離開的提醒 -------------------------------------------

    // [data-editable-guard="<列表名稱>"] 內的按鈕（例如 header 的儲存 / 取消），
    // 在該列表還有列停在編輯狀態時攔下點擊，先跳彈窗提醒。
    // 這裡直接綁在按鈕上而非委派到 document：元素上的處理器會早於 document 委派，
    // 之後若有人再幫儲存 / 取消掛上真正的行為，stopImmediatePropagation 才擋得住。
    $("[data-editable-guard]").each(function () {
        var $guard = $(this);
        var $list = findList($guard.attr("data-editable-guard"));
        if ($list.length === 0) return;

        $guard.find("button").on("click", function (e) {
            if (!hasRowEditing($list)) return;

            e.preventDefault();
            e.stopImmediatePropagation(); // 擋掉同一顆按鈕上其他後綁的行為
            if ($.PopupBox) {
                $.PopupBox.show(
                    "您的範本內容尚在編輯中，你接下來的動作將會無法儲存你更新的內容。",
                    "我知道了"
                );
            }
        });
    });

    // 編輯中的列按 Enter 等同按「確定」（與新增輸入框的操作一致）
    $(document).on(
        "keydown",
        "[data-editable-list] [data-editable-field] input",
        function (e) {
            if (e.key !== "Enter" && e.keyCode !== 13) return;
            e.preventDefault();
            $(this).closest("tr").find('[data-action="confirm-edit"]').trigger("click");
        }
    );
});
