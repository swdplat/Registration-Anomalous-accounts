// scroll-to-edge.js
// 在頁面右下角自動注入「至頂 / 至底」兩顆圓形按鈕。
// 任一 html 頁面只要引入此檔即可使用，不需在 html 內加任何標籤。
// 僅當頁面實際出現垂直捲軸時才顯示，視窗尺寸或 DOM 高度變化時自動更新；
// 接近頂部時隱藏「至頂」、接近底部時隱藏「至底」。
// 樣式請參考 scss/settings/_scroll-to-edge.scss。

(function () {
  // 最小容差：避免子像素誤差、margin 折疊、或 <main> 在 _base.scss
  // 中刻意保留的 padding-bottom 等「視覺上不算內容」的溢出觸發按鈕。
  // 若 <main> 的 padding-bottom 大於此值（例如 300px），改採用該值。
  var MIN_BUFFER = 100;
  // 判定「已在頂部」的距離容差（px）
  var EDGE_THRESHOLD = 8;

  function init() {
    if (document.querySelector(".scroll-to-edge")) return;

    var wrap = document.createElement("div");
    wrap.className = "scroll-to-edge";
    wrap.hidden = true;
    wrap.innerHTML =
      '<button type="button" class="scroll-to-edge__btn" data-scroll-edge="top" aria-label="回到頂部">' +
      '<span class="material-symbols-outlined">arrow_upward</span>' +
      "</button>" +
      '<button type="button" class="scroll-to-edge__btn" data-scroll-edge="bottom" aria-label="移至底部">' +
      '<span class="material-symbols-outlined">arrow_downward</span>' +
      "</button>";

    document.body.appendChild(wrap);

    var topBtn = wrap.querySelector('[data-scroll-edge="top"]');
    var bottomBtn = wrap.querySelector('[data-scroll-edge="bottom"]');

    wrap.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-scroll-edge]");
      if (!btn) return;
      var target =
        btn.getAttribute("data-scroll-edge") === "top"
          ? 0
          : document.documentElement.scrollHeight;
      window.scrollTo({ top: target, behavior: "smooth" });
    });

    function update() {
      var mainEl = document.querySelector("main");
      var buffer = MIN_BUFFER;
      if (mainEl) {
        var pb = parseFloat(getComputedStyle(mainEl).paddingBottom) || 0;
        if (pb > buffer) buffer = pb;
      }
      var docEl = document.documentElement;
      var scrollTop = window.scrollY || docEl.scrollTop;
      var clientHeight = docEl.clientHeight;
      var scrollHeight = docEl.scrollHeight;

      // 整個 wrap：實際內容溢出超過 buffer 才顯示
      var overflow = scrollHeight - clientHeight;
      wrap.hidden = overflow <= buffer;
      if (wrap.hidden) return;

      // 接近頂部 → 隱藏「至頂」
      topBtn.hidden = scrollTop <= EDGE_THRESHOLD;
      // 接近底部 → 隱藏「至底」；buffer 內視為已抵達實際內容底部
      var remaining = scrollHeight - clientHeight - scrollTop;
      bottomBtn.hidden = remaining <= buffer;
    }

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // 字體、CKEditor、pagination 等可能在 DOMContentLoaded 之後才完成排版，
    // load 事件再判斷一次，避免初始狀態誤判。
    window.addEventListener("load", update);

    // DOM 高度變化（折疊展開、動態新增列、tab 切換等）時重新判斷
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(update).observe(document.body);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
