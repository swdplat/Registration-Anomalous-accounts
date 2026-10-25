// ============================================================================
// switch-controls.js — 平行 Switch 連動系統
// ============================================================================
//
// 【為什麼有這個檔案】
// 全站 admin 後台原本以「是/否」「啟用/停用」radio button 處理二元決策，
// UI 改版要把其中 15 個欄位改為滑桿 switch（checkbox）。為了避免動到既有
// radio 連動邏輯（components.js: updateRadioControlledInputs /
// updateToggleContainerInputs / updateToggleSelect / updateDependentInputs /
// updateSections；advanced-time.js: .advanced-toggle），本檔案以「平行系統」
// 形式存在，僅針對新加入的 switch 元件運作，**完全不觸碰** radio 端的程式碼
// 或 DOM。
//
// 【命名規則 — 與 radio 系統一一對應，但前綴加 `switch-`】
//   .toggle-container          ↔ .switch-container
//   .main-controlled           ↔ .switch-main-controlled
//   data-radio-input-group     ↔ data-switch-input-group
//   data-radio-input           ↔ data-switch-input
//   .toggle-select-radio       ↔ .switch-toggle-select
//   .advanced-toggle           ↔ .switch-advanced-toggle
//   .controlled-inputs-box     ←  雙系統共用（不重複定義）
//   .dependent-inputs          ←  雙系統共用（不重複定義）
//
// 【狀態判讀差異】
//   radio 端：       $('input[name=X]:checked').val() === 'enabled' / 'yes'
//   switch 端：      $checkbox.is(':checked')   （只有一顆 checkbox）
//
// 【為什麼要平行而非取代】
//   1. 9 組多選 radio（每組 > 2 顆）必須保留 → radio 邏輯不可移除。
//   2. advancedTxTime 內「跨區間 / 同區間」relation radio 在 Phase 0-3 不換 →
//      .advanced-toggle 雖然改 switch，但內部 radio 仍交給 advanced-time.js 處理。
//   3. 透過獨立 class／data 屬性，未來若要再拆分或回滾風險最小。
// ============================================================================

