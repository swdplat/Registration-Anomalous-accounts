$(document).ready(function () {
  // 日曆開始（使用 https://flatpickr.js.org/）
  // 定義初始化日期選擇器的函數
  function initDatePicker(inputSelector, options = {}) {
    $(inputSelector).each(function () {
      const enableTimeAttr = $(this).attr("data-enable-time");
      const isEnableTime = enableTimeAttr !== "false";

      const defaultOptions = {
        mode: "single",
        enableTime: isEnableTime, // 開啟時間選擇
        time_24hr: true, // 使用 24 小時制
        dateFormat: isEnableTime ? "Y/m/d H:i" : "Y/m/d", // 日期 + 時間格式
        locale: "zh",
        allowInput: true, // 允許手動輸入
        closeOnInputExit: false, // 關閉自動關閉
        // enableSeconds: true, //開啟「秒」選擇
        plugins: [
          new confirmDatePlugin({
            confirmIcon: "<i class='fa fa-check'></i>",
            confirmText: "OK ",
            showAlways: true,
            theme: "light",
          }),
        ],
        ...options,
      };

      if (!this._flatpickr) {
        flatpickr(this, defaultOptions);
      }
    });
  }

  // 通用範圍驗證：給一對 start/end input，比對日期時間是否合理
  function validatePair($startInput, $endInput, $errorEl) {
    const startValue = ($startInput.val() || "").trim();
    const endValue = ($endInput.val() || "").trim();
    const both = $startInput.add($endInput);

    if (startValue && endValue) {
      // 將格式 "Y/m/d H:i" 轉換為可比較的時間
      const startDate = new Date(
        startValue.replace(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/, "$1-$2-$3T$4:$5"),
      );
      const endDate = new Date(
        endValue.replace(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+)/, "$1-$2-$3T$4:$5"),
      );

      if (startDate > endDate) {
        if ($errorEl && $errorEl.length) $errorEl.show();
        both.css("border-color", "#ff4d4f");
        return false;
      }
    }

    if ($errorEl && $errorEl.length) $errorEl.hide();
    both.css("border-color", "");
    return true;
  }

  // 確保 dual-inputs 之後有錯誤訊息容器；不存在時動態注入
  // 回傳給 validatePair 的 $errorEl（可能是既有的 #range-error 或新注入的 .suppl 包裝）
  function ensureRangeError($startInput, fallbackId) {
    if (fallbackId) {
      const $existing = $("#" + fallbackId);
      if ($existing.length) return $existing;
    }
    if (!$startInput.length) return $();
    const $container = $startInput.parent();
    let $wrap = $container.next(".suppl-range-error");
    if (!$wrap.length) {
      $wrap = $(
        '<div class="suppl suppl-range-error" style="display:none">' +
          '<span class="field-validation-error">請選擇正確的時間</span>' +
          "</div>",
      );
      $container.after($wrap);
    }
    return $wrap;
  }

  function validateDateRange() {
    const $start = $('input[name="range-start"]').first();
    const $end = $('input[name="range-end"]').first();
    return validatePair($start, $end, ensureRangeError($start, "range-error"));
  }

  function validateTxRange() {
    const $start = $(".tx-start-input");
    const $end = $(".tx-end-input");
    return validatePair($start, $end, ensureRangeError($start));
  }

  function validateDisplayRange() {
    const $start = $(".display-start-input");
    const $end = $(".display-end-input");
    return validatePair($start, $end, ensureRangeError($start));
  }

  // 初始化所有日期選擇器
  initDatePicker('input[name="range-start"]', {
    defaultHour: 0,
    defaultMinute: 0,
  });
  initDatePicker('input[name="range-end"]', {
    defaultHour: 23,
    defaultMinute: 59,
  });
  initDatePicker('input[name="single-date"]');

  // 交易時間 / 顯示時間 — 與活動時間相同行為（disabled 時不會開啟，啟用時點擊即可選日期）
  initDatePicker(".tx-start-input, .display-start-input", {
    defaultHour: 0,
    defaultMinute: 0,
  });
  initDatePicker(".tx-end-input, .display-end-input", {
    defaultHour: 23,
    defaultMinute: 59,
  });

  // 監聽日期選擇器的改變事件
  $(document).on(
    "change",
    'input[name="range-start"], input[name="range-end"]',
    function () {
      validateDateRange();
    },
  );
  $(document).on("change", ".tx-start-input, .tx-end-input", validateTxRange);
  $(document).on(
    "change",
    ".display-start-input, .display-end-input",
    validateDisplayRange,
  );

  // 監聽手動輸入的模糊事件
  $(document).on(
    "blur",
    'input[name="range-start"], input[name="range-end"]',
    function () {
      setTimeout(() => {
        validateDateRange();
      }, 100);
    },
  );
  $(document).on("blur", ".tx-start-input, .tx-end-input", function () {
    setTimeout(validateTxRange, 100);
  });
  $(document).on(
    "blur",
    ".display-start-input, .display-end-input",
    function () {
      setTimeout(validateDisplayRange, 100);
    },
  );

  // 日曆結束（使用 Flatpickr）

  // 開啟設定區間
  $(document).on("change", ".switch-calendar", function () {
    const field = $(this)
      .closest("label")
      .next(".switch-field")
      .find(".calendar");
    let isChecked = $(this).is(":checked");
    if (isChecked) {
      field.prop("disabled", false);
      // 重新初始化被禁用的日期選擇器
      field.each(function () {
        if (!this._flatpickr) {
          initDatePicker(this);
        } else {
          // 如果已經初始化，確保 Flatpickr 可以正常工作
          this._flatpickr.enable();
        }
      });
    } else {
      field.prop("disabled", true);
      // 禁用 Flatpickr
      field.each(function () {
        if (this._flatpickr) {
          this._flatpickr.disable();
        }
      });
    }
  });

  // ========== 時間同步邏輯（活動 / 交易 / 顯示）==========
  // 三組 dual inputs：
  //   - 活動時間：.event-start-input / .event-end-input（主時間，永遠可編輯）
  //   - 交易時間：.tx-start-input / .tx-end-input，受 .sync-tx-event-checkbox 控制
  //   - 顯示時間：.display-start-input / .display-end-input，受 .sync-display-event-checkbox 控制
  const $eventStart = $(".event-start-input");
  const $eventEnd = $(".event-end-input");
  const $txStart = $(".tx-start-input");
  const $txEnd = $(".tx-end-input");
  const $displayStart = $(".display-start-input");
  const $displayEnd = $(".display-end-input");

  // 將同步目標欄位的值設為與活動時間一致
  function syncFromEvent($targetStart, $targetEnd) {
    $targetStart
      .data("syncing", true)
      .val($eventStart.val())
      .trigger("change")
      .data("syncing", false);
    $targetEnd
      .data("syncing", true)
      .val($eventEnd.val())
      .trigger("change")
      .data("syncing", false);
  }

  // 切換目標欄位的禁用狀態與灰底樣式
  function setSyncedState($checkbox, $startInput, $endInput) {
    const isChecked = $checkbox.is(":checked");
    $startInput.add($endInput).prop("disabled", isChecked);
    $startInput.closest(".dual-inputs").toggleClass("is-disabled", isChecked);
    if (isChecked) {
      syncFromEvent($startInput, $endInput);
    }
  }

  // 初始化：依 checkbox 預設勾選狀態，套用 disabled / 同步值
  setSyncedState($(".sync-tx-event-checkbox"), $txStart, $txEnd);
  setSyncedState($(".sync-display-event-checkbox"), $displayStart, $displayEnd);

  // 同步 checkbox 切換
  $(document).on("change", ".sync-tx-event-checkbox", function () {
    setSyncedState($(this), $txStart, $txEnd);
  });
  $(document).on("change", ".sync-display-event-checkbox", function () {
    setSyncedState($(this), $displayStart, $displayEnd);
  });

  // 活動時間改動時，把值推到所有勾選了同步的欄位
  $eventStart.add($eventEnd).on("input change", function () {
    if ($(".sync-tx-event-checkbox").is(":checked")) {
      syncFromEvent($txStart, $txEnd);
    }
    if ($(".sync-display-event-checkbox").is(":checked")) {
      syncFromEvent($displayStart, $displayEnd);
    }
  });
});
