// prize
$(document).ready(function () {
  // 通用的按鈕點擊事件處理
  $(".btn-select").on("click", function () {
    const targetClass = $(this).data("target"); // 取得 data-target 的值
    const targetContainer = $(this)
      .closest("tr")
      .nextAll(`.${targetClass}`)
      .first(); // 找到對應的 child-container
    const icon = $(this).find(".material-symbols-outlined"); // 找到按鈕內的圖示

    // 如果點擊的按鈕已經開啟對應的 child-container
    if (targetContainer.is(":visible")) {
      targetContainer.hide(); // 隱藏對應的 child-container
      icon.text("keyboard_arrow_down"); // 將圖示改為向下箭頭
      $(this).removeClass("active"); // 移除 active class
    } else {
      $(".child-container").hide(); // 隱藏所有的 child-container 並重置所有按鈕的圖示
      $(".btn-select .material-symbols-outlined").text("keyboard_arrow_down"); // 重置所有按鈕的圖示
      $(".btn-select").removeClass("active"); // 移除所有按鈕的 active class

      targetContainer.show(); // 顯示對應的 child-container
      // icon.text('keyboard_arrow_up'); // 將圖示改為向上箭頭
      // 不需以上這行，因為已有css會將icon旋轉180度
      // .btn-select.active i {transform: rotate(180deg);
      $(this).addClass("active"); // 加上 active class
    }
  });

  // 「查看網址」按鈕 → 開啟 Dialog 彈窗（含表格排序 + 分頁）
  $("#openUrlDialogBtn").on("click", function (e) {
    e.preventDefault();

    // 組合表格 HTML 內容
    // 排序：js/sort.js（th 上的 data-sort）；分頁：js/pagination.js（data-pagination-root）
    // 皆為全域元件，dialog.js 於開啟後會呼叫其初始化函式。
    var tableContent =
      '<div class="table-pagination-wrap" data-pagination-root data-page-size="50">' +
      '<table class="item-list" data-pagination-table>' +
      "<thead>" +
      "<tr>" +
      '<th data-sort data-sort-default>語系 <i class="material-symbols-outlined sort-icon">arrow_drop_down</i></th>' +
      '<th data-sort>活動條件 <i class="material-symbols-outlined sort-icon">arrow_drop_down</i></th>' +
      "<th>活動網址</th>" +
      "</tr>" +
      "</thead>" +
      "<tbody data-pagination-body>" +
      "<tr>" +
      "<td>en-us</td>" +
      "<td>無</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/en-us/PrizeZone/Join?ActId=Swplat0915&Condition=129</td>' +
      "</tr>" +
      "<tr>" +
      "<td>en-us</td>" +
      "<td>卡號密碼</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/en-us/PrizeZone/Join?ActId=Swplat0915&Condition=124</td>' +
      "</tr>" +
      "<tr>" +
      "<td>en-us</td>" +
      "<td>單筆滿額送</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/en-us/PrizeZone/Join?ActId=Swplat0915&Condition=128</td>' +
      "</tr>" +
      "<tr>" +
      "<td>id-id</td>" +
      "<td>無</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/id-id/PrizeZone/Join?ActId=Swplat0915&Condition=129</td>' +
      "</tr>" +
      "<tr>" +
      "<td>id-id</td>" +
      "<td>卡號密碼</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/id-id/PrizeZone/Join?ActId=Swplat0915&Condition=124</td>' +
      "</tr>" +
      "<tr>" +
      "<td>id-id</td>" +
      "<td>單筆滿額送</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/id-id/PrizeZone/Join?ActId=Swplat0915&Condition=128</td>' +
      "</tr>" +
      "<tr>" +
      "<td>zh-tw</td>" +
      "<td>無</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/zh-tw/PrizeZone/Join?ActId=Swplat0915&Condition=129</td>' +
      "</tr>" +
      "<tr>" +
      "<td>zh-tw</td>" +
      "<td>卡號密碼</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/zh-tw/PrizeZone/Join?ActId=Swplat0915&Condition=124</td>' +
      "</tr>" +
      "<tr>" +
      "<td>zh-tw</td>" +
      "<td>單筆滿額送</td>" +
      '<td class="copyable-url">https://testmember.mycard520.com.tw/global/zh-tw/PrizeZone/Join?ActId=Swplat0915&Condition=128</td>' +
      "</tr>" +
      "</tbody>" +
      "</table>" +
      '<div class="pagination" data-pagination>' +
      '<button type="button" class="first-page" data-pagination-action="first">第一頁</button>' +
      '<button type="button" class="pre-page" data-pagination-action="prev">上一頁</button>' +
      '<button type="button" class="next-page" data-pagination-action="next">下一頁</button>' +
      '<button type="button" class="last-page" data-pagination-action="last">最後一頁</button>' +
      "</div>" +
      "</div>";

    $.DialogBox.open({
      title: "活動網址",
      content: tableContent,
    });
  });

  // 點擊網址 → 複製到剪貼簿 → 顯示 toast message
  $(document).on("click", ".copyable-url", function () {
    var textToCopy = $(this).text().trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(function () {
        toastMessage("複製成功");
      });
    } else {
      // fallback：建立暫時的 textarea
      var $temp = $("<textarea>");
      $("body").append($temp);
      $temp.val(textToCopy).select();
      document.execCommand("copy");
      $temp.remove();
      toastMessage("複製成功");
    }
  });

  // ============================================
  // 「自訂網頁html/css」按鈕 → 開啟 HTML/CSS 編輯器彈窗
  // ============================================
  (function () {
    var $modal = $("#htmlCssModal");
    if (!$modal.length) return;

    var htmlEditor = null;
    var cssEditor = null;
    // 記錄當前觸發 modal 的按鈕；每顆按鈕（每個頁籤一顆）會各自把已儲存內容
    // 存在自己的 data-saved-html / data-saved-css 屬性，
    // 這樣複製頁籤時透過 jQuery .clone() 會一併帶過去，且彼此獨立。
    var $activeBtn = null;

    function _initEditors() {
      if (htmlEditor && cssEditor) return;

      htmlEditor = CodeMirror.fromTextArea(
        document.getElementById("htmlCssModalHtml"),
        {
          mode: "htmlmixed",
          theme: "dracula",
          lineNumbers: true,
          lineWrapping: true,
          indentUnit: 2,
          tabSize: 2,
        },
      );

      cssEditor = CodeMirror.fromTextArea(
        document.getElementById("htmlCssModalCss"),
        {
          mode: "css",
          theme: "dracula",
          lineNumbers: true,
          lineWrapping: true,
          indentUnit: 2,
          tabSize: 2,
        },
      );
    }

    function _openModal($btn) {
      $activeBtn = $btn;
      $modal.fadeIn(150, function () {
        // 編輯器需在 modal 可見後才能正確計算尺寸
        _initEditors();
        // 從觸發按鈕讀回該頁籤已儲存的內容（取消時用來還原）
        var savedHtml = $btn.attr("data-saved-html") || "";
        var savedCss = $btn.attr("data-saved-css") || "";
        htmlEditor.setValue(savedHtml);
        cssEditor.setValue(savedCss);
        htmlEditor.refresh();
        cssEditor.refresh();
      });
      $("body").css("overflow", "hidden");
    }

    function _closeModal() {
      $modal.fadeOut(150, function () {
        if ($(".dialog-container:visible").length === 0) {
          $("body").css("overflow", "");
        }
      });
      $activeBtn = null;
    }

    // 用事件委派綁定，這樣「複製頁籤」後新生成的按鈕也能正常開啟 modal
    $(document).on("click", ".openHtmlCssModalBtn", function (e) {
      e.preventDefault();
      _openModal($(this));
    });

    // 儲存：把當前編輯器內容寫回觸發按鈕的 data 屬性（每個頁籤獨立保存）
    $modal.on("click", ".htmlcss-modal-save", function () {
      // 此 ID 也用於新增 Regex 規則彈窗；只有由 HTML/CSS 編輯按鈕開啟時才處理並關閉。
      if (!$activeBtn || !$activeBtn.length) return;

      $activeBtn.attr("data-saved-html", htmlEditor.getValue());
      $activeBtn.attr("data-saved-css", cssEditor.getValue());
      _closeModal();
    });

    // 取消 / 關閉 / 點擊遮罩：不更動已儲存內容
    $modal.on(
      "click",
      ".htmlcss-modal-cancel, .htmlcss-modal-close, .htmlcss-modal-overlay",
      function () {
        _closeModal();
      },
    );

    // ESC 鍵關閉
    $(document).on("keydown.htmlCssModal", function (e) {
      if ($modal.is(":visible") && (e.key === "Escape" || e.keyCode === 27)) {
        _closeModal();
      }
    });
  })();
});
