// CKEditor 4 編輯器共用初始化函式

// 註冊 CodeMirror 外掛（語法高亮原始碼編輯）
if (typeof CKEDITOR !== "undefined") {
  CKEDITOR.plugins.addExternal(
    "codemirror",
    "https://cdn.jsdelivr.net/npm/ckeditor-codemirror-plugin@1.18.9/codemirror/",
    "plugin.js",
  );
  // 註冊 lineheight 外掛（行高下拉選單）
  CKEDITOR.plugins.addExternal(
    "lineheight",
    "https://cdn.jsdelivr.net/gh/lotusgodkk/lineheight@master/",
    "plugin.js",
  );

  // CDN 版 lineheight 外掛只支援 en/fr/es/ar/de/ko/pt-br/pt/no，
  // 中文環境會 fallback 到英文 "Line Height"。
  // 攔截 plugins.setLang（外掛 lang 檔載入時會呼叫），把 title 改為「行高」。
  // 必須用攔截的方式，因為 plugin.init() 在 pluginsLoaded 事件之前就已執行，
  // 沒有事件可在 lang 載入後、init 之前介入。
  var _origSetLang = CKEDITOR.plugins.setLang;
  CKEDITOR.plugins.setLang = function (pluginName, _langCode, entries) {
    if (pluginName === "lineheight" && entries && entries.title) {
      entries.title = "行高";
    }
    return _origSetLang.apply(this, arguments);
  };
}

window.initAllEditors = function () {
  if (typeof CKEDITOR === "undefined") return;
  document.querySelectorAll(".editor").forEach(function (editorEl) {
    if (
      !editorEl.classList.contains("ckeditor-initialized") &&
      window.isVisible(editorEl)
    ) {
      // CKEditor 4 需要元素有 id
      if (!editorEl.id) {
        editorEl.id = "editor_" + Math.random().toString(36).substr(2, 9);
      }
      // 避免重複初始化
      if (CKEDITOR.instances[editorEl.id]) return;

      CKEDITOR.replace(editorEl, {
        toolbar: [
          { name: "source", items: ["Source"] },
          { name: "clipboard", items: ["Undo", "Redo"] },
          {
            name: "basicstyles",
            items: ["Bold", "Italic", "Underline", "Strike", "RemoveFormat"],
          },
          { name: "colors", items: ["TextColor", "BGColor"] },
          {
            name: "paragraph",
            items: [
              "NumberedList",
              "BulletedList",
              "-",
              "JustifyLeft",
              "JustifyCenter",
              "JustifyRight",
              "JustifyBlock",
            ],
          },
          { name: "links", items: ["Link", "Unlink"] },
          {
            name: "insert",
            items: ["Image", "Table", "HorizontalRule", "Blockquote"],
          },
          {
            name: "styles",
            items: ["Format", "Font", "FontSize", "lineheight"],
          },
          { name: "tools", items: ["Maximize"] },
        ],
        // 載入外掛：CodeMirror（語法高亮）+ lineheight（行高下拉）
        extraPlugins: "codemirror,lineheight",
        // lineheight 外掛設定：可選的行高選項
        line_height: "1;1.2;1.5;1.8;2;2.5;3",
        // CodeMirror 設定
        codemirror: {
          theme: "default",
          lineNumbers: true,
          lineWrapping: true,
          matchBrackets: true,
          autoCloseTags: true,
          autoCloseBrackets: true,
          enableSearchTools: true,
          enableCodeFolding: true,
          enableCodeFormatting: true,
          autoFormatOnStart: true,
        },
        // 允許所有 HTML 標籤與屬性（等同 CKEditor 5 的 GeneralHtmlSupport）
        allowedContent: true,
        // 關閉版本安全警告（4.22.1 是最後的免費版本）
        versionCheck: false,
        height: 200,
      });

      editorEl.classList.add("ckeditor-initialized");
    }
  });
};

window.isVisible = function (el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
};

