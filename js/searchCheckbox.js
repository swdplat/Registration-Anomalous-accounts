// searchCheckbox.js

$(document).ready(function () {
    // 初始化 Search Checkbox
    initSearchCheckbox();

    function initSearchCheckbox() {
        // 切換下拉面板
        $(document).on('click', '.search-checkbox-trigger', function (e) {
            e.stopPropagation();
            const $panel = $(this).siblings('.search-checkbox-panel');
            $('.search-checkbox-panel').not($panel).hide();
            $panel.toggle();
        });

        // 點擊外部隱藏面板
        $(document).on('click', function (e) {
            if (!$(e.target).closest('[data-lang-multiselect]').length) {
                $('.search-checkbox-panel').hide();
            }
        });

        // 防止點擊面板內元素時關閉面板
        $(document).on('click', '.search-checkbox-panel', function (e) {
            e.stopPropagation();
        });

        // 全選反選（不影響被其他頁籤佔用而 disabled 的選項）
        $(document).on('change', '.search-checkbox-panel input[data-all]', function () {
            const isChecked = $(this).prop('checked');
            $(this).prop('indeterminate', false);
            const $panel = $(this).closest('.search-checkbox-panel');
            $panel.find('input[data-option]').not(':disabled').prop('checked', isChecked);
            updateSearchCheckboxState($panel.closest('[data-lang-multiselect]'));
            syncLangMultiselects();
        });

        // 單選
        $(document).on('change', '.search-checkbox-panel input[data-option]', function () {
            // 跨頁籤佔位的勾選不應由使用者直接觸發，保險起見略過
            if ($(this).is('[data-cross-tab]')) return;

            const $panel = $(this).closest('.search-checkbox-panel');
            updateSelectAllState($panel);
            updateSearchCheckboxState($panel.closest('[data-lang-multiselect]'));
            syncLangMultiselects();
        });

        // 頁籤新增 / 刪除後重新同步跨頁籤狀態
        $(document).on('tab-added tab-removed', function () {
            syncLangMultiselects();
        });
    }

    // 重新計算單一面板的「全選」 indeterminate / checked 狀態
    // 僅以可選取（非 disabled）的選項為基準
    function updateSelectAllState($panel) {
        const $selectable = $panel.find('input[data-option]').not(':disabled');
        const total = $selectable.length;
        const checked = $selectable.filter(':checked').length;

        const $selectAll = $panel.find('input[data-all]');
        $selectAll.prop('checked', total > 0 && total === checked);
        $selectAll.prop('indeterminate', checked > 0 && checked < total);
    }

    // 更新狀態（隱藏欄位、標籤展示）— 排除跨頁籤的 placeholder
    function updateSearchCheckboxState($module) {
        const $checkedOptions = $module.find('input[data-option]:checked').not('[data-cross-tab]');
        const values = [];
        const labels = [];

        $checkedOptions.each(function () {
            values.push($(this).val());
            labels.push($(this).parent().text().trim().replace('全選', '').trim());
        });

        // 更新隱藏欄位
        $module.find('input[type="hidden"]').val(values.join(','));

        // 更新觸發按鈕文字（僅計算當前頁籤所選，不含被其他頁籤佔用的項目）
        // 用 DOM attribute 儲存 placeholder，這樣經過 .clone() 複製頁籤後仍可取回原本提示文字
        const $triggerText = $module.find('.search-checkbox-trigger > span');
        if ($triggerText.length) {
            if (!$triggerText.attr('data-placeholder')) {
                $triggerText.attr('data-placeholder', $triggerText.text());
            }
            if (values.length > 0) {
                $triggerText.text(`已選${values.length}項`);
            } else {
                $triggerText.text($triggerText.attr('data-placeholder'));
            }
        }

        // 更新標籤展示
        const $tagsContainer = $module.find('.search-checkbox-tags');
        $tagsContainer.empty();

        labels.forEach(label => {
            $tagsContainer.append(`<span class="tag">${label}<i class="material-symbols-outlined remove-tag">close</i></span>`);
        });
    }

    // 將「其他頁籤已選用」的語系，於目前頁籤呈現為 checked + disabled
    function syncLangMultiselects() {
        const $modules = $('[data-lang-multiselect]');
        if ($modules.length <= 1) {
            // 只有一個面板，清掉所有跨頁籤標記即可
            $modules.each(function () {
                clearCrossTabMarks($(this));
                updateSelectAllState($(this).find('.search-checkbox-panel'));
            });
            return;
        }

        // 先收集每個面板「自己」實際選取的值（排除跨頁籤 placeholder）
        const ownPerModule = $modules.map(function () {
            const own = [];
            $(this).find('.search-checkbox-panel input[data-option]:checked')
                .not('[data-cross-tab]')
                .each(function () { own.push($(this).val()); });
            return { el: this, own: own };
        }).get();

        // 重新標記每個面板
        ownPerModule.forEach(function (entry, i) {
            const $module = $(entry.el);
            const $panel = $module.find('.search-checkbox-panel');

            // 1) 先清除舊的跨頁籤標記
            clearCrossTabMarks($module);

            // 2) 蒐集「其他面板」的實際選取值
            const otherValues = new Set();
            ownPerModule.forEach(function (other, j) {
                if (i === j) return;
                other.own.forEach(function (v) { otherValues.add(v); });
            });

            // 3) 將其他面板選用、但本面板未選的選項，標記為 checked + disabled
            const ownSet = new Set(entry.own);
            $panel.find('input[data-option]').each(function () {
                const v = $(this).val();
                if (otherValues.has(v) && !ownSet.has(v)) {
                    $(this)
                        .prop('checked', true)
                        .prop('disabled', true)
                        .attr('data-cross-tab', '1');
                }
            });

            // 4) 重新計算「全選」狀態 + 同步隱藏欄位 / 標籤
            updateSelectAllState($panel);
            updateSearchCheckboxState($module);
        });
    }

    // 清除單一面板上的跨頁籤標記
    function clearCrossTabMarks($module) {
        $module.find('.search-checkbox-panel input[data-option][data-cross-tab]')
            .prop('checked', false)
            .prop('disabled', false)
            .removeAttr('data-cross-tab');
    }

    // 移除單一標籤
    $(document).on('click', '.search-checkbox-tags .remove-tag', function (e) {
        e.stopPropagation();
        const $tag = $(this).closest('.tag');
        const labelText = $tag.text().replace('close', '').trim();
        const $module = $(this).closest('[data-lang-multiselect]');

        $module.find('.search-checkbox-panel input[data-option]').each(function () {
            // 跨頁籤 placeholder 不會出現在 tag 列表中，這裡保險再判斷一次
            if ($(this).is('[data-cross-tab]')) return;
            if ($(this).parent().text().trim() === labelText) {
                $(this).prop('checked', false).trigger('change');
            }
        });
    });

    // 頁面初始化時跑一次（用於頁面已預先勾選某些語系的情境）
    syncLangMultiselects();
});
