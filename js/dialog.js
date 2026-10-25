// dialog.js
// 可重複使用的全頁彈窗元件（Dialog / Modal）
// 使用方式：$.DialogBox.open({ title: '標題', content: '<p>內容 HTML</p>' });
// 每次呼叫時動態建立 DOM，關閉後自動移除，不會與頁面上其他元件互相干擾。
//
// 彈窗內若含表格排序 / 分頁，交由全域元件處理（不再內建於本檔）：
//   - 排序：js/sort.js      在 th 加 data-sort；事件委派，動態內容自動生效
//   - 分頁：js/pagination.js 外層加 data-pagination-root；開啟後由本檔呼叫初始化

(function ($) {
  // 防止重複載入
  if ($.DialogBox) return;

  // 內部計數器，確保多個 dialog 實例的 ID 不衝突
  var _dialogCounter = 0;

  // ============================================
  // 公開 API
  // ============================================

  $.DialogBox = {
    /**
     * 開啟彈窗
     * @param {Object} options - 設定選項
     * @param {string} options.title    - 彈窗標題文字
     * @param {string} options.content  - 彈窗內容（支援 HTML 字串）
     * @param {Function} options.onClose - 關閉時的回呼函式（選填）
     * @returns {string} dialogId - 本次彈窗的唯一 ID，可用於手動關閉
     */
    open: function (options) {
      var opts = $.extend(
        {
          title: "",
          content: "",
          onClose: null,
        },
        options,
      );

      _dialogCounter++;
      var dialogId = "dialog-instance-" + _dialogCounter;

      // 動態建立 dialog DOM 結構
      var $dialog = $(
        '<div class="dialog-container" id="' +
          dialogId +
          '" style="display:none;">' +
          '<div class="dialog-overlay"></div>' +
          '<div class="dialog-panel">' +
          '<div class="dialog-header">' +
          "<h1>" +
          opts.title +
          "</h1>" +
          '<button type="button" class="btn-icon dialog-close-btn">' +
          '<i class="material-symbols-outlined">close</i>' +
          "</button>" +
          "</div>" +
          '<div class="dialog-body">' +
          opts.content +
          "</div>" +
          "</div>" +
          "</div>",
      );

      // 將彈窗加入 body（不放在 form 或其他容器內，避免干擾）
      $(document.body).append($dialog);

      // 禁止背景滾動
      $("body").css("overflow", "hidden");

      // 綁定關閉事件：點擊關閉按鈕或遮罩
      $dialog
        .find(".dialog-close-btn, .dialog-overlay")
        .on("click", function () {
          $.DialogBox.close(dialogId, opts.onClose);
        });

      // 綁定 ESC 鍵關閉
      $(document).on("keydown.dialog_" + dialogId, function (e) {
        if (e.key === "Escape" || e.keyCode === 27) {
          $.DialogBox.close(dialogId, opts.onClose);
        }
      });

      // 顯示彈窗（淡入動畫）
      $dialog.stop(true, true).fadeIn(200);

      // 初始化 dialog 內的表格功能（分頁 + 排序，皆為全域元件）。
      // 先分頁再排序：排序的預設觸發會發出 pagination:refresh，需分頁先綁定才會生效。
      if (typeof window.initTablePagination === "function") {
        window.initTablePagination($dialog);
      }
      if (typeof window.initTableSort === "function") {
        window.initTableSort($dialog);
      }

      return dialogId;
    },

    /**
     * 關閉指定彈窗（若不傳 dialogId 則關閉最後一個）
     * @param {string} dialogId - 彈窗 ID
     * @param {Function} onClose - 關閉回呼
     */
    close: function (dialogId, onClose) {
      var $target;

      if (dialogId) {
        $target = $("#" + dialogId);
      } else {
        $target = $(".dialog-container").last();
      }

      if ($target.length === 0) return;

      var id = $target.attr("id");

      $target.stop(true, true).fadeOut(200, function () {
        // 動畫結束後移除 DOM
        $target.remove();

        // 如果已經沒有其他 dialog，恢復背景滾動
        if ($(".dialog-container").length === 0) {
          $("body").css("overflow", "");
        }

        // 執行關閉回呼
        if (typeof onClose === "function") {
          onClose();
        }
      });

      // 解除此 dialog 的 ESC 綁定
      $(document).off("keydown.dialog_" + id);
    },
  };
})(jQuery);