(function ($) {
    "use strict";

    if ($.SwitchControls) return; // 守門：防止重複載入

    // ------------------------------------------------------------------------
    // Phase 2 — switch 控制單一 input：data-switch-input-group + data-switch-input
    // ------------------------------------------------------------------------
    // 對應 radio 版的 updateRadioControlledInputs(name)。
    // radio 群組有 2 顆 input（yes / no），這裡只有 1 顆 checkbox，
    // 故 :checked → enabled / unchecked → disabled。
    function updateSwitchControlledInputs($switch) {
        var name = $switch.attr("name");
        if (!name) return;
        var isChecked = $switch.is(":checked");
        $('[data-switch-input="' + name + '"]').prop("disabled", !isChecked);
    }

    // ------------------------------------------------------------------------
    // Phase 2 — switch 控制 select：.switch-toggle-select
    // ------------------------------------------------------------------------
    // 對應 radio 版的 updateToggleSelect($toggleSelect)。
    // 因 switch 沒有「預設 / 自訂」二態，僅 checked / unchecked，
    // 故 :checked → select 啟用，反之停用。
    function updateSwitchToggleSelect($switchToggleSelect) {
        var $container = $switchToggleSelect.closest(".switch-container");
        var hasMain = $container.find(".switch-main-controlled").length > 0;
        var isMainEnabled = true;

        if (hasMain) {
            isMainEnabled = $container
                .find(".switch-main-controlled input[type='checkbox']")
                .is(":checked");
        }

        var isSelfChecked = $switchToggleSelect
            .find("input[type='checkbox']")
            .is(":checked");

        $switchToggleSelect
            .find(".dependent-inputs-select select")
            .prop("disabled", !(isMainEnabled && isSelfChecked));

        // 主開關關閉時，本層 switch 也跟著 disable
        $switchToggleSelect
            .find("input[type='checkbox']")
            .prop("disabled", !isMainEnabled);
    }

    // ------------------------------------------------------------------------
    // Phase 3 — switch 控制整塊區域：.switch-container + .switch-main-controlled
    // ------------------------------------------------------------------------
    // 對應 radio 版的 updateToggleContainerInputs() + 主開關 slideDown 動畫。
    // 與 radio 版差異：radio 主開關判讀 value="enabled"，這裡判讀 :checked。
    //
    // ⚠ 與 components.js .toggle-option-radio + .dependent-inputs 系統的整合：
    // 原本這套依存系統靠 $radio.closest(".toggle-container") 才會運作；
    // 我們把外層改成 .switch-container 後，components.js 那邊的 closest 找不到，
    // 因此 dependent-inputs 由本檔負責處理「主開關 ON 且 toggle-option-radio = custom」雙條件。
    function updateSwitchContainerInputs($container) {
        if (!$container || $container.length === 0) return;

        var $mainSwitch = $container
            .find(".switch-main-controlled input[type='checkbox']")
            .first();
        if ($mainSwitch.length === 0) return;

        var isEnabled = $mainSwitch.is(":checked");

        // 控制一般 controlled inputs（排除 dependent-inputs）
        $container
            .find(".controlled-inputs input")
            .not($container.find(".dependent-inputs input"))
            .prop("disabled", !isEnabled);

        // dependent-inputs 在 .toggle-option 內 → 看 toggle-option-radio 是否選 custom
        // 對齊 components.js updateDependentInputs：先讀 .switch-container 的 data-custom-value
        // 屬性，再讀本層 .toggle-option，預設 fallback 為 "custom"。
        var defaultCustomValue =
            $container.attr("data-custom-value") || "custom";
        $container.find(".toggle-option").each(function () {
            var $option = $(this);
            var customValue =
                $option.attr("data-custom-value") || defaultCustomValue;
            var isCustomSelected =
                $option.find(".toggle-option-radio:checked").val() ===
                customValue;
            $option
                .find(".dependent-inputs input")
                .prop("disabled", !(isEnabled && isCustomSelected));
        });

        // dependent-inputs 沒被 .toggle-option 包住的情況（純主開關控制）
        $container
            .find(".dependent-inputs input")
            .not($container.find(".toggle-option .dependent-inputs input"))
            .prop("disabled", !isEnabled);
    }

    // Helper: 對指定 wrapper（.switch-container 或 .toggle-container）內的 inputs
    // 套用 enable / disable，邏輯與 updateSwitchContainerInputs 一致（含
    // .toggle-option + .dependent-inputs 雙條件處理）。
    // 用於跨頁籤 cascade 時，連動目標 wrapper 沒有自己的主開關（例如複製出來的多語系頁籤
    // 或 prize-Insert.html 內 Tab2 的 .toggle-container 樁），仍要跟隨 source 主 switch 狀態。
    function syncWrapInputs($wrap, isEnabled) {
        if (!$wrap || $wrap.length === 0) return;

        // 一般 controlled-inputs（排除 .dependent-inputs）
        $wrap
            .find(".controlled-inputs input")
            .not($wrap.find(".dependent-inputs input"))
            .prop("disabled", !isEnabled);

        // dependent-inputs 在 .toggle-option 內 → 雙條件：主開關 ON 且本層 radio = custom
        var defaultCustomValue = $wrap.attr("data-custom-value") || "custom";
        $wrap.find(".toggle-option").each(function () {
            var $option = $(this);
            var customValue =
                $option.attr("data-custom-value") || defaultCustomValue;
            var isCustomSelected =
                $option.find(".toggle-option-radio:checked").val() ===
                customValue;
            $option
                .find(".dependent-inputs input")
                .prop("disabled", !(isEnabled && isCustomSelected));
        });

        // dependent-inputs 非在 .toggle-option 內（純主開關控制）
        $wrap
            .find(".dependent-inputs input")
            .not($wrap.find(".toggle-option .dependent-inputs input"))
            .prop("disabled", !isEnabled);
    }

    // Helper: 旋轉 wrapper 內的 chevron icon
    function rotateChevron($wrap, toUp) {
        var $trigger = $wrap.find(".collapse-trigger").first();
        if (!$trigger.length || !$trigger.hasClass("material-symbols-outlined"))
            return;
        var text = $trigger.text().trim();
        if (toUp && text === "keyboard_arrow_down") {
            $trigger.text("keyboard_arrow_up");
            $trigger.addClass("active");
        } else if (!toUp && text === "keyboard_arrow_up") {
            $trigger.text("keyboard_arrow_down");
            $trigger.removeClass("active");
        }
    }

    // 主開關 click → slideDown + cascade 啟用 cross-tab 目標
    // 對應 components.js 第 271-303 行的 .main-controlled click cascade，並進一步
    // **同步啟用 cascaded 目標的 inputs**（multilingual tab 設計：Tab1 開啟後其他語系
    // 頁籤的欄位也應可編輯，僅 ON/OFF 由 Tab1 統一控制）。
    function slideOpenControlledBox($container) {
        var $tabsScope = $container.closest(".tabs-container");
        var $wraps;
        if ($tabsScope.length) {
            $wraps = $tabsScope
                .find(".switch-container, .toggle-container")
                .filter(function () {
                    return $(this).children(".controlled-inputs-box").length > 0;
                });
        } else {
            $wraps = $container;
        }

        $wraps.each(function () {
            var $wrap = $(this);
            var $box = $wrap.children(".controlled-inputs-box").first();
            if ($box.length === 0) return;

            // slideDown 用 css("display") 判斷，避免 :visible 受祖先元素 display
            // 影響（非 active tab 的 .tab2-content 被隱藏時，:visible 永遠回 false）
            if ($box.css("display") === "none") {
                $box.slideDown(300);
                rotateChevron($wrap, true);
            }

            // cascaded 目標：強制啟用 inputs（source 由 change handler 內的
            // updateSwitchContainerInputs 處理，這裡跳過避免重複）
            if (!$wrap.is($container)) {
                syncWrapInputs($wrap, true);
            }
        });
    }

    // 主開關 click（OFF）→ 對稱 cascade：所有 wrap 的 box 一起 slideUp + inputs 一起停用
    // （Tab1 是單一 master，Tab2 與複製頁籤都沒有獨立 chevron，完全跟隨 Tab1 狀態）
    function slideCloseControlledBox($container) {
        var $tabsScope = $container.closest(".tabs-container");
        var $wraps;
        if ($tabsScope.length) {
            $wraps = $tabsScope
                .find(".switch-container, .toggle-container")
                .filter(function () {
                    return $(this).children(".controlled-inputs-box").length > 0;
                });
        } else {
            $wraps = $container;
        }

        $wraps.each(function () {
            var $wrap = $(this);
            var $box = $wrap.children(".controlled-inputs-box").first();
            if ($box.length === 0) return;

            // slideUp 用 css("display") 判斷，避免 :visible 受祖先元素 display 影響
            // 否則非 active tab 的 box（如 Tab2 inactive 時）會被誤判為 not-visible 而漏關
            if ($box.css("display") !== "none") {
                $box.slideUp(300);
                rotateChevron($wrap, false);
            }

            // cascaded 目標：強制停用 inputs（source 由 change handler 處理）
            if (!$wrap.is($container)) {
                syncWrapInputs($wrap, false);
            }
        });
    }

    // ------------------------------------------------------------------------
    // Phase 3 — 進階時間 panel 開合：.switch-advanced-toggle
    // ------------------------------------------------------------------------
    // 改由 advanced-time.js 內部 syncPanelExpansion 統一管理
    // （selector 已擴充支援 .advanced-toggle radio 與 .switch-advanced-toggle）。
    // 本檔不再各自處理 .switch-advanced-toggle 的 change / 初始化，
    // 避免雙來源同時 slideDown/Up 造成動畫衝突。

    // ------------------------------------------------------------------------
    // 公開 API（對齊 $.PopupBox / $.DialogBox / $.AdvancedTimeState 風格）
    // ------------------------------------------------------------------------
    $.SwitchControls = {
        updateSwitchControlledInputs: updateSwitchControlledInputs,
        updateSwitchToggleSelect: updateSwitchToggleSelect,
        updateSwitchContainerInputs: updateSwitchContainerInputs,
    };

    // ------------------------------------------------------------------------
    // 初始化 + 事件綁定
    // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
    // aria-checked 同步（部分舊版輔具對 role="switch" + checkbox 支援不完整）
    // ------------------------------------------------------------------------
    function syncAriaChecked($el) {
        $el.attr("aria-checked", $el.is(":checked") ? "true" : "false");
    }

    $(document).ready(function () {
        // ========= aria-checked 初始化與監聽 =========
        $('input[role="switch"]').each(function () {
            syncAriaChecked($(this));
        });
        $(document).on("change", 'input[role="switch"]', function () {
            syncAriaChecked($(this));
        });

        // ========= Phase 1 =========
        // 純展示 switch（無連動）不需 JS；不過保留統一的 change 監聽以利除錯。
        // 若實際 Phase 1 欄位 0 個連動，console 也不會輸出任何訊息。

        // ========= Phase 2 — data-switch-input-group + data-switch-input =========
        // 初始化：所有 group 在頁面載入時依目前 :checked 狀態 sync disabled。
        $("[data-switch-input-group]").each(function () {
            var $sw = $(this).find("input[type='checkbox']").first();
            updateSwitchControlledInputs($sw);
        });

        // 變動時更新
        $(document).on(
            "change",
            "[data-switch-input-group] input[type='checkbox']",
            function () {
                updateSwitchControlledInputs($(this));
            },
        );

        // ========= Phase 2 — .switch-toggle-select =========
        $(".switch-toggle-select").each(function () {
            updateSwitchToggleSelect($(this));
        });
        $(document).on(
            "change",
            ".switch-toggle-select input[type='checkbox']",
            function () {
                var $sel = $(this).closest(".switch-toggle-select");
                updateSwitchToggleSelect($sel);
            },
        );

        // ========= Phase 3 — .switch-container + .switch-main-controlled =========
        // 初始化（含含主開關 + 區塊內 dependent 全 disable）
        $(".switch-container").each(function () {
            var $container = $(this);
            updateSwitchContainerInputs($container);

            // 同步 controlled-inputs-box 初始可見性：未勾選 → 隱藏
            var $main = $container
                .find(".switch-main-controlled input[type='checkbox']")
                .first();
            var $box = $container.find(".controlled-inputs-box").first();
            if ($main.length && $box.length) {
                if (!$main.is(":checked")) {
                    $box.hide();
                }
            }

            // 同步本層 .switch-toggle-select disabled 狀態
            $container.find(".switch-toggle-select").each(function () {
                updateSwitchToggleSelect($(this));
            });
        });

        // 主開關 change → 重新計算 disabled，並順手連動 toggle-select
        $(document).on(
            "change",
            ".switch-main-controlled input[type='checkbox']",
            function () {
                var $container = $(this).closest(".switch-container");
                updateSwitchContainerInputs($container);
                $container.find(".switch-toggle-select").each(function () {
                    updateSwitchToggleSelect($(this));
                });
            },
        );

        // 主開關 click → slideDown / slideUp（用 click 而非 change，以涵蓋
        //「再次點擊已勾選的 switch」情境；對齊 components.js 第 271 行的設計）
        $(document).on(
            "click",
            ".switch-main-controlled input[type='checkbox']",
            function () {
                var $sw = $(this);
                var $container = $sw.closest(".switch-container");
                // click 在 change 之前；要等 :checked 狀態更新
                // jQuery click 事件中 checked 已是新狀態
                if ($sw.is(":checked")) {
                    slideOpenControlledBox($container);
                } else {
                    slideCloseControlledBox($container);
                }
            },
        );

        // ========= Phase 3 — .switch-container 內的 .toggle-option-radio =========
        // components.js 的 .toggle-option-radio handler 用 closest(".toggle-container")，
        // 在 .switch-container 內找不到 wrapper → 不會觸發。
        // 由本檔接手：當 switch-container 內的 toggle-option-radio 變動，重算 dependent-inputs。
        $(document).on(
            "change",
            ".switch-container .toggle-option-radio",
            function () {
                var $container = $(this).closest(".switch-container");
                updateSwitchContainerInputs($container);
            },
        );

        // ========= Phase 3 — cascaded .toggle-container 內的 .toggle-option-radio =========
        // 20260511 版 components.js 的 updateDependentInputs 用全域 isMainEnabled
        // （$(".main-controlled .toggle-group:checked")）；20260512 版改成 container-scoped 後，
        // cascaded .toggle-container（如 Tab2 樁、複製頁籤後）容器內無 main switch
        // → isMainEnabled 永遠 false → dependent-inputs 永遠 disabled。
        // 由本檔接手：以 source .switch-main-controlled 的 :checked 狀態為依據，
        // 套用 syncWrapInputs 覆蓋 components.js 的錯誤結果。
        $(document).on(
            "change",
            ".tabs-container .toggle-container .toggle-option-radio",
            function () {
                var $cascadedWrap = $(this).closest(".toggle-container");
                var $tabsScope = $cascadedWrap.closest(".tabs-container");
                if ($tabsScope.length === 0) return;
                var $sourceSwitch = $tabsScope
                    .find(
                        ".switch-container .switch-main-controlled input[type='checkbox']",
                    )
                    .first();
                if ($sourceSwitch.length === 0) return;
                syncWrapInputs($cascadedWrap, $sourceSwitch.is(":checked"));
            },
        );

        // ========= Phase 3 — .switch-advanced-toggle =========
        // 開合動畫與初始狀態由 advanced-time.js 統一處理（避免雙來源）。

        // ========= tab-added：複製頁籤時的清理 + 重新初始化 =========
        // 對齊 components.js:822 對 radio 版的處理：「事後派獎開關不會被複製到新頁籤」。
        // 同時為新頁籤內的 switch-container 重跑 disabled / 可見性同步。
        $(document).on("tab-added", function () {
            var $latest = $(".tabs-container .content > div").last();
            if ($latest.length === 0) return;

            // 移除 cloned 新 tab 內的 .switch-main-controlled .switch
            $latest.find(".switch-main-controlled .switch").remove();

            // 重新初始化新 tab 內的所有 switch-container
            $latest.find(".switch-container").each(function () {
                updateSwitchContainerInputs($(this));
                var $main = $(this)
                    .find(".switch-main-controlled input[type='checkbox']")
                    .first();
                var $box = $(this).find(".controlled-inputs-box").first();
                if ($main.length && $box.length && !$main.is(":checked")) {
                    $box.hide();
                }
            });

            // 同步新 tab 內的 aria-checked
            $latest.find('input[role="switch"]').each(function () {
                syncAriaChecked($(this));
            });

            // 對齊 source main switch 狀態：對稱 cascade（ON / OFF 都強制 sync）
            // 確保新 tab 的 box 可見性與 inputs 啟停與 source 完全一致
            var $tabsContainer = $latest.closest(".tabs-container");
            if ($tabsContainer.length) {
                var $sourceSwitch = $tabsContainer
                    .find(
                        ".switch-container .switch-main-controlled input[type='checkbox']",
                    )
                    .first();
                if ($sourceSwitch.length) {
                    var $sourceContainer = $sourceSwitch.closest(
                        ".switch-container",
                    );
                    if ($sourceSwitch.is(":checked")) {
                        slideOpenControlledBox($sourceContainer);
                    } else {
                        slideCloseControlledBox($sourceContainer);
                    }
                }
            }
        });
    });
})(jQuery);
