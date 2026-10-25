// 時間軸視覺化預覽
// 讀取 $.AdvancedTimeState + 三組起訖 input → 計算實際生效區段 → 渲染
// 座標範圍：顯示時間優先 → fallback 活動 → fallback 交易
// Bar 疊圖法：一般時間(淡) + 進階時間後實際生效(深)

(function ($) {
  if ($.TimeAxis) return;

  // ========== 常數 ==========
  const COLS = [
    {
      key: "event",
      label: "活動時間",
      startCls: "event-start-input",
      endCls: "event-end-input",
    },
    {
      key: "tx",
      label: "交易時間",
      startCls: "tx-start-input",
      endCls: "tx-end-input",
    },
    {
      key: "display",
      label: "顯示時間",
      startCls: "display-start-input",
      endCls: "display-end-input",
    },
  ];
  const WEEKDAY_INDEX = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  const WEEKDAY_LABEL = {
    0: "日",
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
  };

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const MS_PER_HOUR = 60 * 60 * 1000;
  const MS_PER_MIN = 60 * 1000;

  // 縮放：1.0 = Fit；按一次 + 是 *1.5
  let zoomLevel = 1;
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 50;
  const ZOOM_STEP = 1.5;

  let rafId = null;
  let debounceTimer = null;

  // hover / 衝突偵測共用：render 時更新
  let currentCoord = null;
  let currentPxPerMs = 0;

  // ========== 工具：時間解析 ==========
  function parseDateTime(str) {
    if (!str) return null;
    const s = String(str).trim();
    // 接受 Y/m/d 與 Y/m/d H:i (m)，全部用同一個 regex
    const m = s.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
    );
    if (!m) return null;
    const d = new Date(
      +m[1],
      +m[2] - 1,
      +m[3],
      +(m[4] || 0),
      +(m[5] || 0),
      +(m[6] || 0),
    );
    return isNaN(d.getTime()) ? null : d;
  }

  function parseHM(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1],
      min = +m[2];
    if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
    return { h: h, m: min };
  }

  function fmtDate(d) {
    return (
      d.getFullYear() + "/" + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate())
    );
  }
  function fmtDateTime(d) {
    return fmtDate(d) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ========== state 正規化 ==========
  // 對外 state 可能被 console 改壞，所有讀取都先 normalize
  function normalizeColState(s) {
    s = s || {};
    const wk = s.weekdays || {};
    const tm = s.times || {};
    const dt = s.dates || {};
    return {
      relation: s.relation || "寬鬆對比",
      weekdays: { enabled: !!wk.enabled, days: wk.days || {} },
      times: {
        enabled: !!tm.enabled,
        rows: Array.isArray(tm.rows) ? tm.rows : [],
      },
      dates: {
        enabled: !!dt.enabled,
        rows: Array.isArray(dt.rows) ? dt.rows : [],
      },
    };
  }

  // ========== 取得三欄一般時間範圍 ==========
  function getColBaseRange(colKey) {
    const col = COLS.find((c) => c.key === colKey);
    if (!col) return null;
    const start = parseDateTime($("." + col.startCls).val());
    const end = parseDateTime($("." + col.endCls).val());
    if (!start || !end || end <= start) return null;
    return { start, end };
  }

  // 取得測試時間範圍（僅在「指定測試生效時間」checkbox 啟用時回傳）
  function getTestRange() {
    const enabled = $(".switch-calendar").is(":checked");
    if (!enabled) return null;
    const start = parseDateTime($(".test-start-input").val());
    const end = parseDateTime($(".test-end-input").val());
    if (!start || !end || end <= start) return null;
    return { start: start, end: end };
  }

  // 是否任何 input 有填值（用於區分 noInput vs invalidRange）
  function hasAnyInputValue() {
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      const sv = ($("." + col.startCls).val() || "").trim();
      const ev = ($("." + col.endCls).val() || "").trim();
      if (sv || ev) return true;
    }
    return false;
  }

  // 座標範圍：綜合三欄最大覆蓋（min(starts) ~ max(ends)），確保每條 bar 都能顯示
  function getCoordRange() {
    const ranges = ["event", "tx", "display"]
      .map(getColBaseRange)
      .filter(Boolean);
    if (ranges.length === 0) return null;
    const start = new Date(
      Math.min.apply(
        null,
        ranges.map((r) => r.start.getTime()),
      ),
    );
    const end = new Date(
      Math.max.apply(
        null,
        ranges.map((r) => r.end.getTime()),
      ),
    );
    return { start: start, end: end };
  }

  // ========== 進階篩選計算 ==========
  // segment 結構：{ start, end, srcTimes: Set<idx>, srcDates: Set<idx> }
  // srcTimes / srcDates 標示這段是哪些 row 產生的，給 tooltip 顯示具體段 + 雙向 highlight 用
  function makeSeg(start, end, srcTimes, srcDates) {
    return {
      start: start,
      end: end,
      srcTimes: srcTimes ? new Set(srcTimes) : new Set(),
      srcDates: srcDates ? new Set(srcDates) : new Set(),
    };
  }

  function computeEffective(colKey, base) {
    const raw = ($.AdvancedTimeState && $.AdvancedTimeState[colKey]) || null;
    const state = normalizeColState(raw);

    const enabled =
      $(
        '.advanced-time-panel[data-col="' +
          colKey +
          '"] input.advanced-toggle[value="enabled"]:checked, .advanced-time-panel[data-col="' +
          colKey +
          '"] input.switch-advanced-toggle:checked',
      ).length > 0;
    if (!enabled) return [makeSeg(new Date(base.start), new Date(base.end))];

    let segments = [makeSeg(new Date(base.start), new Date(base.end))];

    // 「同區間」模式（僅 tx）：tx 自動對齊活動的 weekdays + dates 篩選，
    // 確保時間軸視覺上 tx effective 跟活動同日期分布。tx 自己的 times 仍套用。
    const isSameInterval = colKey === "tx" && state.relation === "同區間";
    let weekdaysSrc = state;
    let datesSrc = state;
    if (isSameInterval) {
      const eventRaw =
        ($.AdvancedTimeState && $.AdvancedTimeState["event"]) || null;
      const eventState = normalizeColState(eventRaw);
      const eventEnabled =
        $(
          '.advanced-time-panel[data-col="event"] input.advanced-toggle[value="enabled"]:checked, .advanced-time-panel[data-col="event"] input.switch-advanced-toggle:checked',
        ).length > 0;
      if (eventEnabled) {
        weekdaysSrc = eventState;
        datesSrc = eventState;
      }
    }

    if (weekdaysSrc.weekdays.enabled) {
      const days = weekdaysSrc.weekdays.days;
      const allowedSet = new Set();
      Object.keys(days).forEach((k) => {
        if (days[k]) allowedSet.add(WEEKDAY_INDEX[k]);
      });
      if (allowedSet.size > 0) {
        segments = applyWeekdayFilter(segments, allowedSet);
      }
    }

    if (state.times.enabled) {
      const ranges = state.times.rows
        .map((r, idx) => ({
          idx,
          start: parseHM(r.start),
          end: parseHM(r.end),
        }))
        .filter((r) => r.start && r.end);
      if (ranges.length > 0) {
        segments = applyTimeOfDayFilter(segments, ranges);
      }
    }

    if (datesSrc.dates.enabled) {
      const ranges = datesSrc.dates.rows
        .map((r, idx) => ({
          idx,
          start: parseDateTime(r.start),
          end: parseDateTime(r.end),
        }))
        .filter((r) => r.start && r.end)
        .map((r) => ({
          idx: r.idx,
          start: startOfDay(r.start),
          end: new Date(
            r.end.getFullYear(),
            r.end.getMonth(),
            r.end.getDate() + 1,
            0,
            0,
            0,
          ),
        }));
      if (ranges.length > 0) {
        segments = applyDateRangeFilter(segments, ranges);
      }
    }

    return segments.filter((s) => s.end > s.start);
  }

  // weekdays 不對應 row（一個整體開關），不追 src
  function applyWeekdayFilter(segments, allowedSet) {
    const result = [];
    segments.forEach((seg) => {
      let cursor = startOfDay(seg.start);
      let runStart = null;
      while (cursor <= seg.end) {
        const day = cursor.getDay();
        const next = new Date(cursor.getTime() + MS_PER_DAY);
        if (allowedSet.has(day)) {
          if (!runStart)
            runStart = new Date(
              Math.max(cursor.getTime(), seg.start.getTime()),
            );
        } else if (runStart) {
          const runEnd = new Date(
            Math.min(cursor.getTime(), seg.end.getTime()),
          );
          if (runEnd > runStart)
            result.push(makeSeg(runStart, runEnd, seg.srcTimes, seg.srcDates));
          runStart = null;
        }
        cursor = next;
      }
      if (runStart) {
        result.push(
          makeSeg(runStart, new Date(seg.end), seg.srcTimes, seg.srcDates),
        );
      }
    });
    return mergeSegments(result);
  }

  function applyTimeOfDayFilter(segments, ranges) {
    const result = [];
    segments.forEach((seg) => {
      let cursor = startOfDay(seg.start);
      while (cursor <= seg.end) {
        ranges.forEach((rng) => {
          const dayStart = new Date(cursor);
          dayStart.setHours(rng.start.h, rng.start.m, 0, 0);
          const dayEnd = new Date(cursor);
          dayEnd.setHours(rng.end.h, rng.end.m, 0, 0);
          const s = new Date(Math.max(dayStart.getTime(), seg.start.getTime()));
          const e = new Date(Math.min(dayEnd.getTime(), seg.end.getTime()));
          if (e > s) {
            const newSrcTimes = new Set(seg.srcTimes);
            newSrcTimes.add(rng.idx);
            result.push(makeSeg(s, e, newSrcTimes, seg.srcDates));
          }
        });
        cursor = new Date(cursor.getTime() + MS_PER_DAY);
      }
    });
    return mergeSegments(result);
  }

  function applyDateRangeFilter(segments, ranges) {
    const result = [];
    segments.forEach((seg) => {
      ranges.forEach((rng) => {
        const s = new Date(Math.max(rng.start.getTime(), seg.start.getTime()));
        const e = new Date(Math.min(rng.end.getTime(), seg.end.getTime()));
        if (e > s) {
          const newSrcDates = new Set(seg.srcDates);
          newSrcDates.add(rng.idx);
          result.push(makeSeg(s, e, seg.srcTimes, newSrcDates));
        }
      });
    });
    return mergeSegments(result);
  }

  // 合併重疊 segments，src 取聯集
  function mergeSegments(segments) {
    if (segments.length <= 1) return segments;
    const sorted = segments.slice().sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur.start <= last.end) {
        if (cur.end > last.end) last.end = cur.end;
        if (cur.srcTimes) cur.srcTimes.forEach((v) => last.srcTimes.add(v));
        if (cur.srcDates) cur.srcDates.forEach((v) => last.srcDates.add(v));
      } else {
        merged.push(cur);
      }
    }
    return merged;
  }

  // ========== Tooltip 來源描述 ==========
  // 用 segment 自身的 srcTimes / srcDates 顯示「這段是哪幾個 row 產生的」具體段
  function describeSourceForSegment(colKey, seg) {
    const raw = ($.AdvancedTimeState && $.AdvancedTimeState[colKey]) || null;
    const state = normalizeColState(raw);
    const parts = [];
    if (state.weekdays.enabled) {
      const ds = Object.keys(state.weekdays.days)
        .filter((k) => state.weekdays.days[k])
        .map((k) => "週" + WEEKDAY_LABEL[WEEKDAY_INDEX[k]]);
      if (ds.length) parts.push("週間：" + ds.join("、"));
    }
    if (seg && seg.srcTimes && seg.srcTimes.size > 0) {
      const labels = [...seg.srcTimes]
        .sort((a, b) => a - b)
        .map((idx) => state.times.rows[idx])
        .filter((r) => r && r.start && r.end)
        .map((r) => r.start + "-" + r.end);
      if (labels.length) parts.push("時段：" + labels.join("、"));
    }
    if (seg && seg.srcDates && seg.srcDates.size > 0) {
      const labels = [...seg.srcDates]
        .sort((a, b) => a - b)
        .map((idx) => state.dates.rows[idx])
        .filter((r) => r && r.start && r.end)
        .map((r) => r.start + "～" + r.end);
      if (labels.length) parts.push("日期：" + labels.join("、"));
    }
    if (colKey === "tx" && state.relation)
      parts.push("對比：" + state.relation);
    return parts.join(" / ");
  }

  // 更新「指定測試生效時間」下方 inline 錯誤訊息（跟其他表單欄位一致的 .suppl > .field-validation-error 模式）
  function updateTestInlineError() {
    const bar = document.querySelector(".suppl-test-range-error");
    if (!bar) return;
    const errTextEl = bar.querySelector(".field-validation-error");
    const $startInput = $(".test-start-input");
    const $endInput = $(".test-end-input");
    const $bothInputs = $startInput.add($endInput);

    function hide() {
      bar.setAttribute("hidden", "");
      $bothInputs.css("border-color", "");
    }
    function show(message) {
      bar.removeAttribute("hidden");
      if (errTextEl) errTextEl.textContent = message;
      $bothInputs.css("border-color", "#ff4d4f");
    }

    const enabled = $(".switch-calendar").is(":checked");
    if (!enabled) {
      hide();
      return;
    }

    const startVal = ($startInput.val() || "").trim();
    const endVal = ($endInput.val() || "").trim();
    if (!startVal || !endVal) {
      hide();
      return;
    }

    const startD = parseDateTime(startVal);
    const endD = parseDateTime(endVal);
    // 開始/結束時間關係檢查
    if (startD && endD && endD <= startD) {
      show("結束時間需晚於開始時間");
      return;
    }
    if (!startD || !endD) {
      hide();
      return;
    }

    const baseE = getColBaseRange("event");
    const baseD = getColBaseRange("display");
    const violations = [];
    if (baseE && endD > baseE.start) violations.push("活動時間");
    if (baseD && endD > baseD.start) violations.push("顯示時間");
    if (violations.length === 0) {
      hide();
      return;
    }
    show("測試時間應完全早於" + violations.join("、"));
  }

  // ========== 渲染 ==========
  function render() {
    const $root = $(".time-axis-preview");
    if (!$root.length) return;

    const $scroll = $root.find(".time-axis-scroll");
    const $empty = $root.find(".time-axis-empty");
    const coord = getCoordRange();

    if (!coord) {
      $scroll.hide();
      $empty
        .text(
          hasAnyInputValue()
            ? "目前的時間區間無效（結束需晚於開始），請檢查上方欄位"
            : "先在上方填入活動、交易或顯示時間，下方會自動產生時間軸",
        )
        .show();
      currentCoord = null;
      currentPxPerMs = 0;
      renderConflicts([]);
      renderEmptyNotices();
      updateTestInlineError();
      updateZoomButtons();
      return;
    }
    $empty.hide();
    $scroll.show();

    const containerWidth = $scroll.innerWidth() - 24;
    const trackUsableWidth = Math.max(100, containerWidth - 72);
    const rangeMs = coord.end - coord.start;

    const pxPerMs = (trackUsableWidth / rangeMs) * zoomLevel;
    const trackWidth = 72 + rangeMs * pxPerMs;
    currentCoord = coord;
    currentPxPerMs = pxPerMs;

    const $track = $root.find(".time-axis-track");
    $track.css("width", trackWidth + "px");

    renderScale($track[0], coord, pxPerMs);
    COLS.forEach((col) => renderRow($track[0], col, coord, pxPerMs));

    // 衝突偵測：基本範圍包含關係 + 進階 rows 重疊
    renderConflicts(detectConflicts());

    // 進階篩選空集合警示橫條
    renderEmptyNotices();

    // 測試時間 inline 錯誤訊息（在 input 下方）
    updateTestInlineError();

    updateZoomButtons();
    updateOverflowState();
  }

  // 滾動容器邊緣漸層遮罩：依 scrollLeft 切換 .is-overflow-left / .is-overflow-right
  function updateOverflowState() {
    const wrap = document.querySelector(".time-axis-scroll-wrap");
    if (!wrap) return;
    const scroll = wrap.querySelector(".time-axis-scroll");
    if (!scroll) return;
    const left = scroll.scrollLeft;
    const max = scroll.scrollWidth - scroll.clientWidth;
    wrap.classList.toggle("is-overflow-left", left > 1);
    wrap.classList.toggle("is-overflow-right", max > 0 && left < max - 1);
  }

  function renderScale(trackEl, coord, pxPerMs) {
    const scaleEl = trackEl.querySelector(".time-axis-scale");
    scaleEl.textContent = "";
    const rangeMs = coord.end - coord.start;
    const trackUsableWidth = rangeMs * pxPerMs;
    const granularity = pickGranularity(rangeMs, trackUsableWidth);
    const ticks = generateTicks(coord, granularity);

    const frag = document.createDocumentFragment();
    ticks.forEach((t) => {
      const left = (t.time.getTime() - coord.start.getTime()) * pxPerMs;
      const tick = document.createElement("div");
      tick.className = "time-axis-tick" + (t.isMajor ? " is-major" : "");
      tick.style.left = left + "px";
      const lbl = document.createElement("span");
      lbl.className = "time-axis-tick-label";
      lbl.textContent = t.label;
      tick.appendChild(lbl);
      frag.appendChild(tick);
    });
    scaleEl.appendChild(frag);
  }

  function pickGranularity(rangeMs, trackWidthPx) {
    const days = rangeMs / MS_PER_DAY;
    if (days > 90) return "month";
    if (days > 30) return "week";
    if (days > 7) return "day";
    if (days > 1) return "hour6";
    if (rangeMs > MS_PER_HOUR * 6) return "hour";
    return "minute15";
  }

  function generateTicks(coord, granularity) {
    const ticks = [];
    const start = coord.start;
    const end = coord.end;

    if (granularity === "month") {
      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      if (cursor < start)
        cursor = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      while (cursor <= end) {
        ticks.push({
          time: new Date(cursor),
          label:
            (cursor.getMonth() === 0 ? cursor.getFullYear() + "/" : "") +
            (cursor.getMonth() + 1) +
            "月",
          isMajor: cursor.getMonth() === 0,
        });
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }
    } else if (granularity === "week") {
      let cursor = startOfDay(new Date(start));
      while (cursor <= end) {
        ticks.push({
          time: new Date(cursor),
          label: cursor.getMonth() + 1 + "/" + cursor.getDate(),
          isMajor: cursor.getDay() === 1,
        });
        cursor = new Date(cursor.getTime() + 7 * MS_PER_DAY);
      }
    } else if (granularity === "day") {
      let cursor = startOfDay(start);
      while (cursor <= end) {
        ticks.push({
          time: new Date(cursor),
          label: cursor.getMonth() + 1 + "/" + cursor.getDate(),
          isMajor: cursor.getDay() === 1,
        });
        cursor = new Date(cursor.getTime() + MS_PER_DAY);
      }
    } else if (granularity === "hour6") {
      let cursor = startOfDay(start);
      while (cursor <= end) {
        for (let h = 0; h < 24; h += 6) {
          const t = new Date(cursor);
          t.setHours(h);
          if (t < start || t > end) continue;
          ticks.push({
            time: t,
            label:
              h === 0 ? t.getMonth() + 1 + "/" + t.getDate() : pad2(h) + ":00",
            isMajor: h === 0,
          });
        }
        cursor = new Date(cursor.getTime() + MS_PER_DAY);
      }
    } else if (granularity === "hour") {
      let cursor = new Date(start);
      cursor.setMinutes(0, 0, 0);
      if (cursor < start) cursor = new Date(cursor.getTime() + MS_PER_HOUR);
      while (cursor <= end) {
        ticks.push({
          time: new Date(cursor),
          label: pad2(cursor.getHours()) + ":00",
          isMajor: cursor.getHours() === 0,
        });
        cursor = new Date(cursor.getTime() + MS_PER_HOUR);
      }
    } else {
      // minute15
      let cursor = new Date(start);
      cursor.setSeconds(0, 0);
      const m = cursor.getMinutes();
      cursor.setMinutes(Math.ceil(m / 15) * 15);
      while (cursor <= end) {
        ticks.push({
          time: new Date(cursor),
          label: pad2(cursor.getHours()) + ":" + pad2(cursor.getMinutes()),
          isMajor: cursor.getMinutes() === 0,
        });
        cursor = new Date(cursor.getTime() + 15 * MS_PER_MIN);
      }
    }
    return ticks;
  }

  function renderRow(trackEl, col, coord, pxPerMs) {
    const rowTrack = trackEl.querySelector(
      '.time-axis-row[data-col="' + col.key + '"] .time-axis-row-track',
    );
    if (!rowTrack) return;
    rowTrack.textContent = "";

    const base = getColBaseRange(col.key);
    if (!base) return;

    const frag = document.createDocumentFragment();

    // 1) 一般時間段（淡）
    const baseSeg = clipToCoord(base, coord);
    if (baseSeg) {
      frag.appendChild(
        buildSegment(baseSeg, coord, pxPerMs, "base", col, base),
      );
    }

    // 2) 進階時間段（深）— 空集合不在 row 內標，改由 renderEmptyNotices 統一在底部橫條顯示
    const enabled =
      $(
        '.advanced-time-panel[data-col="' +
          col.key +
          '"] input.advanced-toggle[value="enabled"]:checked, .advanced-time-panel[data-col="' +
          col.key +
          '"] input.switch-advanced-toggle:checked',
      ).length > 0;
    if (enabled) {
      const effective = computeEffective(col.key, base);
      effective.forEach((seg) => {
        const clipped = clipToCoord(seg, coord);
        if (clipped) {
          frag.appendChild(
            buildSegment(clipped, coord, pxPerMs, "effective", col, base),
          );
        }
      });
    }
    rowTrack.appendChild(frag);
  }

  // 進階篩選 effective=[] → 統一在時間軸下方獨立橫條顯示警示
  function renderEmptyNotices() {
    const root = document.querySelector(".time-axis-preview");
    if (!root) return;
    const bar = root.querySelector(".time-axis-empty-notice-bar");
    if (!bar) return;

    const emptyLabels = [];
    COLS.forEach((c) => {
      const base = getColBaseRange(c.key);
      if (!base) return;
      const enabled =
        $(
          '.advanced-time-panel[data-col="' +
            c.key +
            '"] input.advanced-toggle[value="enabled"]:checked, .advanced-time-panel[data-col="' +
            c.key +
            '"] input.switch-advanced-toggle:checked',
        ).length > 0;
      if (!enabled) return;
      const effective = computeEffective(c.key, base);
      if (effective.length === 0) emptyLabels.push(c.label);
    });

    if (emptyLabels.length === 0) {
      bar.setAttribute("hidden", "");
      return;
    }
    bar.removeAttribute("hidden");
    const text = bar.querySelector(".time-axis-empty-notice-text");
    if (text) {
      text.textContent =
        emptyLabels.join("、") +
        "：進階篩選後無生效時段（請檢查週間/時段/日期設定）";
    }
  }

  function clipToCoord(seg, coord) {
    const s = new Date(Math.max(seg.start.getTime(), coord.start.getTime()));
    const e = new Date(Math.min(seg.end.getTime(), coord.end.getTime()));
    if (e <= s) return null;
    // 保留 src（給 effective segment 用），base seg 沒 src 也沒關係
    return {
      start: s,
      end: e,
      srcTimes: seg.srcTimes || new Set(),
      srcDates: seg.srcDates || new Set(),
    };
  }

  function buildSegment(seg, coord, pxPerMs, kind, col) {
    const left = (seg.start.getTime() - coord.start.getTime()) * pxPerMs;
    const width = (seg.end.getTime() - seg.start.getTime()) * pxPerMs;
    const el = document.createElement("div");
    el.className = "time-axis-segment";
    el.setAttribute("data-kind", kind);
    el.setAttribute("data-col", col.key);
    el.style.left = left + "px";
    el.style.width = Math.max(width, 2) + "px";

    el.dataset.startMs = String(seg.start.getTime());
    el.dataset.endMs = String(seg.end.getTime());

    const isAdv = kind === "effective";
    el.dataset.ttTitle = col.label + (isAdv ? "（進階時間）" : "（一般時間）");
    el.dataset.ttTime = formatRange(seg);
    if (isAdv) {
      const source = describeSourceForSegment(col.key, seg);
      if (source) el.dataset.ttSource = source;
      // 雙向 highlight 鋪路：把 src row index 寫入 dataset（comma 分隔）
      if (seg.srcTimes && seg.srcTimes.size > 0) {
        el.dataset.srcTimes = [...seg.srcTimes].sort((a, b) => a - b).join(",");
      }
      if (seg.srcDates && seg.srcDates.size > 0) {
        el.dataset.srcDates = [...seg.srcDates].sort((a, b) => a - b).join(",");
      }
    }
    return el;
  }

  function formatRange(seg) {
    const sameDay =
      seg.start.getFullYear() === seg.end.getFullYear() &&
      seg.start.getMonth() === seg.end.getMonth() &&
      seg.start.getDate() === seg.end.getDate();
    const wkLabel = "（週" + WEEKDAY_LABEL[seg.start.getDay()] + "）";
    if (sameDay) {
      return (
        fmtDate(seg.start) +
        " " +
        wkLabel +
        " " +
        pad2(seg.start.getHours()) +
        ":" +
        pad2(seg.start.getMinutes()) +
        " – " +
        pad2(seg.end.getHours()) +
        ":" +
        pad2(seg.end.getMinutes())
      );
    }
    return fmtDateTime(seg.start) + " – " + fmtDateTime(seg.end);
  }

  // ========== Tooltip ==========
  let $tooltip = null;
  function ensureTooltip() {
    if ($tooltip) return $tooltip;
    $tooltip = $(
      '<div class="time-axis-tooltip" style="display:none"></div>',
    ).appendTo("body");
    return $tooltip;
  }

  function showTooltip(e) {
    const ds = e.currentTarget.dataset;
    if (!ds.ttTitle) return;
    const $tt = ensureTooltip();
    const html = [];
    html.push(
      '<div class="time-axis-tooltip-title">' + escHtml(ds.ttTitle) + "</div>",
    );
    if (ds.ttTime) html.push("<div>" + escHtml(ds.ttTime) + "</div>");
    if (ds.ttSource)
      html.push(
        '<div class="time-axis-tooltip-source">' +
          escHtml(ds.ttSource) +
          "</div>",
      );
    $tt.html(html.join("")).show();
    moveTooltip(e);
    // 雙向 highlight 下→上：panel 與對應 .adv-row 邊框亮起
    highlightPanelFromSegment(e.currentTarget);
  }

  function moveTooltip(e) {
    if (!$tooltip || !$tooltip.is(":visible")) return;
    const offset = 12;
    let left = e.clientX + offset;
    let top = e.clientY + offset;
    const ttW = $tooltip.outerWidth();
    const ttH = $tooltip.outerHeight();
    const winW = $(window).width();
    const winH = $(window).height();
    if (left + ttW + 8 > winW) left = e.clientX - ttW - offset;
    if (top + ttH + 8 > winH) top = e.clientY - ttH - offset;
    $tooltip.css({ left: left + "px", top: top + "px" });
  }

  function hideTooltip() {
    if ($tooltip) $tooltip.hide();
    clearPanelHighlight();
  }

  // ========== 雙向 highlight ==========
  // 下→上：hover segment 時，對應 col 的 advanced-time-panel + 來源 .adv-row 邊框亮起
  function highlightPanelFromSegment(segEl) {
    const col = segEl.dataset.col;
    if (!col) return;
    const $panel = $('.advanced-time-panel[data-col="' + col + '"]');
    $panel.addClass("is-axis-hovered");
    if (segEl.dataset.srcTimes) {
      segEl.dataset.srcTimes.split(",").forEach((idx) => {
        $panel
          .find('.adv-row[data-kind="time"][data-idx="' + idx + '"]')
          .addClass("is-axis-hovered");
      });
    }
    if (segEl.dataset.srcDates) {
      segEl.dataset.srcDates.split(",").forEach((idx) => {
        $panel
          .find('.adv-row[data-kind="date"][data-idx="' + idx + '"]')
          .addClass("is-axis-hovered");
      });
    }
  }

  function clearPanelHighlight() {
    $(".advanced-time-panel.is-axis-hovered").removeClass("is-axis-hovered");
    $(".adv-row.is-axis-hovered").removeClass("is-axis-hovered");
  }

  // 上→下：hover .adv-row 時，time-axis 對應的 segments 邊框亮起
  function onAdvRowEnter() {
    const $row = $(this);
    const col = $row.closest(".advanced-time-panel").data("col");
    const kind = $row.attr("data-kind"); // "time" or "date"
    const idx = $row.attr("data-idx");
    if (col == null || !kind || idx == null) return;
    const dsKey = kind === "time" ? "srcTimes" : "srcDates";
    document
      .querySelectorAll(
        '.time-axis-segment[data-col="' + col + '"][data-kind="effective"]',
      )
      .forEach((s) => {
        const raw = s.dataset[dsKey];
        if (!raw) return;
        const ids = raw.split(",");
        if (ids.indexOf(idx) >= 0) {
          s.classList.add("is-cross-highlight");
        }
      });
    $row.addClass("is-axis-hovered");
  }

  function onAdvRowLeave() {
    document
      .querySelectorAll(".time-axis-segment.is-cross-highlight")
      .forEach((s) => {
        s.classList.remove("is-cross-highlight");
      });
    $(this).removeClass("is-axis-hovered");
  }

  // ========== Hover cursor + 跨欄對齊 ==========
  // 滑鼠進 row-track 時：顯示垂直虛線 cursor + 在另兩欄同時段 segment 加 highlight
  function onRowEnter() {
    const cursor = document.querySelector(".time-axis-cursor");
    if (cursor) cursor.classList.add("is-active");
  }

  function onRowMove(e) {
    if (!currentCoord || currentPxPerMs <= 0) return;
    const rowTrack = e.currentTarget;
    const rect = rowTrack.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    if (mouseX < 0 || mouseX > rect.width) return;

    // cursor 在 .time-axis-track 內，要加 label width 偏移
    const cursor = document.querySelector(".time-axis-cursor");
    if (cursor) cursor.style.left = 72 + mouseX + "px";

    // 算對應時間
    const tMs = currentCoord.start.getTime() + mouseX / currentPxPerMs;
    const segs = document.querySelectorAll(".time-axis-segment");
    segs.forEach((s) => {
      const startMs = +s.dataset.startMs;
      const endMs = +s.dataset.endMs;
      const inRange = startMs && endMs && tMs >= startMs && tMs < endMs;
      s.classList.toggle("is-cross-highlight", !!inRange);
    });
  }

  function onRowLeave() {
    const cursor = document.querySelector(".time-axis-cursor");
    if (cursor) cursor.classList.remove("is-active");
    document
      .querySelectorAll(".time-axis-segment.is-cross-highlight")
      .forEach((s) => {
        s.classList.remove("is-cross-highlight");
      });
  }

  // ========== 衝突偵測 ==========
  // C4: 交易完全晚於活動（交易.start > 活動.end）才違反
  // C5: 活動跟顯示無交集才違反
  // C6: 指定時間 rows 重疊（已被 mergeSegments 合併，但提醒使用者）
  // C7: 指定日期 rows 重疊（同上）
  // C8: 已移除 — 同區間模式下 computeEffective 已自動對齊，UI 限制下不可能違反
  // C9: 測試時間需完全早於活動時間 + 完全早於顯示時間（不得重疊、不得晚於）

  function detectConflicts() {
    const conflicts = [];
    const baseE = getColBaseRange("event");
    const baseT = getColBaseRange("tx");
    const baseD = getColBaseRange("display");

    // C4: 交易完全晚於活動才違反（交易應早於活動 或 與活動重疊）
    if (baseT && baseE) {
      if (baseT.start >= baseE.end) {
        conflicts.push({
          severity: "high",
          col: "tx",
          text: "交易時間完全晚於活動時間 — 交易應早於活動或與活動有時間重疊，否則用戶在活動期間沒有交易紀錄",
        });
      }
    }
    // C5: 活動跟顯示無交集才違反（兩者必須有任一段重疊）
    if (baseE && baseD) {
      if (baseE.end <= baseD.start || baseE.start >= baseD.end) {
        conflicts.push({
          severity: "high",
          col: "event",
          text: "活動時間與顯示時間沒有任何交集 — 兩者必須至少有一段時間重疊，活動才能被前台看見",
        });
      }
    }

    // C6 / C7: 進階 times / dates 重疊
    COLS.forEach((c) => {
      const raw = ($.AdvancedTimeState && $.AdvancedTimeState[c.key]) || null;
      const state = normalizeColState(raw);

      if (state.times.enabled) {
        const ranges = state.times.rows
          .map((r) => ({ s: parseHM(r.start), e: parseHM(r.end) }))
          .filter((r) => r.s && r.e)
          .map((r) => ({ start: r.s.h * 60 + r.s.m, end: r.e.h * 60 + r.e.m }));
        for (let i = 0; i < ranges.length; i++) {
          let overlapped = false;
          for (let j = i + 1; j < ranges.length && !overlapped; j++) {
            const a = ranges[i],
              b = ranges[j];
            if (a.start < b.end && b.start < a.end) {
              conflicts.push({
                severity: "low",
                col: c.key,
                text:
                  c.label +
                  "・指定時段第 " +
                  (i + 1) +
                  " 與第 " +
                  (j + 1) +
                  " 列重疊（已自動合併）",
              });
              overlapped = true;
            }
          }
          if (overlapped) break;
        }
      }

      if (state.dates.enabled) {
        const ranges = state.dates.rows
          .map((r) => ({ s: parseDateTime(r.start), e: parseDateTime(r.end) }))
          .filter((r) => r.s && r.e)
          .map((r) => ({ start: r.s.getTime(), end: r.e.getTime() }));
        for (let i = 0; i < ranges.length; i++) {
          let overlapped = false;
          for (let j = i + 1; j < ranges.length && !overlapped; j++) {
            const a = ranges[i],
              b = ranges[j];
            if (a.start < b.end && b.start < a.end) {
              conflicts.push({
                severity: "low",
                col: c.key,
                text:
                  c.label +
                  "・指定日期第 " +
                  (i + 1) +
                  " 與第 " +
                  (j + 1) +
                  " 段重疊（已自動合併）",
              });
              overlapped = true;
            }
          }
          if (overlapped) break;
        }
      }
    });

    // C9: 測試時間需完全早於活動時間 + 完全早於顯示時間
    const baseTest = getTestRange();
    if (baseTest) {
      const violations = [];
      if (baseE && baseTest.end > baseE.start) violations.push("活動時間");
      if (baseD && baseTest.end > baseD.start) violations.push("顯示時間");
      if (violations.length > 0) {
        conflicts.push({
          severity: "high",
          col: null, // 測試時間不在時間軸 row 上，無法標 segment
          text:
            "測試時間與" +
            violations.join("、") +
            "重疊或晚於 — 測試時間應完全早於" +
            violations.join("、"),
        });
      }
    }

    return conflicts;
  }

  function renderConflicts(conflicts) {
    const list = document.querySelector(".time-axis-conflicts");
    if (!list) return;

    // 先清掉所有 is-conflict
    document.querySelectorAll(".time-axis-segment.is-conflict").forEach((s) => {
      s.classList.remove("is-conflict");
    });

    if (!conflicts.length) {
      list.setAttribute("hidden", "");
      list.textContent = "";
      return;
    }
    list.removeAttribute("hidden");
    list.textContent = "";

    const frag = document.createDocumentFragment();
    conflicts.forEach((c) => {
      const item = document.createElement("div");
      item.className = "time-axis-conflict-item";
      item.dataset.severity = c.severity;
      const icon = document.createElement("i");
      icon.className = "material-symbols-outlined time-axis-conflict-icon";
      icon.textContent = "warning";
      const text = document.createElement("span");
      text.className = "time-axis-conflict-text";
      text.textContent = c.text;
      item.appendChild(icon);
      item.appendChild(text);
      frag.appendChild(item);
    });
    list.appendChild(frag);

    // 高嚴重度衝突：對應欄的 base segment 加紅框（C4 / C5）
    conflicts.forEach((c) => {
      if (c.severity !== "high" || !c.col) return;
      document
        .querySelectorAll(
          '.time-axis-segment[data-col="' + c.col + '"][data-kind="base"]',
        )
        .forEach((s) => {
          s.classList.add("is-conflict");
        });
    });
  }

  // ========== Zoom ==========
  function setZoom(level) {
    zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, level));
    render();
  }
  function zoomIn() {
    setZoom(zoomLevel * ZOOM_STEP);
  }
  function zoomOut() {
    setZoom(zoomLevel / ZOOM_STEP);
  }
  function zoomFit() {
    setZoom(1);
  }

  function updateZoomButtons() {
    const $root = $(".time-axis-preview");
    $root
      .find('[data-zoom="in"]')
      .prop("disabled", zoomLevel >= ZOOM_MAX - 0.01);
    $root
      .find('[data-zoom="out"]')
      .prop("disabled", zoomLevel <= ZOOM_MIN + 0.01);
    $root
      .find('[data-zoom="fit"]')
      .prop("disabled", zoomLevel <= ZOOM_MIN + 0.01);
    $root.find(".time-axis-zoom-level").text(Math.round(zoomLevel * 100) + "%");
  }

  // ========== 初始化 ==========
  function buildSkeleton() {
    return (
      '<div class="time-axis-toolbar">' +
      "<h3>時間軸預覽</h3>" +
      '<div class="time-axis-zoom">' +
      '<button type="button" data-zoom="fit" title="符合視窗寬度"><i class="material-symbols-outlined">fit_screen</i></button>' +
      '<span class="time-axis-zoom-divider"></span>' +
      '<button type="button" data-zoom="out" title="縮小"><i class="material-symbols-outlined">remove</i></button>' +
      '<span class="time-axis-zoom-level">100%</span>' +
      '<button type="button" data-zoom="in" title="放大"><i class="material-symbols-outlined">add</i></button>' +
      "</div>" +
      "</div>" +
      '<div class="time-axis-empty" hidden></div>' +
      '<div class="time-axis-scroll-wrap">' +
      '<div class="time-axis-scroll">' +
      '<div class="time-axis-track">' +
      '<div class="time-axis-cursor"></div>' +
      '<div class="time-axis-scale"></div>' +
      COLS.map(
        (c) =>
          '<div class="time-axis-row" data-col="' +
          c.key +
          '">' +
          '<div class="time-axis-row-label">' +
          c.label +
          "</div>" +
          '<div class="time-axis-row-track"></div>' +
          "</div>",
      ).join("") +
      "</div>" +
      "</div>" +
      "</div>" +
      '<div class="time-axis-empty-notice-bar" hidden>' +
      '<i class="material-symbols-outlined">warning</i>' +
      '<span class="time-axis-empty-notice-text"></span>' +
      "</div>" +
      '<div class="time-axis-conflicts" hidden></div>'
    );
  }

  function debouncedRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(render);
    }, 200);
  }

  $(function () {
    const $root = $(".time-axis-preview");
    if (!$root.length) return;
    $root.html(buildSkeleton());

    $root.on("click", '[data-zoom="in"]', zoomIn);
    $root.on("click", '[data-zoom="out"]', zoomOut);
    $root.on("click", '[data-zoom="fit"]', zoomFit);

    // Tooltip 事件代理
    $root.on("mouseenter", ".time-axis-segment", showTooltip);
    $root.on("mousemove", ".time-axis-segment", moveTooltip);
    $root.on("mouseleave", ".time-axis-segment", hideTooltip);

    // 垂直對齊輔助線：hover row-track 時顯示 cursor + 跨欄 highlight
    $root.on("mouseenter", ".time-axis-row-track", onRowEnter);
    $root.on("mousemove", ".time-axis-row-track", onRowMove);
    $root.on("mouseleave", ".time-axis-row-track", onRowLeave);

    // 雙向 highlight 上→下：hover .adv-row 時，time-axis 對應 segments 邊框亮起
    $(document).on("mouseenter", ".advanced-time-body .adv-row", onAdvRowEnter);
    $(document).on("mouseleave", ".advanced-time-body .adv-row", onAdvRowLeave);

    // 監聽進階時間 state 變動
    $(document).on("advtime:change", debouncedRender);

    // 監聽三組起訖 input（不用 keyup，避免打字中斷態 parse 失敗造成閃爍）
    const inputSelector = COLS.map(
      (c) => "." + c.startCls + ", ." + c.endCls,
    ).join(", ");
    $(document).on("change blur", inputSelector, debouncedRender);

    // 監聽進階啟用/停用 radio / switch
    $(document).on(
      "change",
      ".advanced-time-panel input.advanced-toggle, .advanced-time-panel input.switch-advanced-toggle",
      debouncedRender,
    );

    // 監聽測試時間 input + 啟用/停用 checkbox（C9 偵測用）
    $(document).on(
      "change blur",
      ".test-start-input, .test-end-input",
      debouncedRender,
    );
    $(document).on("change", ".switch-calendar", debouncedRender);

    // 視窗 resize 時重繪
    $(window).on("resize", debouncedRender);

    // scroll 容器滑動時即時更新左右遮罩
    // 注意：scroll 事件不冒泡，必須直接綁在元素上，不能用 delegated
    const scrollEl = $root.find(".time-axis-scroll")[0];
    if (scrollEl) {
      scrollEl.addEventListener("scroll", updateOverflowState);
    }

    // 首次渲染：用 rAF 比 setTimeout(0) 晚一拍，DOM 量測較穩
    requestAnimationFrame(render);
  });

  // ========== 對外 API ==========
  $.TimeAxis = {
    render: render,
    refresh: debouncedRender,
    setZoom: setZoom,
    zoomIn: zoomIn,
    zoomOut: zoomOut,
    zoomFit: zoomFit,
  };
})(jQuery);
