// toast-message.js

// duration：停留幾毫秒後自動消失，不傳則沿用原本的 2000（既有呼叫端不受影響）。
// 進度卡（js/progress-bar.js）需要 5 秒，故開放這個參數。
function toastMessage (message, duration) {
    if ($('.toast-message').length > 0) {
        $('.toast-message').remove();
    }
    // 必須抓住「自己這一個節點」再交給 setTimeout。
    // 原本是在 setTimeout 裡用 $('.toast-message') 全域選取，等於「先出現的 toast
    // 的計時器，會把後出現的 toast 一起收掉」：例如頁面載入時跳出的提示，2 秒後
    // 會把使用者剛觸發、才顯示不到 1 秒的提示一併移除，看起來就像提示沒跳出來。
    // 開放 duration 之後更容易踩到（5 秒的提示被 2 秒的計時器提早殺掉）。
    const $toast = $(`<div class="toast-message" style="display:none;"><p>${message}</p></div>`);
    $('body').append($toast);
    $toast.fadeIn();
    setTimeout(function () {
        $toast.fadeOut(function () {
            $(this).remove();
        });
    }, duration || 2000);
}
