// 進階時間設定 - 活動 / 交易 / 顯示三欄共用
// 內嵌 panel 模式（不用 dialog）。每欄獨立渲染於 .advanced-time-panel[data-col]

(function ($) {
  // ========== 設定資料 ==========
  const COLS = ["event", "tx", "display"];
  const WEEKDAYS = [
    { v: "mon", label: "星期一" },
    { v: "tue", label: "星期二" },
    { v: "wed", label: "星期三" },
    { v: "thu", label: "星期四" },
    { v: "fri", label: "星期五" },
    { v: "sat", label: "星期六" },
    { v: "sun", label: "星期日" },
  ];

  // 預設 state（每欄使用 deep clone）
  // 預設僅「指定時間」開啟；指定週間 / 指定日期皆未勾選且其區塊呈 disabled
  function defaultColState() {
    return {
      relation: "跨區間", // tx 才會用到
      weekdays: {
        enabled: false,
        days: {
          mon: false,
          tue: false,
          wed: false,
          thu: false,
          fri: false,
          sat: false,
          sun: false,
        },
      },
      times: { enabled: true, rows: [{ start: "", end: "" }] },
      dates: { enabled: false, rows: [{ start: "", end: "" }] },
    };
  }

  const state = {
    event: defaultColState(),
    tx: defaultColState(),
    display: defaultColState(),
  };

  // 紀錄最後一次有效的活動時間，供「回復」用
  let lastValidEventStart = "";
  let lastValidEventEnd = "";
  let isReverting = false;

  // ========== 工具：日期 / 時間解析與比較 ==========
  function parseDate(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  // Parse "HH:MM" → minutes since midnight；超出 0-23 / 0-59 視為非法
  function parseTime(str) {
    if (!str) return null;
    const m = String(str).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh > 23 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function getEventRange() {
    const start = parseDate($(".event-start-input").val());
    const end = parseDate($(".event-end-input").val());
    return { start, end };
  }

  // Validate a single row's start/end and update border + error message
  function validateRowPair($row) {
    const kind = $row.data("kind");
    const cls = kind === "time" ? "adv-time" : "adv-date";
    const $startInput = $row.find("." + cls + "-start");
    const $endInput = $row.find("." + cls + "-end");
    const $errorEl = $row.find(".adv-row-error");
    const startVal = $startInput.val().trim();
    const endVal = $endInput.val().trim();

    $startInput.add($endInput).removeClass("is-error");
    $errorEl.hide();

    if (!startVal && !endVal) return true;

    const parser = kind === "time" ? parseTime : parseDate;
    const s = startVal ? parser(startVal) : null;
    const e = endVal ? parser(endVal) : null;

    const startBad = !!startVal && s === null;
    const endBad = !!endVal && e === null;
    const orderBad = s !== null && e !== null && s > e;

    if (startBad) $startInput.addClass("is-error");
    if (endBad) $endInput.addClass("is-error");
    if (orderBad) $startInput.add($endInput).addClass("is-error");

    if (startBad || endBad || orderBad) {
      $errorEl.show();
      return false;
    }
    return true;
  }

  function isDateRowInRange(row, range) {
    if (!range.start || !range.end) return true;
    const rs = parseDate(row.start);
    const re = parseDate(row.end);
    if (!rs || !re) return true;
    return rs >= range.start && re <= range.end;
  }

  function escAttr(s) {
    return String(s == null ? "" : s).replace(/"/g, "&quot;");
  }

  function cap(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ========== flatpickr 生命週期管理 ==========
  // 進階日期 row 只取日期。每次新增 row 後須對該 input 呼叫 flatpickr，
  // 移除 row 前須 destroy，避免 .flatpickr-calendar DOM 殘留與 z-index 累積。
  function bindAdvDatepicker(inputEl) {
    if (!inputEl || inputEl._flatpickr) return;
    if (typeof flatpickr !== "function") return;
    const opts = {
      mode: "single",
      enableTime: false,
      dateFormat: "Y/m/d",
      locale: "zh",
      allowInput: true,
    };
    if (typeof confirmDatePlugin === "function") {
      opts.plugins = [
        new confirmDatePlugin({
          confirmIcon: "<i class='fa fa-check'></i>",
          confirmText: "OK ",
          showAlways: true,
          theme: "light",
        }),
      ];
    }
    flatpickr(inputEl, opts);
  }

  function destroyFlatpickrIn($scope) {
    $scope.find("input").each(function () {
      if (this._flatpickr) this._flatpickr.destroy();
    });
  }

  function bindAdvDatepickersIn($row) {
    $row.find(".adv-date-start, .adv-date-end").each(function () {
      bindAdvDatepicker(this);
    });
  }

  // ========== Panel HTML 組裝（含 col 後綴避免 radio name 串擾）==========
  function buildPanelBody(col) {
    const showRelation = col === "tx";
    const html = [];
    if (showRelation) {
      html.push(
        '<div class="adv-section" data-section="relation">' +
          '<div class="field mar-0">' +
          '<h3>與活動時間關聯<i class="material-symbols-outlined tooltip-trigger" data-tooltip="跨區間：活動期間內任一交易，皆可參與所有區段活動（週一的交易，可參加週五的活動）&#10;同區間：交易時間須與活動區間完全重合，方可參加（週一的交易，僅可參加週一的活動）" data-tooltip-position="right">info</i></h3>' +
          '<div class="radio-group">' +
          '<label><input type="radio" name="advRel_' +
          col +
          '" value="跨區間" checked>跨區間</label>' +
          '<label><input type="radio" name="advRel_' +
          col +
          '" value="同區間">同區間</label>' +
          "</div>" +
          "</div>" +
          "</div>" +
          '<div class="adv-divider"></div>',
      );
    }
    // 指定週間
    html.push(
      '<div class="adv-section" data-section="weekdays">' +
        '<label class="adv-section-toggle">' +
        '<input type="checkbox" name="advWeekdaysEnabled_' +
        col +
        '" checked>指定週間' +
        "</label>" +
        '<div class="adv-section-body weekday-grid">' +
        WEEKDAYS.map(function (w) {
          return (
            '<label><input type="checkbox" name="advDay_' +
            col +
            '" value="' +
            w.v +
            '">' +
            w.label +
            "</label>"
          );
        }).join("") +
        "</div>" +
        "</div>" +
        '<div class="adv-divider"></div>',
    );
    // 指定時間
    html.push(
      '<div class="adv-section col-6" data-section="times">' +
        '<label class="adv-section-toggle">' +
        '<input type="checkbox" name="advTimesEnabled_' +
        col +
        '" checked>指定時間' +
        "</label>" +
        '<div class="adv-section-body">' +
        '<div class="adv-rows" data-rows="time"></div>' +
        '<div class="adv-add-row-wrap">' +
        '<button type="button" class="adv-add-row" data-add="time"><i class="material-symbols-outlined">add_circle</i>新增時間</button>' +
        "</div>" +
        "</div>" +
        "</div>" +
        '<div class="adv-divider"></div>',
    );
    // 指定日期
    html.push(
      '<div class="adv-section col-6" data-section="dates">' +
        '<label class="adv-section-toggle">' +
        '<input type="checkbox" name="advDatesEnabled_' +
        col +
        '" checked>指定日期' +
        "</label>" +
        '<div class="adv-section-body">' +
        '<div class="adv-rows" data-rows="date"></div>' +
        '<div class="adv-add-row-wrap">' +
        '<button type="button" class="adv-add-row" data-add="date"><i class="material-symbols-outlined">add_circle</i>新增日期</button>' +
        "</div>" +
        "</div>" +
        "</div>",
    );
    return html.join("");
  }

  // 真實資料 row（dual-inputs 包裹，對齊現有元件）
  function buildRowHtml(row, kind, idx) {
    const phStart = kind === "time" ? "hh:mm" : "yyyy/mm/dd";
    const phEnd = kind === "time" ? "hh:mm" : "yyyy/mm/dd";
    const cls = kind === "time" ? "adv-time" : "adv-date";
    return (
      '<div class="adv-row" data-kind="' +
      kind +
      '" data-idx="' +
      idx +
      '">' +
      '<div class="adv-row-main">' +
      '<div class="dual-inputs">' +
      '<input type="text" class="' +
      cls +
      '-start" placeholder="' +
      phStart +
      '" value="' +
      escAttr(row.start) +
      '" autocomplete="off">' +
      '<span class="dual-inputs-sep">－</span>' +
      '<input type="text" class="' +
      cls +
      '-end" placeholder="' +
      phEnd +
      '" value="' +
      escAttr(row.end) +
      '" autocomplete="off">' +
      "</div>" +
      '<span class="adv-row-error" style="display:none">' +
      (kind === "time" ? "請輸入正確的時間" : "請選擇正確的日期") +
      "</span>" +
      "</div>" +
      '<button type="button" class="adv-row-delete" title="移除"><i class="material-symbols-outlined">delete</i></button>' +
      "</div>" +
      "</div>"
    );
  }

  // ========== state → UI ==========
  function fillPanel($body, col) {
    const s = state[col];
    if (col === "tx") {
      $body
        .find('input[name="advRel_' + col + '"][value="' + s.relation + '"]')
        .prop("checked", true);
    }
    $body
      .find('input[name="advWeekdaysEnabled_' + col + '"]')
      .prop("checked", s.weekdays.enabled);
    Object.keys(s.weekdays.days).forEach(function (d) {
      $body
        .find('input[name="advDay_' + col + '"][value="' + d + '"]')
        .prop("checked", s.weekdays.days[d]);
    });
    $body
      .find('input[name="advTimesEnabled_' + col + '"]')
      .prop("checked", s.times.enabled);
    $body
      .find('input[name="advDatesEnabled_' + col + '"]')
      .prop("checked", s.dates.enabled);
    renderRows($body, "time", s.times.rows);
    renderRows($body, "date", s.dates.rows);
    applyRelationVisibility($body, col);
    applySectionDisabled($body, col);
  }

  // 渲染資料 rows，不補 placeholder
  function renderRows($body, kind, rows) {
    const $container = $body.find('[data-rows="' + kind + '"]');
    destroyFlatpickrIn($container);
    $container.empty();
    rows.forEach(function (row, idx) {
      const $row = $(buildRowHtml(row, kind, idx));
      $container.append($row);
      if (kind === "date") bindAdvDatepickersIn($row);
    });
  }

  // 只有交易時間有寬鬆/同區間；活動 / 顯示時間不適用，週間+時間+日期永遠都顯示
  function applyRelationVisibility($body, col) {
    if (col !== "tx") return;
    const rel = $body.find('input[name="advRel_' + col + '"]:checked').val();
    const isStrict = rel === "同區間";
    $body.find('[data-section="weekdays"]').toggle(!isStrict);
    $body.find('[data-section="dates"]').toggle(!isStrict);
    applyAtLeastOneRule($body, col);
  }

  function applySectionDisabled($body, col) {
    ["weekdays", "times", "dates"].forEach(function (key) {
      const checked = $body
        .find('input[name="adv' + cap(key) + "Enabled_" + col + '"]')
        .is(":checked");
      const $section = $body.find('[data-section="' + key + '"]');
      $section.find(".adv-section-body").toggleClass("is-disabled", !checked);
      $section
        .find(".adv-section-body")
        .find("input,button")
        .not('input[name="adv' + cap(key) + "Enabled_" + col + '"]')
        .prop("disabled", !checked);
    });
    applyAtLeastOneRule($body, col);
  }

  // 規則：每個 panel 內「指定週間 / 指定時間 / 指定日期」至少需勾選一個。
  // 當僅剩一個勾選時，將該 checkbox 設為 disabled，避免使用者取消全部。
  // tx 在「同區間」時只剩「指定時間」可見，僅以可見項目參與計算；
  // 隱藏項目不會被此規則 disable，以免日後切回「跨區間」仍卡住。
  function applyAtLeastOneRule($body, col) {
    const sections = ["weekdays", "times", "dates"];
    const applicable = sections.filter(function (key) {
      if (col === "tx") {
        const rel = $body
          .find('input[name="advRel_' + col + '"]:checked')
          .val();
        if (rel === "同區間" && key !== "times") return false;
      }
      return true;
    });
    const checkedKeys = applicable.filter(function (key) {
      return $body
        .find('input[name="adv' + cap(key) + "Enabled_" + col + '"]')
        .is(":checked");
    });
    sections.forEach(function (key) {
      const $cb = $body.find(
        'input[name="adv' + cap(key) + "Enabled_" + col + '"]',
      );
      const isApplicable = applicable.indexOf(key) !== -1;
      const onlyChecked =
        checkedKeys.length === 1 && checkedKeys[0] === key && isApplicable;
      $cb.prop("disabled", onlyChecked);
    });
  }

  // ========== UI → state ==========
  function readPanel($body, col) {
    const s = JSON.parse(JSON.stringify(state[col]));
    if (col === "tx") {
      s.relation =
        $body.find('input[name="advRel_' + col + '"]:checked').val() ||
        "跨區間";
    }
    s.weekdays.enabled = $body
      .find('input[name="advWeekdaysEnabled_' + col + '"]')
      .is(":checked");
    WEEKDAYS.forEach(function (w) {
      s.weekdays.days[w.v] = $body
        .find('input[name="advDay_' + col + '"][value="' + w.v + '"]')
        .is(":checked");
    });
    s.times.enabled = $body
      .find('input[name="advTimesEnabled_' + col + '"]')
      .is(":checked");
    s.times.rows = $body
      .find('[data-rows="time"] .adv-row:not(.is-placeholder)')
      .map(function () {
        return {
          start: $(this).find(".adv-time-start").val().trim(),
          end: $(this).find(".adv-time-end").val().trim(),
        };
      })
      .get();
    s.dates.enabled = $body
      .find('input[name="advDatesEnabled_' + col + '"]')
      .is(":checked");
    s.dates.rows = $body
      .find('[data-rows="date"] .adv-row:not(.is-placeholder)')
      .map(function () {
        return {
          start: $(this).find(".adv-date-start").val().trim(),
          end: $(this).find(".adv-date-end").val().trim(),
        };
      })
      .get();
    return s;
  }

  // 廣播 state 變動（給 time-axis.js 等訂閱者）
  function notifyChange() {
    $(document).trigger("advtime:change");
  }

  // 內嵌即時模式：每次 input 變動就 commit
  function commit($body, col) {
    state[col] = readPanel($body, col);
    notifyChange();
  }

  // ========== 驗證（仍可外部呼叫做 form submit 前檢查）==========
  function validate(col, draft) {
    const errors = [];
    if (draft.relation !== "同區間" && draft.dates.enabled) {
      const range = getEventRange();
      draft.dates.rows.forEach(function (row, idx) {
        if (row.start || row.end) {
          if (!parseDate(row.start) || !parseDate(row.end)) {
            errors.push(
              "[" +
                col +
                "] 指定日期 第 " +
                (idx + 1) +
                " 筆格式不正確（YYYY/MM/DD）",
            );
          } else if (parseDate(row.start) > parseDate(row.end)) {
            errors.push(
              "[" +
                col +
                "] 指定日期 第 " +
                (idx + 1) +
                " 筆開始日期不能晚於結束日期",
            );
          } else if (!isDateRowInRange(row, range)) {
            errors.push(
              "[" + col + "] 指定日期 第 " + (idx + 1) + " 筆超出活動時間範圍",
            );
          }
        }
      });
    }
    if (draft.times.enabled) {
      draft.times.rows.forEach(function (row, idx) {
        if (row.start || row.end) {
          if (
            !/^\d{1,2}:\d{2}$/.test(row.start) ||
            !/^\d{1,2}:\d{2}$/.test(row.end)
          ) {
            errors.push(
              "[" +
                col +
                "] 指定時間 第 " +
                (idx + 1) +
                " 筆格式不正確（HH:MM）",
            );
          } else if (parseTime(row.start) > parseTime(row.end)) {
            errors.push(
              "[" +
                col +
                "] 指定時間 第 " +
                (idx + 1) +
                " 筆開始時間不能晚於結束時間",
            );
          }
        }
      });
    }
    return errors;
  }

  // ========== 啟用/停用 radio / switch 切換 → 展開/收起 ==========
  // 同時支援既有 .advanced-toggle radio（value="enabled" 時 checked）
  // 與平行 switch 系統的 .switch-advanced-toggle checkbox（:checked 即啟用）
  function syncPanelExpansion($panel) {
    const enabled =
      $panel
        .find('input.advanced-toggle[value="enabled"]:checked, input.switch-advanced-toggle:checked')
        .length > 0;
    const $body = $panel.find(".advanced-time-body");
    if (enabled) {
      $body.prop("hidden", false).hide().slideDown(300);
    } else {
      $body.slideUp(300, function () {
        $(this).prop("hidden", true);
      });
    }
  }

  // ========== 活動時間變動 → 警告 / 同步清除 ==========
  function checkAdvancedRangeOnEventChange() {
    if (isReverting) return;
    const range = getEventRange();
    if (!range.start || !range.end) {
      lastValidEventStart = $(".event-start-input").val();
      lastValidEventEnd = $(".event-end-input").val();
      return;
    }
    const offending = [];
    COLS.forEach(function (col) {
      if (!state[col].dates.enabled) return;
      if (col === "tx" && state[col].relation === "同區間") return;
      state[col].dates.rows.forEach(function (row, idx) {
        if ((row.start || row.end) && !isDateRowInRange(row, range)) {
          offending.push({ col: col, idx: idx });
        }
      });
    });
    if (offending.length === 0) {
      lastValidEventStart = $(".event-start-input").val();
      lastValidEventEnd = $(".event-end-input").val();
      return;
    }
    const ok = window.confirm(
      "進階設定中有 " +
        offending.length +
        " 筆指定日期超出新的活動時間範圍。\n\n" +
        "按「確定」=> 清除超出範圍的進階設定。\n" +
        "按「取消」=> 回復原本的活動時間。",
    );
    if (ok) {
      offending.forEach(function (o) {
        state[o.col].dates.rows[o.idx] = { start: "", end: "" };
      });
      COLS.forEach(function (col) {
        state[col].dates.rows = state[col].dates.rows.filter(function (r) {
          return r.start || r.end;
        });
        if (state[col].dates.rows.length === 0) {
          state[col].dates.rows = [{ start: "", end: "" }];
        }
        const $body = $(
          '.advanced-time-panel[data-col="' + col + '"] .advanced-time-body',
        );
        if ($body.length) renderRows($body, "date", state[col].dates.rows);
      });
      lastValidEventStart = $(".event-start-input").val();
      lastValidEventEnd = $(".event-end-input").val();
      notifyChange();
    } else {
      isReverting = true;
      $(".event-start-input").val(lastValidEventStart).trigger("change");
      $(".event-end-input").val(lastValidEventEnd).trigger("change");
      isReverting = false;
    }
  }

  // ========== 初始化 ==========
  $(function () {
    lastValidEventStart = $(".event-start-input").val();
    lastValidEventEnd = $(".event-end-input").val();

    // 對每個 panel 渲染 body 內容並填入 state
    $(".advanced-time-panel").each(function () {
      const $panel = $(this);
      const col = $panel.data("col");
      if (!col) return;
      const $body = $panel.find(".advanced-time-body");
      $body.html(buildPanelBody(col));
      fillPanel($body, col);
      // 初始狀態依 radio 或 switch 決定是否展開（不用動畫）
      const enabled =
        $panel
          .find('input.advanced-toggle[value="enabled"]:checked, input.switch-advanced-toggle:checked')
          .length > 0;
      $body.prop("hidden", !enabled);
    });

    // 啟用/停用 radio / switch → 展開/收起
    $(document).on(
      "change",
      ".advanced-time-panel input.advanced-toggle, .advanced-time-panel input.switch-advanced-toggle",
      function () {
        syncPanelExpansion($(this).closest(".advanced-time-panel"));
      },
    );

    // 內嵌即時 commit：任何 panel body 內 input/checkbox/radio 變動就寫回 state
    $(document).on("change", ".advanced-time-body :input", function () {
      const $panel = $(this).closest(".advanced-time-panel");
      const $body = $panel.find(".advanced-time-body");
      const col = $panel.data("col");
      if (!col) return;

      const name = $(this).attr("name") || "";
      if (name.indexOf("advRel_") === 0) applyRelationVisibility($body, col);
      if (/^adv(Weekdays|Times|Dates)Enabled_/.test(name))
        applySectionDisabled($body, col);

      commit($body, col);
    });

    // 新增 row（state push 後重 render，placeholder 自動補滿至 3 的倍數）
    $(document).on("click", ".advanced-time-body .adv-add-row", function () {
      const kind = $(this).data("add");
      const $panel = $(this).closest(".advanced-time-panel");
      const $body = $panel.find(".advanced-time-body");
      const col = $panel.data("col");
      const key = kind === "time" ? "times" : "dates";
      state[col][key].rows.push({ start: "", end: "" });
      renderRows($body, kind, state[col][key].rows);
      applySectionDisabled($body, col);
      notifyChange();
    });

    // 移除 row（state filter 後重 render；至少留一筆空 row 維持資料模型）
    $(document).on("click", ".advanced-time-body .adv-row-delete", function () {
      const $row = $(this).closest(".adv-row");
      if ($row.hasClass("is-placeholder")) return;
      const $container = $row.closest(".adv-rows");
      const $panel = $(this).closest(".advanced-time-panel");
      const $body = $panel.find(".advanced-time-body");
      const col = $panel.data("col");
      const kind = $container.data("rows");
      const key = kind === "time" ? "times" : "dates";
      const idx = $container.find(".adv-row:not(.is-placeholder)").index($row);
      if (idx < 0) return;
      state[col][key].rows.splice(idx, 1);
      if (state[col][key].rows.length === 0) {
        state[col][key].rows = [{ start: "", end: "" }];
      }
      renderRows($body, kind, state[col][key].rows);
      applySectionDisabled($body, col);
      notifyChange();
    });

    // 指定時間 row：只允許數字與冒號（hh:mm），其餘字元即時過濾
    $(document).on(
      "input",
      ".advanced-time-body .adv-time-start, .advanced-time-body .adv-time-end",
      function () {
        const el = this;
        const original = el.value;
        const filtered = original.replace(/[^\d:]/g, "");
        if (filtered !== original) {
          const pos = el.selectionStart - (original.length - filtered.length);
          el.value = filtered;
          try {
            el.setSelectionRange(Math.max(0, pos), Math.max(0, pos));
          } catch (e) {}
        }
      },
    );

    // 指定時間 / 指定日期 row：即時驗證開始不能晚於結束；
    // 不合法時持續顯示紅框 + 錯誤訊息，AdvancedTimeValidate() 會在送出時阻擋
    $(document).on(
      "change blur",
      ".advanced-time-body .adv-time-start, .advanced-time-body .adv-time-end," +
        " .advanced-time-body .adv-date-start, .advanced-time-body .adv-date-end",
      function () {
        validateRowPair($(this).closest(".adv-row"));
      },
    );

    // 活動時間變動 → 範圍檢查（晚於 calendar.js sync 邏輯一拍）
    $(document).on(
      "change blur",
      ".event-start-input, .event-end-input",
      function () {
        setTimeout(checkAdvancedRangeOnEventChange, 0);
      },
    );

    // 自定義活動時間文字：依「進階活動時間」啟用狀態切換顯示 / 必填
    syncCustomEventTimeTextFields();
    $(document).on(
      "change",
      '.advanced-time-panel[data-col="event"] input.advanced-toggle, .advanced-time-panel[data-col="event"] input.switch-advanced-toggle',
      syncCustomEventTimeTextFields,
    );
    // 新增 / 複製頁籤後補套用目前狀態，讓新頁籤的欄位也跟著隱藏或顯示
    $(document).on("tab-added", syncCustomEventTimeTextFields);
    $(document).on(
      "input change blur",
      ".custom-event-time-text-input",
      function () {
        validateCustomEventTimeText($(this));
      },
    );
  });

  // === 自定義活動時間文字 顯示 / 必填同步 ===
  // 顯示與必填一起同步：關閉「進階活動時間設定」時整個欄位隱藏，開啟時顯示並恢復必填
  function syncCustomEventTimeTextFields() {
    syncCustomEventTimeTextVisibility();
    syncCustomEventTimeTextRequired();
  }

  function isAdvEventEnabled() {
    return (
      $(
        '.advanced-time-panel[data-col="event"] input.advanced-toggle[value="enabled"]:checked, .advanced-time-panel[data-col="event"] input.switch-advanced-toggle:checked',
      ).length > 0
    );
  }

  // 取得欄位要收合的容器：
  // 該 row 內只有這一個 field 時整列收起，避免留下空白列；
  // 若同列還有其他欄位，則只收起自己的 field
  function getCustomEventTimeTextWrapper($input) {
    const $field = $input.closest(".field");
    const $row = $field.closest(".row");
    return $row.length && $row.find(".field").length === 1 ? $row : $field;
  }

  // 關閉時隱藏所有頁籤（含既有、新增與複製出來的）中的自定義活動時間文字欄位
  function syncCustomEventTimeTextVisibility() {
    const enabled = isAdvEventEnabled();
    $(".custom-event-time-text-input").each(function () {
      getCustomEventTimeTextWrapper($(this)).toggleClass("hide", !enabled);
    });
  }

  function syncCustomEventTimeTextRequired() {
    const required = isAdvEventEnabled();
    $(".custom-event-time-text-input").each(function () {
      const $input = $(this);
      const $field = $input.closest(".field");
      $field.find(".required-mark").toggle(required);
      if (required) {
        validateCustomEventTimeText($input);
      } else {
        $field.find(".suppl").hide();
      }
    });
  }

  function validateCustomEventTimeText($input) {
    if (!isAdvEventEnabled()) {
      $input.closest(".field").find(".suppl").hide();
      return true;
    }
    const val = ($input.val() || "").trim();
    const $suppl = $input.closest(".field").find(".suppl");
    if (!val) {
      $suppl.show();
      return false;
    }
    $suppl.hide();
    return true;
  }

  // 對外暴露（供 debug / form submit 驗證使用）
  // jQuery 命名空間（對齊 $.PopupBox / $.DialogBox 風格）+ window 全域（向下相容）
  $.AdvancedTimeState = state;
  window.AdvancedTimeState = state;
  window.CustomEventTimeTextValidate = function () {
    if (!isAdvEventEnabled()) return [];
    const errors = [];
    $(".custom-event-time-text-input").each(function () {
      if (!validateCustomEventTimeText($(this))) {
        errors.push("自定義活動時間文字必填");
      }
    });
    return errors;
  };
  window.AdvancedTimeValidate = function () {
    const allErrors = [];
    COLS.forEach(function (col) {
      const errs = validate(col, state[col]);
      allErrors.push.apply(allErrors, errs);
    });
    return allErrors;
  };
})(jQuery);
