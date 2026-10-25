// progress-bar.js
// 右上角「檔案產出進度」浮動卡片，樣式見 scss/settings/_progress-bar.scss
// html 頁面需要引入 progress-bar.js（並確認已引入 toast-message.js）
//
// ▼ 這個元件在做什麼
//    按下「Email 寄出」後，後端要把列表內容打包成 excel。打包需要時間，
//    所以在畫面右上角顯示一張進度卡：檔名 + 百分比 + 進度條。
//    進度到 100% 時，百分比文字換成「完成」，同時跳出 toast（預設「已寄送」），
//    toast 與進度卡都在 5 秒後自動消失（可用 autoCloseDelay 調整）。
//
// ▼ 兩種用法
//    (A) 宣告式（靜態頁 / 切版展示用）
//        <button type="button" data-file-export="產出 Excel.xlsx">Email 寄出</button>
//        本檔會自動接管點擊，跑一段模擬進度。可用的屬性：
//          data-file-export                － 必填，顯示的檔名
//          data-file-export-message        － 完成時的 toast 文字（預設「已寄送」）
//          data-file-export-cancel-message － 取消時的 toast 文字（預設「已取消」）
//        ※ 這只是切版用的假進度，接後端時請改用 (B)。
//
//    (B) 程式式（實際接後端用）
//        const xhr = $.post('/api/export', payload);
//        const task = progressBar.start({ fileName: '產出 Excel.xlsx', xhr: xhr });
//        task.update(30);          // 後端回報進度時呼叫
//        task.update(100);         // 到 100% 會自動進入完成狀態並跳 toast
//        task.fail('產出失敗');    // 後端回報錯誤
//        task.cancel();            // 取消並收掉卡片（等同使用者按 X）
//        task.close();             // 只收掉卡片，不取消
//
//        進度來源（輪詢 / SSE / WebSocket）刻意不寫在這裡：
//        本檔只負責「顯示」，取得進度的方式由呼叫端決定，才不會綁死某一種後端介面。
//
// ▼ 關閉鈕（X）的兩種語意
//    進行中按 X ＝ 取消：abort 掉 options.xhr，呼叫 options.onCancel，
//                        跳出「已取消」toast，然後收掉卡片。
//    完成後按 X ＝ 單純關閉，不會跳 toast。
//    兩者以 finished 旗標區分，不會誤把已完成的任務當成取消。
//
//    注意 abort() 的極限：它只中止瀏覽器這端的等待，後端如果已經在打包 excel，
//    多半會繼續跑完並把信寄出去。要真的讓伺服器停手，請在 onCancel 裡打取消 API：
//        progressBar.start({
//          fileName: '產出 Excel.xlsx',
//          xhr: xhr,
//          onCancel: function () { $.post('/api/export/cancel', { taskId: id }); }
//        });
//
//    另一個容易踩到的點：abort() 會讓該次請求的 .fail() 被觸發
//    （textStatus === 'abort'），呼叫端的錯誤處理要略過這種情況，
//    否則使用者按了取消，畫面卻又跳出一個「產出失敗」。
//
// ▼ 注意事項（修改前請先看）
//    - 同時只顯示一張卡片。設計稿只有單張，且重複點按鈕時多張卡片會互相疊住；
//      因此 start() 會先收掉前一張。若日後要支援多檔並行，需改成陣列並處理堆疊位移。
//    - 卡片消失一律走 handle.close()（自動關閉、被新任務取代都是），關閉鈕則走
//      handle.cancel()，而 cancel() 最後也會呼叫 close()。因此 onClose 在任何
//      路徑下都一定會被呼叫到。外部若要包裝關閉行為，請改用 onClose，不要覆寫
//      handle.close —— 內部的關閉路徑不會經過被覆寫的那份。
//    - 被新任務取代時走的是 close() 而非 cancel()：那是「換一張卡片」，
//      不該把前一個任務當成使用者主動取消而去 abort 它。