$(document).ready(function () {
  // 頁面載入時執行一次初始化
  window.initAllEditors();

  // 開啟設定限制
  $(document).on("change", ".switch-limit", function () {
    const field = $(this).closest("label").next(".switch-field").find("input");
    let isChecked = $(this).is(":checked");
    if (isChecked) {
      field.prop("disabled", false);
    } else {
      field.prop("disabled", true);
    }
  });

  // 「至少擇一」群組限制：同一 data-require-one 群組內至少要有一個 checkbox 被勾選。
  // 當群組僅剩一個被勾選時，將該 checkbox 設為 disabled，避免被取消勾選導致全部落空；
  // 一旦有兩個以上被勾選則全部解鎖。
  // e.g. whitelist-Insert> 多重條件（手機號碼／用戶號碼／電子郵件／遊戲帳號）
  function updateRequireOneGroup(groupName) {
    if (!groupName) return;
    const $group = $('[data-require-one="' + groupName + '"]');
    const $checked = $group.filter(":checked");
    if ($checked.length === 1) {
      // 僅剩一個被勾選 → 鎖住它，防止取消勾選
      $checked.prop("disabled", true);
    } else {
      // 兩個以上被勾選 → 全部解鎖
      $group.prop("disabled", false);
    }
  }

  $(document).on("change", "[data-require-one]", function () {
    updateRequireOneGroup($(this).attr("data-require-one"));
  });

  // 初始化：每個 require-one 群組各執行一次（用物件去重，避免同群組重複計算）
  const requireOneGroups = {};
  $("[data-require-one]").each(function () {
    requireOneGroups[$(this).attr("data-require-one")] = true;
  });
  Object.keys(requireOneGroups).forEach(updateRequireOneGroup);

  // 一個Checkbox可開啟多種input(dual-listbox、searchbar、select...等)功能
  // e.g. prize-event-卡號密碼-新增> 店家群組 Shop Type
  // dual-listbox 的啟用/禁用已由 dual-listbox.js 控制，此處僅處理與 dual-listbox 連動的額外元件（如 select）。
  $(document).on("change", ".switch-dual-listbox", function () {
    const $wrap = $(this).closest(".listbox-wrap");
    const isChecked = $(this).is(":checked");
    // 控制 select
    $wrap.find("select").prop("disabled", !isChecked);
  });

  $(function () {
    function updateRadioControlledInputs(name) {
      var isYes = $('input[name="' + name + '"]:checked').val() === "yes";
      $('[data-radio-input="' + name + '"]').prop("disabled", !isYes);
    }
    // 初始化
    $("[data-radio-input-group]").each(function () {
      var name = $(this).find('input[type="radio"]').attr("name");
      updateRadioControlledInputs(name);
    });
    // 綁定事件
    $(document).on(
      "change",
      '[data-radio-input-group] input[type="radio"]',
      function () {
        var name = $(this).attr("name");
        updateRadioControlledInputs(name);
      },
    );
  });

  // Radio Box開啟區塊內容
  function updateToggleContainerInputs() {
    $(".toggle-container").each(function () {
      const $container = $(this);
      const customValue = $container.attr("data-custom-value");
      const isEnabled =
        $container.find(".main-controlled .toggle-group:checked").val() ===
        $container.find(".main-controlled").attr("data-enabled-value");

      // 控制一般 controlled inputs（排除 dependent-inputs）
      $container
        .find(".controlled-inputs input")
        .not($container.find(".dependent-inputs input"))
        .prop("disabled", !isEnabled);

      // 控制 dependent-inputs，交由 toggle-option 的 radio 判斷
      const isCustomSelected =
        $container.find(".toggle-option-radio:checked").val() === customValue;
      $container
        .find(".dependent-inputs input")
        .prop("disabled", !(isEnabled && isCustomSelected));
    });
  }

  // Radio控制Select選單開始
  // 模組化 toggle-select 控制
  function updateToggleSelect($toggleSelect) {
    var customValue = $toggleSelect.attr("data-custom-value") || "custom";
    var $container = $toggleSelect.closest(".toggle-container");
    var hasMainControlled = $container.find(".main-controlled").length > 0;
    var isMainEnabled = true;

    // 若有 main-controlled，需判斷主開關
    if (hasMainControlled) {
      isMainEnabled =
        $container.find(".main-controlled .toggle-group:checked").val() ===
        $container.find(".main-controlled").attr("data-enabled-value");
    }

    var isCustom =
      $toggleSelect.find(".toggle-select-radio:checked").val() === customValue;

    // select 只有在主開關開啟且radio選「是」時才可用
    $toggleSelect
      .find(".dependent-inputs-select select")
      .prop("disabled", !(isMainEnabled && isCustom));
    // radio 也要跟著主開關disabled
    $toggleSelect.find(".toggle-select-radio").prop("disabled", !isMainEnabled);
  }

  // 綁定 toggle-select radio 切換
  $(document).on("change", ".toggle-select-radio", function () {
    var $toggleSelect = $(this).closest(".toggle-select");
    updateToggleSelect($toggleSelect);
  });

  // main-controlled 切換時，更新同區塊下所有 toggle-select
  $(document).on("change", ".main-controlled .toggle-group", function () {
    var $container = $(this).closest(".toggle-container");
    $container.find(".toggle-select").each(function () {
      updateToggleSelect($(this));
    });
  });

  // 頁面載入時初始化所有 toggle-select
  $(function () {
    $(".toggle-select").each(function () {
      updateToggleSelect($(this));
    });
  });
  // Radio控制Select選單結束

  // 初始化 + 綁定 toggle-container 本身的邏輯
  $(".toggle-container").each(function () {
    const $container = $(this);
    const customValue = $container.attr("data-custom-value");

    updateDependentInputs($container, customValue);
  });

  // 全域綁定 change 事件到所有 .toggle-option-radio
  $(document).on("change", ".toggle-option-radio", function () {
    const $radio = $(this);
    const $container = $radio.closest(".toggle-container");
    const customValue = $container.attr("data-custom-value");

    updateDependentInputs($container, customValue);
  });

  // 抽離出來的共用函式，根據條件控制 dependent input 的啟用狀態
  function updateDependentInputs($container, customValue) {
    const isMainEnabled =
      $container.find(".main-controlled .toggle-group:checked").val() ===
      $container.find(".main-controlled").attr("data-enabled-value");

    // 只針對每個 .toggle-option 區塊做判斷
    $container.find(".toggle-option").each(function () {
      const $option = $(this);
      const isCustomSelected =
        $option.find(".toggle-option-radio:checked").val() === customValue;
      $option
        .find(".dependent-inputs input")
        .prop("disabled", !(isMainEnabled && isCustomSelected));
    });
  }

  // 綁定 main-controlled 的控制邏輯
  $(document).on("change", ".main-controlled .toggle-group", function () {
    updateToggleContainerInputs();
  });

  // 主開關點擊「是」時，自動展開所有頁籤中對應的 controlled-inputs-box；
  // 各頁籤可自行收合互不影響；再次點擊「是」會重新展開所有頁籤的事後派獎。
  // 使用 click 事件（而非 change）以涵蓋「再次點擊已選的『是』」情境。
  $(document).on("click", ".main-controlled .toggle-group", function () {
    const $toggle = $(this);
    const $mainControlled = $toggle.closest(".main-controlled");
    const enabledValue = $mainControlled.attr("data-enabled-value");
    if (!$toggle.prop("checked") || $toggle.val() !== enabledValue) return;

    const $scope = $toggle.closest(".tabs-container");
    const $root = $scope.length ? $scope : $(document);

    $root
      .find('.main-controlled[data-enabled-value="' + enabledValue + '"]')
      .closest(".toggle-container")
      .each(function () {
        const $container = $(this);
        const $box = $container.find(".controlled-inputs-box").first();
        if ($box.length === 0 || $box.is(":visible")) return;

        $box.slideDown(300);

        const $trigger = $container
          .find(".main-controlled .collapse-trigger")
          .first();
        if ($trigger.length) {
          if (
            $trigger.hasClass("material-symbols-outlined") &&
            $trigger.text().trim() === "keyboard_arrow_down"
          ) {
            $trigger.text("keyboard_arrow_up");
          }
          $trigger.addClass("active");
        }
      });
  });

  // 初始化時執行一次
  updateToggleContainerInputs();

  // 泛用的收合/展開功能 (Generic Collapse Trigger)
  // 使用方式：為點擊元素加上 .collapse-trigger 類別，並可配置 data-collapse-closest (尋找共用外層) 與 data-collapse-target (需收合的目標)
  // 註：如果這兩個設定都沒填寫，它會預設去尋找同階層（同級兄弟節點）底下帶有 .collapse-content 的區塊。也就是說，這套腳本還內建了一套極簡版的折疊邏輯，讓您懶得寫 data-* 時也能直接用！
  $(document).on("click", ".collapse-trigger", function () {
    const closestSelector = $(this).attr("data-collapse-closest");
    const targetSelector = $(this).attr("data-collapse-target");

    let $target;

    // 判斷是否有給定尋找範圍與目標
    if (closestSelector && targetSelector) {
      $target = $(this).closest(closestSelector).find(targetSelector);
    } else if (targetSelector) {
      $target = $(targetSelector); // 全域搜尋 (例如針對特定 ID)
    } else {
      // 預設 fallback 找同層級底下的 .collapse-content
      $target = $(this).parent().siblings(".collapse-content");
    }

    // 如果找不到目標則忽略
    if (!$target || $target.length === 0) return;

    $target.slideToggle(300);

    // 針對 material 箭頭圖示做方向切換
    if (
      $(this).hasClass("material-symbols-outlined") &&
      $(this).text().trim().includes("keyboard_arrow")
    ) {
      if ($(this).text().trim() === "keyboard_arrow_down") {
        $(this).text("keyboard_arrow_up");
      } else {
        $(this).text("keyboard_arrow_down");
      }
    }
    // 加入反轉狀態，方便開發者套用其他 CSS 動畫 (如 CSS transform)
    $(this).toggleClass("active");
  });

  // 通用切換內容開始 //
  // 以 [data-switch] 標記「範圍容器」，容器內的觸發元件改變時，
  // 顯示 data-switch-case 與目前值相符的區塊，其餘隱藏。
  //   data-switch="radio"  → 觸發元件是容器內 .radio-group 的 radio，值取自 radio 的 value
  //   data-switch="select" → 觸發元件是容器內的 select，值取自 select 的 value
  // 兩者各自獨立、可單獨使用，不需要另一種也存在。
  // 範圍一律以「最近的 [data-switch]」為準，所以整段可以複製貼上多份，
  // 也可以巢狀（select 區塊內再放 radio 區塊），彼此不會互相影響，
  // 切換區塊不需要取名字或 id。radio 的互斥是交給原生 name，
  // 所以同一頁若有多組 radio 切換，各組的 name 要不同，否則會被當成同一組。
  //
  // 用法：
  // <div data-switch="select">
  //   <select>...<option value="a">A</option>...</select>
  //   <div data-switch-case="a" style="display: none;">...</div>
  // </div>

  // 判斷元素是否「直屬」於這個範圍容器。
  // 中間若還隔著另一個 [data-switch] 或 [data-switch-case]，代表它屬於內層，這層不該管它。
  // （例：切換區塊裡自己的 select 欄位，不可被當成外層的觸發元件）
  function isSwitchMember($el, $scope) {
    return (
      $el.parentsUntil($scope).filter("[data-switch], [data-switch-case]")
        .length === 0
    );
  }

  // 依傳入的值顯示/隱藏這層的切換區塊；值為 null 或沒有相符區塊時全部隱藏
  function updateSwitch($scope, value) {
    $scope.find("[data-switch-case]").each(function () {
      var $case = $(this);
      if (!isSwitchMember($case, $scope)) return; // 內層的區塊交給內層自己處理
      if (value !== null && $case.attr("data-switch-case") === value) {
        $case.show();
      } else {
        $case.hide();
      }
    });
  }

  // 讀取範圍容器目前的值，供初始化使用（找不到觸發元件或尚未選取時回傳 null）
  function getSwitchValue($scope) {
    var isSelect = $scope.attr("data-switch") === "select";
    var $trigger = $scope
      .find(isSelect ? "select" : ".radio-group input[type='radio']")
      .filter(function () {
        return isSwitchMember($(this), $scope);
      });

    if (!$trigger.length) return null;
    if (isSelect) return $trigger.first().val();

    var $checked = $trigger.filter(":checked");
    return $checked.length ? $checked.val() : null;
  }

  // radio 觸發
  $(document).on(
    "change",
    "[data-switch='radio'] .radio-group input[type='radio']",
    function () {
      var $scope = $(this).closest("[data-switch]");
      if ($scope.attr("data-switch") !== "radio") return;
      if (!isSwitchMember($(this), $scope)) return;
      updateSwitch($scope, $(this).val());
    }
  );

  // select 觸發
  $(document).on("change", "[data-switch='select'] select", function () {
    var $scope = $(this).closest("[data-switch]");
    if ($scope.attr("data-switch") !== "select") return;
    if (!isSwitchMember($(this), $scope)) return;
    updateSwitch($scope, $(this).val());
  });

  // 初始化：依 HTML 上的預設狀態決定一開始顯示哪一塊
  $("[data-switch]").each(function () {
    var $scope = $(this);
    updateSwitch($scope, getSwitchValue($scope));
  });
  // 通用切換內容結束 //

  // Tab功能開始
  // Tab切換事件
  $(document).on("click", ".tabs-container .tabs li", function () {
    const index = $(this).index();
    const tabs = $(this).closest(".tabs");
    const tabsContainer = $(this).closest(".tabs-container");
    const contentDivs = tabsContainer.find(".content > div");
    tabs.find("li").removeClass("active");
    $(this).addClass("active");
    contentDivs.removeClass("active");
    const $currentContent = contentDivs.eq(index);
    $currentContent.addClass("active");

    // 此 Tab 內容如果有未初始化的 CKEditor，則執行初始化
    if (typeof window.initAllEditors === "function") {
      if ($currentContent.find(".cke").length === 0) {
        window.initAllEditors(); // 只有在當前 tab 還沒初始化 CKEditor 時才執行
      }
    }
  });

  // Nav Tab（底線頁籤）切換事件
  // 點擊頁籤時，依 data-nav-tab 找到對應的 data-nav-tab-panel 並切換 active
  $(document).on("click", ".nav-tabs-container .nav-tabs > li", function () {
    const $li = $(this);
    const target = $li.data("navTab");
    const $container = $li.closest(".nav-tabs-container");

    // 切換頁籤 active 狀態
    $container.find(".nav-tabs > li").removeClass("active");
    $li.addClass("active");

    // 切換下方內容區塊
    const $panels = $container.find(".nav-tabs-content > .nav-tab-panel");
    $panels.removeClass("active");
    $panels.filter(`[data-nav-tab-panel="${target}"]`).addClass("active");

    // 切換 header 中綁定該頁籤的操作按鈕（如儲存、取消）
    const $tabActions = $container.find("[data-nav-tab-actions]");
    $tabActions.removeClass("active");
    $tabActions.filter(`[data-nav-tab-actions="${target}"]`).addClass("active");
  });

  // 新增Tab按鈕開始 //
  // 點擊新增Tab按鈕
  $(document).on("click", ".add-new-tab", function (e) {
    e.preventDefault();
  });

  // 新增Tab事件
  $(document).on("click", ".add-new-tab", function () {
    const tabs = $(this).closest(".tabs-bar").find(".tabs");
    const tabsContent = $(this).closest(".tabs-container").find(".content");
    const newTabIndex = tabs.find("li").length + 1;

    tabs.append(
      `<li class="active">頁籤${newTabIndex}<span class="material-symbols-outlined fz-md">Cancel</span></li>`,
    );
    tabsContent.append(`<div class="tab${newTabIndex}-content active"></div>`);

    // 移除其他的 active 狀態
    tabs.find("li").not(":last").removeClass("active");
    tabsContent
      .find("div")
      .not(`.tab${newTabIndex}-content`)
      .removeClass("active");

    $(document).trigger("tab-added", [newTabIndex]);

    //判斷是否有事件物件
    const hasToggleGroup = tabsContent.find(".toggle-container").length > 0;

    if (hasToggleGroup) {
      //刷新物件disabled狀態
      updateToggleContainerInputs();
    }
  });

  // 刪除Tab事件
  $(document).on("click", ".tabs li span", function (event) {
    event.stopPropagation();

    const tab = $(this).closest("li");
    const tabs = tab.closest(".tabs");
    const tabsContainer = tabs.closest(".tabs-container");
    const tabsContent = tabsContainer.find(".content");
    const romovetabIndex = tab.index();
    const isActiveTab = tab.hasClass("active"); //判斷是否為當前選中的 tab

    const $activeTab = tabsContent.find("div.active");
    var zeroBasedTabIndex = $activeTab.index();

    const confirmDelete = confirm("您確定要刪除此標籤嗎？");
    if (!confirmDelete) return;

    if (tabs.find("li").length > 1) {
      // 移除 tab 和對應的內容 div
      tab.remove();
      tabsContent.children("div").eq(romovetabIndex).remove();

      tabsContent.children("div").each(function (i) {
        const isActive = $(this).hasClass("active");
        const newClass = `tab${i + 1}-content`;
        $(this).attr("class", newClass);
      });

      //如果刪除的是當前 active tab，才把第一個設為 active
      if (isActiveTab) {
        tabs.find("li").removeClass("active").eq(0).addClass("active");
        tabsContent
          .children("div")
          .removeClass("active")
          .eq(0)
          .addClass("active");
      } else {
        if (zeroBasedTabIndex > romovetabIndex) {
          zeroBasedTabIndex--;
        }
        tabsContent
          .children("div")
          .removeClass("active")
          .eq(zeroBasedTabIndex)
          .addClass("active");
      }
      //刪除頁籤後自定義事件，ex:頁籤內容物件排序處理
      $(document).trigger("tab-removed");
    } else {
      alert("至少需要保留一個頁籤");
    }
  });

  // 點擊其他地方移除菜單項
  $(document).on("click", function (e) {
    if (!$(e.target).closest(".add-new-tab").length) {
      $(".add-new-tab .options").removeClass("active");
    }
  });

  // 修改Tab名稱函數
  function changeTabName($tabsContainer) {
    const $activeContent = $tabsContainer.find(".content > div.active");
    const $currentInput = $(document.activeElement); // 獲取當前正在使用的輸入欄位
    const $input = $activeContent.find('input[type="text"]');
    const newTitle = $input.val().trim();

    if (newTitle === "") {
      alert("請輸入有效的頁籤名稱");
      return false;
    }

    // 找到目前 active tab 的 index
    const activeIndex = $activeContent.index();
    const $activeTab = $tabsContainer.find(".tabs li").eq(activeIndex);

    // 保留關閉 icon
    const $closeIcon = $activeTab.find("span");
    $activeTab.html(`${newTitle}`).append($closeIcon);

    // 當點擊修改按鈕或當前輸入欄位有 showToast class 時都會顯示 toastMessage
    const isChangeButton = $currentInput.closest(".changeAction").length > 0;
    if (isChangeButton || $currentInput.hasClass("showToast")) {
      toastMessage("修改成功");
    }

    return true;
  }

  // 修改Tab名稱按鈕點擊事件
  $(document).on("click", ".tabs-container .changeAction", function () {
    const $tabsContainer = $(this).closest(".tabs-container");
    changeTabName($tabsContainer);
  });

  // 監聽所有文字輸入欄位的 Enter 鍵事件
  $(document).on("keypress", "input", function (e) {
    if (e.which === 13) {
      // 當按下 Enter 鍵時 (keyCode 13)
      e.preventDefault(); // 防止表單提交，避免頁面重新載入

      // 尋找最近的 tabs-container 父元素
      const $tabsContainer = $(this).closest(".tabs-container");

      // 檢查是否找到 tabs-container
      // jQuery 的 length 屬性：如果找到元素則 > 0，沒找到則為 0
      // 這個檢查確保只有在 tabs-container 內的輸入欄位才會觸發修改頁籤名稱的功能
      if ($tabsContainer.length) {
        changeTabName($tabsContainer); // 執行修改頁籤名稱的函數
      }
      // 如果不在 tabs-container 內，則不執行任何操作
    }
  });
  // Tab功能結束

  // 在上傳按鈕右側顯示上傳檔案名稱
  $(".a-upload input[type='file']").on("change", function () {
    var fileInput = $(this)[0];
    var filePath = fileInput.value;
    var fileName = filePath.split("\\").pop(); // 提取檔案名稱
    var allowedExtensions = /(\.txt)$/i; // 允許的檔案格式

    if (fileInput.files && fileInput.files.length > 0) {
      if (allowedExtensions.test(fileName)) {
        $(".fileerrorTip").hide();
        $(".showFileName").text(fileName);
      } else {
        $(".showFileName").text("");
        $(".fileerrorTip").text("檔案類型錯誤！僅支援 txt 格式").show();
      }
    } else {
      $(".showFileName").text("");
      $(".fileerrorTip").text("請選擇檔案！").show();
    }
  });

  // 新增輸入欄(會員資格代碼)
  $(".add-form-modal .add-new-input").on("click", function () {
    const $ul = $(this).siblings("ul");
    // 沿用同一清單第一個輸入框的 placeholder，沒有設定時維持預設「請輸入」
    const placeholder =
      $ul.children("li").first().find("input[type='text']").attr("placeholder") || "請輸入";
    const newLi = $(`
            <li class="mar-ts">
                <input type="text" />
                <span class="material-symbols-outlined delete-btn">Delete</span>
            </li>
        `);
    newLi.find("input").attr("placeholder", placeholder);
    $ul.append(newLi);
  });

  // 刪除單筆欄位（事件委派寫法）
  $(".add-form-modal ul").on("click", ".delete-btn", function () {
    $(this).closest("li").remove();
  });

  // tbody資料列表新增及刪除
  function initDynamicRowHandler(sectionSelector) {
    const $sections = $(sectionSelector); // ex: [data-section^="dynamic-"]

    $sections.each(function () {
      const $section = $(this);
      const $table = $section.closest("table");
      const $templateRow = $section.find(".data-row").first().clone(); // 每個 section 自己抓範本 row

      // 「新增」按鈕可能在 section 內，也可能因樣式/邊框考量被獨立切到 table 外的 .add-button-row 容器內
      // 用 children 而非 find 限縮搜尋範圍，避免誤觸 dual-listbox 等元件的 [data-add-button]
      const $addBtn = $section
        .find("[data-add-button]")
        .add(
          $table.parent().children(".add-button-row").find("[data-add-button]"),
        );

      // 綁定「新增一筆資料」按鈕
      $addBtn.on("click", function () {
        const $newRow = $templateRow.clone();
        $newRow.find("input").not("[type='checkbox'], [type='radio']").val(""); // 清空文字等一般 input 的值
        $newRow
          .find("input[type='checkbox'], input[type='radio']")
          .prop("checked", false); // 重置勾選狀態

        // 新列固定追加至 data-section 對應的 <tbody> 末尾，保持合法 HTML 結構
        $section.append($newRow);
        $section
          .closest("[data-pagination-root]")
          .trigger("pagination:refresh");

        // 觸發自定義事件，讓個別頁面可以實作客製化邏輯 (例如：特定欄位連動或預設禁用)
        $section.trigger("dynamic-row-added", [$newRow]);
      });

      // 綁定刪除一筆的按鈕
      $section.on("click", "[data-action='delete-row']", function () {
        const $row = $(this).closest("tr");
        const $allDataRows = $section.find(".data-row");

        // 僅剩最後一列自訂條件時，無法刪除
        if ($allDataRows.length <= 1) {
          toastMessage("至少需要保留一筆自訂條件，無法刪除。");
          return;
        }

        if (confirm("確定要刪除這筆資料嗎？")) {
          $row.remove();
        }
      });
    });
  }

  // 初始化所有符合規則的區塊
  initDynamicRowHandler('[data-section^="dynamic-"]');

  // // 全域綁定「整批刪除」按鈕事件
  // $('table').on('click', '.btn-delete-all', function () {
  //     // 更精準地找出對應的 tbody（避免影響其他 table）
  //     const $table = $(this).closest('table');
  //     const $tbody = $table.find('tbody[data-section^="dynamic-"]').first();
  //     const $rows = $tbody.find('.data-row');

  //     if ($rows.length === 0) {
  //         toastMessage('已經沒有資料可刪除。');
  //         return;
  //     }

  //     if ($rows.length === 1) {
  //         if (confirm('確定要刪除這筆資料嗎？')) {
  //             $table.remove();
  //         }
  //         return;
  //     }

  //     if (confirm('確定要刪除整批資料嗎？')) {
  //         $table.remove();
  //     }
  // });

  // 呼叫彈窗
  //$.PopupBox.show("該項目目前已被 王曉明 使用中，請稍後再嘗試進行編輯。", "我知道了");

  // 呼叫通知
  // toastMessage("新增成功");

  // 新增可搜尋的下拉選單
  $(function () {
    // 未載入 select2 的頁面（例如 prize-event-* 系列）直接略過。
    // $.fn.select2 不存在時，即使頁面上沒有任何 .select2-search 元素，
    // 呼叫 .select2() 一樣會丟 TypeError，所以要先擋掉。
    if (typeof $.fn.select2 !== "function") return;

    // 必須在 .select2() 之前「同步」執行完畢，原因見函式上方說明
    patchSelect2DropdownFlipBack();

    $(".select2-search").select2({
      width: "100%",
    });
  });

  // 修正 select2 下拉選單「翻到上方後回不來」的問題。
  //
  // 【原生問題】AttachBody._positionDropdown 判斷方向時，兩邊條件不對稱：
  //     往上翻   → 檢查「下方空間不夠 且 上方空間夠」
  //     翻回下方 → 檢查「上方空間不夠 且 下方空間夠」  ← 這裡看錯邊了
  //   所以捲動讓下方空間變足夠時，只要上方空間也還夠，就永遠不會翻回下方。
  //   再加上關閉選單時 _hideDropdown 只做 detach()、不會清掉 select2-dropdown--above，
  //   造成選單一旦翻到上面就固定住，連關掉重開都救不回來。
  //
  // 【作法】在 _positionDropdown 外包一層：當「目前朝上、而且下方空間已足夠」時，
  //   先清掉方向 class 再交給原生邏輯——原生看到沒有方向 class 就會重新判定為 below。
  //   不改寫定位計算本身，也不需要動到 select2.min.js。
  //
  // 【務必用字串形式的 require】select2 內建的 almond loader：
  //     require("模組名")        → 同步回傳模組
  //     require(["模組名"], cb)  → setTimeout(cb, 4)，非同步！
  //   本修正必須趕在 .select2() 之前完成，因為 Utils.Decorate 是用
  //   「var n = i.prototype[e]」的閉包，在裝飾當下就把方法引用抓走，
  //   而裝飾正是發生在每次 .select2() 呼叫時。用陣列形式會晚 4ms 才套用，
  //   等於完全無效而且不會報任何錯（曾經踩過這個坑，勿改回陣列形式）。
  function patchSelect2DropdownFlipBack() {
    // 已經翻到上方後，需多出這個距離才翻回下方，
    // 避免捲動到臨界點時選單上下反覆跳動（同 tooltip.js 的 FLIP_HYSTERESIS 作法）
    const FLIP_HYSTERESIS = 24;

    const amd = $.fn.select2.amd;
    if (!amd || typeof amd.require !== "function") {
      console.warn("[select2] 找不到 amd.require，下拉方向修正未套用");
      return;
    }

    // 針對 select2 內部模組，若日後版本改了模組結構這裡會丟錯。
    // 本函式跑在 .select2() 之前，例外若往外丟會連帶讓選單整個沒初始化，
    // 所以攔下來只記警告——最差是回到原本「翻上去就固定住」的行為。
    let proto;
    try {
      proto = amd.require("select2/dropdown/attachBody").prototype;
    } catch (e) {
      console.warn("[select2] 取不到 attachBody 模組，下拉方向修正未套用", e);
      return;
    }

    if (!proto || typeof proto._positionDropdown !== "function") {
      console.warn("[select2] attachBody 結構非預期，下拉方向修正未套用");
      return;
    }

    // 避免本檔被重複載入時疊加多層包裝
    if (proto._positionDropdown.flipBackPatched) return;

    const originalPositionDropdown = proto._positionDropdown;

    function positionDropdownWithFlipBack() {
      const $dropdown = this.$dropdown;

      if ($dropdown.hasClass("select2-dropdown--above")) {
        const $window = $(window);
        const containerBottom =
          this.$container.offset().top + this.$container.outerHeight(false);
        const viewportBottom = $window.scrollTop() + $window.height();
        const dropdownHeight = $dropdown.outerHeight(false);
        const enoughRoomBelow =
          viewportBottom > containerBottom + dropdownHeight + FLIP_HYSTERESIS;

        if (enoughRoomBelow) {
          $dropdown.removeClass(
            "select2-dropdown--above select2-dropdown--below",
          );
          this.$container.removeClass(
            "select2-container--above select2-container--below",
          );
        }
      }

      originalPositionDropdown.apply(this, arguments);
    }

    // 在 console 打這行可確認修正是否生效（應回傳 true）：
    // $.fn.select2.amd.require("select2/dropdown/attachBody")
    //   .prototype._positionDropdown.flipBackPatched
    positionDropdownWithFlipBack.flipBackPatched = true;
    proto._positionDropdown = positionDropdownWithFlipBack;
  }

  // ===== Multiple Checkbox 三態邏輯（使用 indeterminate） =====
  // 更新全選 checkbox 的狀態（空、checked、或 indeterminate）
  function updateSelectAllCheckboxState($group) {
    const $selectAll = $group.find(".mul-checkbox-selectall");
    const $items = $group.find(".mul-checkbox-item:not(:disabled)");
    const $checkedItems = $items.filter(":checked");

    const totalItems = $items.length;
    const checkedCount = $checkedItems.length;

    // 重置狀態
    $selectAll.prop("checked", false).prop("indeterminate", false);

    if (checkedCount === 0) {
      // 未選：空狀態（什麼都不做）
    } else if (checkedCount === totalItems) {
      // 全選：checked 狀態
      $selectAll.prop("checked", true).prop("indeterminate", false);
    } else {
      // 部分選中：indeterminate 狀態（一槓）
      $selectAll.prop("checked", false).prop("indeterminate", true);
    }
  }

  // 初始化所有 mul-checkbox-group
  $(document).ready(function () {
    $(".mul-checkbox-group").each(function () {
      updateSelectAllCheckboxState($(this));
    });
  });

  // 綁定子項目 checkbox 的 change 事件
  $(document).on("change", ".mul-checkbox-item", function () {
    const $group = $(this).closest(".mul-checkbox-group");
    updateSelectAllCheckboxState($group);
  });

  // 綁定全選 checkbox 的 change 事件
  $(document).on("change", ".mul-checkbox-selectall", function () {
    const $group = $(this).closest(".mul-checkbox-group");
    const $items = $group.find(".mul-checkbox-item:not(:disabled)");

    // 清除 indeterminate 狀態
    $(this).prop("indeterminate", false);

    // 根據全選狀態設定所有子項目
    const isChecked = $(this).is(":checked");
    $items.prop("checked", isChecked);
  });
  // ===== Multiple Checkbox 三態邏輯（使用 indeterminate） =====
});

