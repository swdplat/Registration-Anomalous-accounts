// ============================================================================
// cascade-select.js — 連動下拉選單（cascade / dependent dropdown）通用行為
// ============================================================================
//
// 【設計原則｜對齊 components.js 的 disable 慣例】
//   與 .switch-limit（components.js:115）、data-radio-input（components.js:136）
//   相同：行為寫在共用 JS，HTML 只用 class / data-* 宣告關聯，JS 內「不含任何
//   業務資料」。換頁 / 換欄位都能重用，不需為每頁各寫一段 script。
//
// 【HTML 宣告方式】
//   父層 <select>：  data-cascade-child="子層 select 的 id"
//   子層 <select>：  data-cascade-parent="父層 select 的 id"
//                    （子層若同時是更下層的父層，再一併加 data-cascade-child）
//   子層 <option>：  data-parent="所屬父層的 value"
//                    （決定這個選項在父層選了哪個值時才出現；選項清單本身仍由
//                     後端渲染進 HTML，或改走 AJAX 時於此動態插入）
//
// 【行為】
//   1. 進畫面：父層未選值的子層 → 一律清空並 disabled（只有最上層可操作）。
//   2. 父層選了值 → 子層依 data-parent 篩出對應選項、啟用、重設為「請選擇」。
//   3. 父層改回「請選擇」→ 子層清空並 disabled，並往下連動重置孫層。
//
// 【disable 做法】沿用 components.js 的 $el.prop("disabled", ...)；
//   select2 會透過 MutationObserver 自動同步外觀，不需額外處理。
//
// 【相容 select2】重建選項後以 change.select2（命名空間）通知 select2 重繪，
//   該事件不會觸發我們綁的一般 change → 避免連動遞迴。
// ============================================================================

$(function () {
    "use strict";

    var PLACEHOLDER = '<option value="" selected>請選擇</option>';

    // 保存每個子層「完整選項清單」（含 data-parent），之後依父層值篩選重建。
    // 必須在任何 refreshChild 之前先全部存好，遞迴連動孫層時才取得到。
    $("select[data-cascade-parent]").each(function () {
        var $child = $(this);
        $child.data(
            "cascadeAllOptions",
            $child.find("option[data-parent]").clone()
        );
    });

    // 依父層目前的值，重建子層選項 + 設定啟用/停用，再往下連動孫層。
    function refreshChild($child) {
        if (!$child || $child.length === 0) return;

        var parentId = $child.attr("data-cascade-parent");
        var parentVal = $("#" + parentId).val();
        var $allOptions = $child.data("cascadeAllOptions");

        // 重建：placeholder + 符合父層值的選項
        $child.empty().append(PLACEHOLDER);
        if (parentVal) {
            $allOptions
                .filter(function () {
                    return $(this).attr("data-parent") === parentVal;
                })
                .each(function () {
                    $child.append($(this).clone());
                });
        }

        // 有選父層才啟用；未選則停用（disable 由 JS 控制，對齊 components.js）
        $child.prop("disabled", !parentVal);

        // 通知 select2 重繪並重設為「請選擇」（不觸發我們綁的一般 change）
        $child.val("").trigger("change.select2");

        // 若自己也是別人的父層 → 往下連動重置
        var grandChildId = $child.attr("data-cascade-child");
        if (grandChildId) {
            refreshChild($("#" + grandChildId));
        }
    }

    // 初始化：所有子層先依父層現值刷新（未選父層 → 清空 + disable）。
    $("select[data-cascade-parent]").each(function () {
        refreshChild($(this));
    });

    // 父層變動 → 刷新其直接子層（子層內部再遞迴往下連動孫層）。
    $(document).on("change", "select[data-cascade-child]", function () {
        var childId = $(this).attr("data-cascade-child");
        if (childId) refreshChild($("#" + childId));
    });
});
