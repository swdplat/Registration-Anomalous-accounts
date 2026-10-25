// tooltip.js
// 統一管理兩種 tooltip：
// 1. 文字溢出提示 (.tooltip-trigger) — 內容被截斷時，hover 顯示完整文字
// 2. 資訊說明提示 ([data-tooltip])   — 任何元素只要有 data-tooltip 屬性即觸發
//    範例：<i class="material-symbols-outlined" data-tooltip="說明文字">info</i>
// 3. html頁面需要引入tooltip.js
//
// ▼ 兩種定位模式（由 data-tooltip-position 決定，互不干擾）
//    (A) 跟隨游標模式 — 未設定 data-tooltip-position，或設為 "cursor"
//        tooltip 顯示在游標下方略偏右，hover 期間持續跟隨游標。
//        不會加上方向 class，因此不會出現箭頭。適合表格內被截斷的文字。
//    (B) 錨定模式 — data-tooltip-position = top / bottom / left / right
//        tooltip 固定在觸發元素的指定方向，並加上對應 class
//        （tooltip-top / tooltip-bottom / tooltip-left / tooltip-right），
//        由 SCSS (_components.scss 的 .tooltip) 依 class 畫出指向觸發元素的箭頭。
//        適合 Help / info 這類位置固定的說明 icon。
//        屬性有值但不是合法方向時，fallback 為 right。
//        指定方向太靠近視窗邊緣（放不下）時，會自動翻到對面方向（right ↔ left、
//        top ↔ bottom），箭頭也跟著換邊。
//        範例：<i data-tooltip="說明文字" data-tooltip-position="top">Help</i>
//
//    兩種模式共用同一個 tooltip 元素，且座標一律以 viewport 座標寫入
//    （SCSS 為 position: fixed），因此不需要在模式之間切換 position。
//    如需新增方向或調整箭頭樣式，請同步維護本檔的 ANCHOR_POSITIONS /
//    OPPOSITE_POSITION / anchoredCoords() / fitsInViewport() 與
//    _components.scss 的 .tooltip-{方向}::before。
//
// ▼ 注意事項（修改前請先看）
//    - .tooltip 的 pointer-events: none 是必要的。跟隨游標模式下 tooltip 位於游標
//      下方，若它會接收滑鼠事件，游標就會「碰到」自己的 tooltip 而觸發觸發元素的
//      mouseleave → 隱藏 → 再顯示，造成無限閃爍。
//    - tooltip 尺寸只在 showTooltip() 量一次並快取，避免每次 mousemove 都讀取 layout。
//      若之後改成顯示期間會變動內容的 tooltip，記得重新量測。