//[建新撰寫] 表單的checkbox與radio連動，只有點選到checkbox才會啟用radio與text。
$(document).ready(function () {
  function updateRowInputStatus(row) {
    const checkbox = row.find("input[type='checkbox']");
    const radio = row.find("input[type='radio']");
    const textInput = row.find("input[type='text']");
    const isChecked = checkbox.prop("checked");
    radio.prop("disabled", !isChecked);
    textInput.prop("disabled", !isChecked);
  }

  // 初始化：對所有現有列套用狀態
  $("tbody[data-section='dynamic-preRegister'] tr").each(function () {
    updateRowInputStatus($(this));
  });

  // 事件委派：對動態新增的列也有效
  $("tbody[data-section='dynamic-preRegister']").on(
    "change",
    "input[type='checkbox']",
    function () {
      const row = $(this).closest("tr");
      updateRowInputStatus(row);
    },
  );

  // 監聽通用函數的新增列事件，套用這頁專屬的邏輯
  $("tbody[data-section='dynamic-preRegister']").on(
    "dynamic-row-added",
    function (e, $newRow) {
      // 確保所有列的 radio 共用同一個 name，整個表格僅能單選
      $newRow.find("input[type='radio']").attr("name", "choose-one");
      // 套用連動狀態 (剛新增時 checkbox 未勾選，故 text/radio 皆設為 disabled)
      updateRowInputStatus($newRow);
    },
  );

  // 複製頁籤內容功能
  $(document).on("click", ".copy-tab-btn", function () {
    const $tabsContainer = $(this).closest(".tabs-container");
    const $currentContent = $(this).closest(".content").children("div.active");
    const $tabsList = $tabsContainer.find(".tabs-bar .tabs");

    // 基於目前總頁籤數量來定義新的編號
    const newIndex = $tabsContainer.find(".content > div").length + 1;
    const newTabClass = "tab" + newIndex + "-content";
    const newTabName = "群組" + newIndex;

    // 建立並插入新頁籤的標題
    const $newLi = $("<li>")
      .text(newTabName)
      .append('<span class="material-symbols-outlined fz-md">Cancel</span>');

    $tabsList.find("li").removeClass("active");
    $newLi.addClass("active");
    $tabsList.append($newLi);

    // 深層複製整個內容區塊
    const $newContent = $currentContent.clone(false);

    // 清除舊的頁籤 Class (例如 tab1-content)，替換為新的命名
    $newContent.removeClass(function (index, className) {
      return (className.match(/(^|\s)tab\S+/g) || []).join(" ");
    });
    $newContent.addClass(newTabClass + " active");

    // 取得所有輸入元件，確保能正確搬移現有的填寫數值
    const originalInputs = $currentContent.find("input, select, textarea");
    const clonedInputs = $newContent.find("input, select, textarea");

    // 產生一個防混亂後綴，用來避免 Radio Input 的群組在多個頁籤間互相衝突
    const uniqueSuffix = "_copy" + new Date().getTime();

    originalInputs.each(function (i) {
      const type = this.type || this.tagName.toLowerCase();
      const $clonedInput = clonedInputs.eq(i);

      if (type === "checkbox" || type === "radio") {
        // 複製選取狀態
        $clonedInput.prop("checked", $(this).prop("checked"));
        if ($(this).prop("indeterminate")) {
          $clonedInput.prop("indeterminate", true);
        }
        // 重新指派 name 以避免切換 Radio 時取消到其他頁籤的選項
        if (type === "radio") {
          const nameAttr = $(this).attr("name");
          if (nameAttr) {
            $clonedInput.attr("name", nameAttr + uniqueSuffix);
          }
        }
      } else {
        // 複製一般文字或下拉選單的值
        $clonedInput.val($(this).val());
      }
    });

    // ======== 客製化移除邏輯 ========
    // 依據規則：「事後派獎的邏輯不變，第一個頁籤的開關要能控制後面所有的開關，且此處的該關不會被複製到新的頁籤中」
    // 在數值搬移完成後，將複製出來的新頁籤中的 .main-controlled 主要開關拿掉
    $newContent.find(".main-controlled .radio-group").remove();

    // 「語系」不複製：清空新頁籤內所有 [data-lang-multiselect] 的選取狀態
    // 包含：所有 checkbox 取消勾選並解除 disabled、移除跨頁籤標記、清空 hidden / tags、回復 trigger 文字
    $newContent.find("[data-lang-multiselect]").each(function () {
      const $module = $(this);
      $module
        .find('.search-checkbox-panel input[type="checkbox"]')
        .prop("checked", false)
        .prop("indeterminate", false)
        .prop("disabled", false)
        .removeAttr("data-cross-tab");
      $module.find('input[type="hidden"]').val("");
      $module.find(".search-checkbox-tags").empty();
      // 回復 trigger 文字為原本的 placeholder（例如「點擊選擇語系」）
      const $triggerText = $module.find(".search-checkbox-trigger > span");
      const placeholder = $triggerText.attr("data-placeholder");
      if (placeholder) {
        $triggerText.text(placeholder);
      }
    });

    // 「活動詳情」CKEditor 不能直接被 clone 複製：
    // clone 過來的 .cke UI 只是死掉的 HTML（沒有真正的 CKEDITOR instance），iframe 也是空的；
    // 而且 .editor 元素的 id 與 ckeditor-initialized class 跟原本重複，
    // 會讓 initAllEditors 把它跳過，無法為新頁籤建一份 instance；
    // 殘留在 .cke UI 上的 inline onclick 還會用同一個 id 反查到「原本」那顆 instance
    // （所以按「最大化」會看到原始頁籤的內容並對其操作）。
    // 處理方式：先把來源編輯器的內容讀出來，移除 clone 中的 .cke 殭屍 UI，
    // 重設 .editor 元素（去 id、去 ckeditor-initialized、去 inline style），把內容寫回，
    // 等新頁籤 append 後再重跑 initAllEditors() 為新元素建立全新 instance。
    const $sourceEditors = $currentContent.find(".editor");
    const $clonedEditors = $newContent.find(".editor");
    $sourceEditors.each(function (idx) {
      const sourceId = this.id;
      const sourceInstance =
        typeof CKEDITOR !== "undefined" &&
        sourceId &&
        CKEDITOR.instances[sourceId]
          ? CKEDITOR.instances[sourceId]
          : null;
      const data = sourceInstance ? sourceInstance.getData() : "";

      const $cloned = $clonedEditors.eq(idx);
      // 移除 clone 出來的 CKEditor 殭屍 UI（與 .editor 同層、class 含 cke 的節點）
      $cloned.siblings('[class*="cke"]').remove();
      // 重設 .editor 元素本身
      $cloned
        .removeAttr("id")
        .removeClass("ckeditor-initialized")
        .removeAttr("style")
        .html(data);
    });

    // 針對新的頁籤內容，自動將最上方的「頁籤群組名稱」更新為新建立的預設名稱
    $newContent.find("input[type='text']").first().val(newTabName);

    // 先將新頁籤 append 至 DOM，再切換 active
    // 注意：tab 切換機制是透過 class="active" 控制顯示/隱藏，
    // 絕不能使用 .hide()，否則 inline style 會覆蓋 CSS class 導致內容永遠隱藏
    $tabsContainer.find(".content").append($newContent);
    $tabsContainer
      .find(".content > div")
      .not($newContent)
      .removeClass("active");
    $newContent.addClass("active");

    // 觸發新增事件並重整綁定狀態
    $(document).trigger("tab-added", [newIndex]);
    if (typeof updateToggleContainerInputs === "function") {
      updateToggleContainerInputs();
    }

    // 為新頁籤裡乾淨的 .editor 元素建立全新的 CKEditor instance
    if (typeof window.initAllEditors === "function") {
      window.initAllEditors();
    }

    // 若有匯入提示工具，則觸發提示
    if (typeof showToastMessage === "function") {
      showToastMessage("已成功複製內容並新增頁籤");
    }
  });
});