(function () {
  const CARD_CLASS = "progress-card";
  // 進度到 100% 後，卡片與 toast 停留的時間
  const AUTO_CLOSE_DELAY = 5000;
  const DONE_TEXT = "完成";
  const DEFAULT_DONE_MESSAGE = "已寄送";
  const DEFAULT_CANCEL_MESSAGE = "已取消";
  // 卡片淡入 / 淡出時間
  const FADE_DURATION = 200;

  // 目前顯示中的卡片。同時只允許一張，見檔頭「注意事項」
  let activeTask = null;

  // 把任意輸入夾成 0~100 的整數。
  // 後端可能回傳字串、浮點數或超出範圍的值，統一在這裡收斂，
  // 後面的 render 就不必再各自防禦
  function normalizePercent(value) {
    const number = Math.round(Number(value));
    if (isNaN(number)) return 0;
    return Math.min(100, Math.max(0, number));
  }

  function buildCard() {
    // 用 <div> 包一層 track/fill，而不是原生 <progress>：
    // 原生元件的進度條樣式在各瀏覽器差異大，難以做到設計稿的圓角與配色
    return $(`
      <div class="${CARD_CLASS}" style="display:none;">
        <div class="${CARD_CLASS}__body">
          <div class="${CARD_CLASS}__title">
            <i class="material-symbols-outlined ${CARD_CLASS}__icon">forward_to_inbox</i>
            <span class="${CARD_CLASS}__name"></span>
            <span class="${CARD_CLASS}__percent">0%</span>
          </div>
          <div class="${CARD_CLASS}__track" role="progressbar"
               aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="${CARD_CLASS}__fill"></div>
          </div>
        </div>
        <button type="button" class="${CARD_CLASS}__close" aria-label="關閉">
          <i class="material-symbols-outlined">close</i>
        </button>
      </div>
    `).appendTo("body");
  }

  /**
   * 顯示一張進度卡，回傳可操作它的 handle。
   *
   * @param {Object}   options
   * @param {string}   options.fileName        顯示的檔名，例如「產出 Excel.xlsx」
   * @param {string}  [options.doneMessage]    完成時的 toast 文字，預設「已寄送」
   * @param {string}  [options.cancelMessage]  取消時的 toast 文字，預設「已取消」；
   *                                           傳入空字串或 null 可關閉這個提示
   * @param {number}  [options.autoCloseDelay] 完成後停留幾毫秒才收掉，預設 5000
   * @param {Object}  [options.xhr]            這次請求的 jqXHR。進行中按 X 會自動 abort()，
   *                                           呼叫端不必自己接 onCancel
   * @param {Function}[options.onCancel]       進行中按 X 的回呼。abort() 只斷得掉瀏覽器這端，
   *                                           要讓後端真的停下來請在這裡打取消 API
   * @param {Function}[options.onClose]        卡片收掉時的回呼，不論完成、失敗或取消都會呼叫，
   *                                           且同一張卡片只會呼叫一次（適合用來解鎖按鈕）
   * @returns {{update:Function, done:Function, fail:Function, cancel:Function, close:Function}}
   */
  function start(options) {
    const settings = $.extend(
      {
        fileName: "",
        doneMessage: DEFAULT_DONE_MESSAGE,
        cancelMessage: DEFAULT_CANCEL_MESSAGE,
        autoCloseDelay: AUTO_CLOSE_DELAY,
        xhr: null,
        onCancel: null,
        onClose: null,
      },
      options,
    );

    // 前一張還在就先收掉，維持畫面上只有一張卡片
    // （走 close() 所以前一張的 onClose 會被呼叫到，它的按鈕才會解鎖）
    if (activeTask) activeTask.close();

    const $card = buildCard();
    const $name = $card.find("." + CARD_CLASS + "__name");
    const $percent = $card.find("." + CARD_CLASS + "__percent");
    const $track = $card.find("." + CARD_CLASS + "__track");
    const $fill = $card.find("." + CARD_CLASS + "__fill");

    // 用 .text() 而非樣板字串插入：檔名可能來自後端，避免把 HTML 帶進 DOM
    $name.text(settings.fileName).attr("title", settings.fileName);

    let finished = false;
    let closed = false;
    let autoCloseTimer = null;

    function close() {
      if (closed) return;
      closed = true;
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (activeTask === handle) activeTask = null;
      $card.stop(true, true).fadeOut(FADE_DURATION, function () {
        $(this).remove();
      });
      // 在淡出動畫前就通知，讓呼叫端（例如解鎖按鈕）不必等 200ms。
      // closed 旗標保證只會呼叫一次
      if (typeof settings.onClose === "function") settings.onClose();
    }

    function update(value) {
      if (closed || finished) return;
      const percent = normalizePercent(value);
      $fill.css("width", percent + "%");
      $percent.text(percent + "%");
      $track.attr("aria-valuenow", percent);
      // 到 100% 就直接進完成狀態，呼叫端不必再多呼叫一次 done()
      if (percent >= 100) finish();
    }

    function finish() {
      if (closed || finished) return;
      finished = true;
      $fill.css("width", "100%");
      $track.attr("aria-valuenow", 100);
      // 百分比文字換成「完成」
      $percent.text(DONE_TEXT);

      // toast 與卡片用同一個秒數，兩者一起消失，畫面不會只剩半截資訊
      if (typeof toastMessage === "function") {
        toastMessage(settings.doneMessage, settings.autoCloseDelay);
      }
      autoCloseTimer = setTimeout(function () {
        handle.close();
      }, settings.autoCloseDelay);
    }

    function fail(message) {
      if (closed || finished) return;
      // 標記 finished，讓後續遲到的 update() 不會把失敗狀態蓋掉
      finished = true;
      $card.addClass("is-failed");
      $fill.css("width", "100%");
      $percent.text(message || "失敗");
      autoCloseTimer = setTimeout(function () {
        handle.close();
      }, settings.autoCloseDelay);
    }

    // 取消進行中的任務，然後收掉卡片。
    // 已經完成（或已關閉）時就只是單純關閉，不會誤觸取消。
    function cancel() {
      if (!finished && !closed) {
        // abort() 只斷得掉「瀏覽器這端的等待」，後端多半還在繼續打包，
        // 所以要讓伺服器真的停下來，仍得靠 onCancel 去打取消 API
        if (settings.xhr && typeof settings.xhr.abort === "function") {
          settings.xhr.abort();
        }
        if (typeof settings.onCancel === "function") settings.onCancel();
        // 取消原本是無聲的（卡片直接消失），補一個 toast 讓使用者確定真的取消了。
        // 這裡刻意不帶 autoCloseDelay：完成時的 5 秒是為了配合卡片一起停留，
        // 取消時卡片已經消失，用 toastMessage 預設的 2 秒即可，也與站上其他提示一致
        if (settings.cancelMessage && typeof toastMessage === "function") {
          toastMessage(settings.cancelMessage);
        }
      }
      close();
    }

    $card.find("." + CARD_CLASS + "__close").on("click", function () {
      // 一律走 handle.cancel()：它內部會判斷進行中才真的取消，
      // 完成後按 X 就只是關閉（見檔頭「注意事項」）
      handle.cancel();
    });

    const handle = {
      update: update,
      done: finish,
      fail: fail,
      cancel: cancel,
      close: close,
    };
    activeTask = handle;

    $card.fadeIn(FADE_DURATION);
    return handle;
  }

  // 切版展示用的假進度：從 0 平順推到 100。
  // 接後端時不要用這個，改成自己呼叫 start() 再用 update() 餵真實進度。
  function simulate(options) {
    let timer = null;
    const settings = $.extend({}, options);
    const callerOnClose = settings.onClose;

    // 掛在 onClose 上而不是覆寫 handle.close：使用者中途按關閉鈕時也要停掉計時器，
    // 否則計時器會繼續對已移除的 DOM 更新
    settings.onClose = function () {
      if (timer) clearInterval(timer);
      if (typeof callerOnClose === "function") callerOnClose();
    };

    const task = start(settings);
    let percent = 0;
    timer = setInterval(function () {
      // 每次遞增量刻意不固定，模擬後端回報的不規則節奏
      percent += Math.floor(Math.random() * 12) + 6;
      if (percent >= 100) {
        clearInterval(timer);
        task.update(100);
        return;
      }
      task.update(percent);
    }, 250);

    return task;
  }

  $(document).ready(function () {
    // 宣告式用法：[data-file-export] 的按鈕點了就跑模擬進度
    $(document).on("click", "[data-file-export]", function () {
      const $btn = $(this);
      // 進行中先鎖住按鈕，避免連點開出多個後端任務
      $btn.prop("disabled", true);

      simulate({
        fileName: $btn.attr("data-file-export"),
        doneMessage:
          $btn.attr("data-file-export-message") || DEFAULT_DONE_MESSAGE,
        cancelMessage:
          $btn.attr("data-file-export-cancel-message") ||
          DEFAULT_CANCEL_MESSAGE,
        // 完成、失敗、取消、被新任務取代都會走到這裡，按鈕一定解得開
        onClose: function () {
          $btn.prop("disabled", false);
        },
      });
    });
  });

  // 對外只暴露 start / simulate，內部狀態不開放，避免被外部改壞
  window.progressBar = { start: start, simulate: simulate };
})();