(function () {
  const TOOLTIP_CLASS = "tooltip";

  // ---- 錨定模式 ----
  const ANCHOR_POSITIONS = ["top", "bottom", "left", "right"];
  // 指定方向放不下時要翻到的對面方向
  const OPPOSITE_POSITION = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  // 觸發元素與 tooltip 的間距。數值沿用原本的視覺效果：
  // top / bottom 讓 8px 箭頭壓在觸發元素邊緣上（間距 0）；
  // left / right 則在 8px 箭頭尖端外再留 6px（間距 14）。
  const ANCHOR_GAP_V = 0;
  const ANCHOR_GAP_H = 14;

  // ---- 跟隨游標模式 ----
  // 明確指定跟隨游標時可寫 data-tooltip-position="cursor"（與不寫等效）
  const CURSOR_POSITION = "cursor";
  // 游標與 tooltip 的間距
  const CURSOR_OFFSET_X = 12;
  const CURSOR_OFFSET_Y = 12;
  // tooltip 與視窗邊緣至少保留的距離
  const VIEWPORT_MARGIN = 8;
  // 下方空間不足而翻到游標上方後，需多出這個距離才翻回下方；
  // 避免游標在邊界附近微幅移動時，tooltip 上下反覆跳動
  const FLIP_HYSTERESIS = 24;

  // 單一 tooltip 實例，重複使用；避免每次 hover 都新建/移除 DOM，
  // 造成快速掃過多個元素時 fadeIn/fadeOut 互相打斷而殘留或閃爍
  let $tooltip = null;
  let tooltipW = 0;
  let tooltipH = 0;
  // 錨定模式：記住觸發元素與方向，捲動時要重新定位
  let anchorEl = null;
  let anchorPosition = null;
  // 跟隨游標模式：目前是否翻到游標上方
  let flipped = false;

  function ensureTooltip() {
    if ($tooltip) return $tooltip;
    $tooltip = $(
      `<div class="${TOOLTIP_CLASS}" style="display:none"></div>`,
    ).appendTo("body");
    return $tooltip;
  }

  // 解析 data-tooltip-position
  // 回傳 null 代表跟隨游標模式；回傳方向字串代表錨定模式
  function resolvePosition(element) {
    const raw = ($(element).attr("data-tooltip-position") || "")
      .toLowerCase()
      .trim();
    if (!raw || raw === CURSOR_POSITION) return null;
    return ANCHOR_POSITIONS.indexOf(raw) >= 0 ? raw : "right";
  }

  // 錨定模式：計算 tooltip 放在觸發元素某個方向時的 viewport 座標
  function anchoredCoords(rect, position) {
    let top;
    let left;
    switch (position) {
      case "top":
        top = rect.top - tooltipH - ANCHOR_GAP_V;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "bottom":
        top = rect.bottom + ANCHOR_GAP_V;
        left = rect.left + rect.width / 2 - tooltipW / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.left - tooltipW - ANCHOR_GAP_H;
        break;
      case "right":
      default:
        top = rect.top + rect.height / 2 - tooltipH / 2;
        left = rect.right + ANCHOR_GAP_H;
        break;
    }
    return { top: top, left: left };
  }

  // 錨定模式：tooltip 在該方向上是否完整落在視窗內（含 VIEWPORT_MARGIN）
  // 只檢查方向所在的主軸，例如 top 只看上緣、right 只看右緣
  function fitsInViewport(coords, position) {
    switch (position) {
      case "top":
        return coords.top >= VIEWPORT_MARGIN;
      case "bottom":
        return coords.top + tooltipH <= $(window).height() - VIEWPORT_MARGIN;
      case "left":
        return coords.left >= VIEWPORT_MARGIN;
      case "right":
      default:
        return coords.left + tooltipW <= $(window).width() - VIEWPORT_MARGIN;
    }
  }

  // 錨定模式：把 tooltip 放在觸發元素的指定方向
  // 用 getBoundingClientRect() 取 viewport 座標，對應 CSS 的 position: fixed
  function positionAnchored() {
    if (!$tooltip || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();

    // 指定方向超出視窗、而對面放得下時，自動翻到對面（right ↔ left、top ↔ bottom）；
    // 兩邊都放不下則維持指定方向。捲動時會重新判斷，因此也可能翻回原方向。
    let position = anchorPosition;
    let coords = anchoredCoords(rect, position);
    if (!fitsInViewport(coords, position)) {
      const opposite = OPPOSITE_POSITION[position];
      const oppositeCoords = anchoredCoords(rect, opposite);
      if (fitsInViewport(oppositeCoords, opposite)) {
        position = opposite;
        coords = oppositeCoords;
      }
    }

    // 方向 class 決定箭頭朝向，翻面時要一起換；值沒變就不寫，避免捲動時重複觸發 style 重算
    const classNames = `${TOOLTIP_CLASS} ${TOOLTIP_CLASS}-${position}`;
    if ($tooltip.attr("class") !== classNames) $tooltip.attr("class", classNames);

    // 錨定模式刻意不在另一軸夾進視窗內：夾了會讓箭頭指不到觸發元素。
    $tooltip.css({ top: coords.top + "px", left: coords.left + "px" });
  }

  // 跟隨游標模式：依游標位置更新 tooltip 座標
  function moveTooltip(e) {
    if (!$tooltip) return;
    const winW = $(window).width();
    const winH = $(window).height();

    // 垂直：預設在游標下方，下方空間不足時翻到上方（含 hysteresis）
    const roomBelow = winH - e.clientY - CURSOR_OFFSET_Y - VIEWPORT_MARGIN;
    if (!flipped && roomBelow < tooltipH) {
      flipped = true;
    } else if (flipped && roomBelow > tooltipH + FLIP_HYSTERESIS) {
      flipped = false;
    }
    let top = flipped
      ? e.clientY - tooltipH - CURSOR_OFFSET_Y
      : e.clientY + CURSOR_OFFSET_Y;
    // 翻到上方後若仍超出視窗，夾在視窗內
    top = Math.min(top, winH - tooltipH - VIEWPORT_MARGIN);
    top = Math.max(VIEWPORT_MARGIN, top);

    // 水平：貼齊游標右側，超出右緣時往左夾（位移連續，不會跳動）
    let left = e.clientX + CURSOR_OFFSET_X;
    left = Math.min(left, winW - tooltipW - VIEWPORT_MARGIN);
    left = Math.max(VIEWPORT_MARGIN, left);

    $tooltip.css({ top: top + "px", left: left + "px" });
  }

  // 顯示 tooltip
  // element：觸發元素；message：HTML 字串；e：mouseenter 事件（跟隨游標模式取初始座標）
  function showTooltip(element, message, e) {
    if (!message) return;

    const $tt = ensureTooltip();
    const position = resolvePosition(element);

    // 每次重設 class：方向 class 只在錨定模式加上，
    // 跟隨游標模式沒有方向 class，SCSS 的 ::before 箭頭自然不會出現
    const classNames = position
      ? `${TOOLTIP_CLASS} ${TOOLTIP_CLASS}-${position}`
      : TOOLTIP_CLASS;

    // 先以 opacity:0 顯示，才能量到尺寸（display:none 量不到），量完再定位、淡入
    $tt
      .stop(true, true)
      .attr("class", classNames)
      .html(`<p>${message}</p>`)
      .css({ display: "block", opacity: 0, top: 0, left: -9999 });
    tooltipW = $tt.outerWidth();
    tooltipH = $tt.outerHeight();

    // 先清掉另一個模式的監聽，避免兩種模式互相搶著改座標
    detachListeners();

    if (position) {
      anchorEl = element;
      anchorPosition = position;
      positionAnchored();
      // 捲動時要跟著觸發元素重新定位。
      // 用 capture 才收得到內層捲動容器（例如表格 wrapper）的 scroll，它不會冒泡到 window
      window.addEventListener("scroll", positionAnchored, {
        capture: true,
        passive: true,
      });
    } else {
      flipped = false;
      moveTooltip(e);
      $(document).on("mousemove.tooltipFollow", moveTooltip);
    }

    $tt.fadeTo(150, 1);
  }

  // 解除兩種模式的監聽並清掉錨定狀態
  // 巢狀觸發元素（例如 .tooltip-trigger 內又有 [data-tooltip] 圖示）可能連續觸發
  // 兩次 mouseenter，showTooltip() 每次都先呼叫這裡，避免重複綁定
  function detachListeners() {
    $(document).off("mousemove.tooltipFollow");
    window.removeEventListener("scroll", positionAnchored, { capture: true });
    anchorEl = null;
    anchorPosition = null;
  }

  function hideTooltip() {
    detachListeners();
    if (!$tooltip) return;
    $tooltip.stop(true, true).fadeOut(150);
  }

  $(document).ready(function () {
    // (1) 文字溢出提示：僅在內容被截斷時才顯示，文字取自元素本身
    //     若元素同時有 data-tooltip 屬性，優先用 data-tooltip（不用截斷檢查）
    $(document).on("mouseenter", ".tooltip-trigger", function (e) {
      const explicit = $(this).attr("data-tooltip");
      if (explicit) {
        showTooltip(this, explicit.replace(/\n/g, "<br>"), e);
        return;
      }
      if (this.scrollWidth <= this.clientWidth) return;
      showTooltip(this, $(this).text().trim(), e);
    });
    $(document).on("mouseleave", ".tooltip-trigger", hideTooltip);

    // (2) 資訊說明提示：任何帶 data-tooltip 屬性的元素皆可觸發
    //     若同時有 .tooltip-trigger，會由上面那組接管，不會重複綁定
    $(document).on(
      "mouseenter",
      "[data-tooltip]:not(.tooltip-trigger)",
      function (e) {
        const message = $(this).attr("data-tooltip");
        if (!message) return;
        showTooltip(this, message.replace(/\n/g, "<br>"), e);
      },
    );
    $(document).on(
      "mouseleave",
      "[data-tooltip]:not(.tooltip-trigger)",
      hideTooltip,
    );
  });
})();
