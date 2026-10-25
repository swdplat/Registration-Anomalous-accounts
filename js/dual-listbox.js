// dual-listbox

$(document).ready(function(){

    let currentDualListbox = null;
    let lastSelectedIndex = null;

    function updateCounters(currentDualListbox) {
        // 左側計數器
        let $unsetItems = currentDualListbox.find('.unset-wrapper ul li');
        let unsetSelectedCount = $unsetItems.filter('.selected').length;
        let unsetTotalCount = $unsetItems.length;
        currentDualListbox.find('.unset-counter').text(`已選${unsetSelectedCount}/${unsetTotalCount}`);

        // 右側計數器
        let $setItems = currentDualListbox.find('.set-wrapper ul li');
        let setSelectedCount = $setItems.filter('.selected').length;
        let setTotalCount = $setItems.length;
        currentDualListbox.find('.set-counter').text(`已選${setSelectedCount}/${setTotalCount}`);
    }

    // Shift複選功能
    $(document).on('click', '.dual-listbox-container .unset-wrapper li, .dual-listbox-container .set-wrapper li', function (e) {
        currentDualListbox = $(this).closest('.dual-listbox-container');
        if (currentDualListbox.hasClass('disabled')) return;
        let $listItems = $(this).parent().children('li:visible');  // 只選取可見的項目
        let currentIndex = $listItems.index(this);
        if (e.shiftKey && lastSelectedIndex !== null) {
            let start = Math.min(lastSelectedIndex, currentIndex);
            let end = Math.max(lastSelectedIndex, currentIndex);
            $listItems.slice(start, end + 1).addClass('selected');
        } else {
            $(this).toggleClass('selected');
        }
        lastSelectedIndex = currentIndex;
        updateCounters(currentDualListbox);
    });

    // 鎖定狀態
    function isDisabled($element) {
        return $element.closest('.dual-listbox-container').hasClass('disabled');
    }

    // 動態篩選函式
    function filter(inputElement) {
        let searchValue = $(inputElement).val().toLowerCase();
        let $listItems = $(inputElement).parent().parent().find('ul li');
        $listItems.each(function () {
            let itemText = $(this).text().toLowerCase();
            if (itemText.includes(searchValue)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    }
    
    // 可供選擇的項目的搜尋結果
    $(document).on('input', '.unset-wrapper .searchbar input[type="search"]', function () {
        if (isDisabled($(this))) return;
        filter(this);
    });

    // 已選擇的項目的搜尋結果
    $(document).on('input', '.set-wrapper .searchbar input[type="search"]', function () {
        if (isDisabled($(this))) return;
        filter(this);
    });

    // 當任一層 set-wrapper 被清空，自動將後面所有 dual-listbox-container disable
    function disableFollowingContainers($currentDualListbox) {
        let $wrap = $currentDualListbox.closest('.listbox-wrap');
        let $allContainers = $wrap.find('.dual-listbox-container');
        let idx = $allContainers.index($currentDualListbox);
        if (idx !== -1 && idx < $allContainers.length - 1) {
            for (let i = idx + 1; i < $allContainers.length; i++) {
                $allContainers.eq(i).addClass('disabled');
                $allContainers.eq(i).find('.searchbar input, button').prop('disabled', true);
            }
        }
    }

    // 監聽 set-wrapper 內容變化（移動、清除等動作後觸發）
    function checkAndDisableFollowing(currentDualListbox) {
        let setCount = currentDualListbox.find('.set-wrapper ul li').length;
        if (setCount === 0) {
            disableFollowingContainers(currentDualListbox);
        }
    }

    // 移動函式
    function moveItems(currentDualListbox, setType, isAll) {
        let currentWrapper = setType === 'set' ? 'unset-wrapper' : 'set-wrapper';
        let targetWrapper = setType === 'set' ? 'set-wrapper' : 'unset-wrapper';
        
        // 檢查當前來源的搜尋欄位是否有值
        let $currentSearchInput = currentDualListbox.find(`.${currentWrapper} .searchbar input[type="search"]`);
        let hasSearchValue = $currentSearchInput.val().trim() !== '';
        
        // 根據是否有搜尋值和是否是全選來決定要選取的項目
        let $items;
        if (isAll) {
            // 如果有搜尋值，只選取可見的項目
            if (hasSearchValue) {
                $items = currentDualListbox.find(`.${currentWrapper} ul li:visible`);
            } else {
                // 沒有搜尋值，選取全部項目
                $items = currentDualListbox.find(`.${currentWrapper} ul li`);
            }
        } else {
            // 非全選時保持原有邏輯
            $items = currentDualListbox.find(`.${currentWrapper} ul li.selected`);
        }
        
        if ($items.length === 0) {
            alert(isAll ? '沒有可移動的項目' : '請先選擇一個項目');
            return;
        }

        // 取得目標區塊 searchbar 的搜尋值
        let $targetSearchInput = currentDualListbox.find(`.${targetWrapper} .searchbar input[type="search"]`);
        let searchValue = $targetSearchInput.val() ? $targetSearchInput.val().toLowerCase() : '';

        $items.each(function () {
            $(this).removeClass('selected');
            // 比對搜尋值，決定顯示或隱藏
            if (searchValue === '' || $(this).text().toLowerCase().includes(searchValue)) {
                $(this).show();
            } else {
                $(this).hide();
            }
            currentDualListbox.find(`.${targetWrapper} ul`).append($(this));
        });
        updateCounters(currentDualListbox);

        // 只控制同一個 listbox-wrap 內的 dual-listbox-container
        let $wrap = currentDualListbox.closest('.listbox-wrap');
        let $allContainers = $wrap.find('.dual-listbox-container');
        let idx = $allContainers.index(currentDualListbox);

        // 若有下一層 dual-listbox-container，根據 set-wrapper 是否有資料決定啟用
        if (idx !== -1 && idx < $allContainers.length - 1) {
            let $next = $allContainers.eq(idx + 1);
            // 只有當 set-wrapper 有項目才開啟
            let setCount = currentDualListbox.find('.set-wrapper ul li').length;
            if (setType === 'set') {
                if (setCount > 0) {
                    $next.removeClass('disabled');
                    $next.find('.searchbar input, button').prop('disabled', false);
                } else {
                    // 清空時將後面全部 disable
                    disableFollowingContainers(currentDualListbox);
                }
            }
            // 若 setType 為 unset，且 set-wrapper 沒有項目，則關閉下一個
            if (setType === 'unset' && setCount === 0) {
                disableFollowingContainers(currentDualListbox);
            }
        }
    }

    // 單一移動
    $(document).on('click', '.control-wrapper .set, .control-wrapper .unset', function () {
        currentDualListbox = $(this).closest('.dual-listbox-container');
        if (currentDualListbox.hasClass('disabled')) return;
        let setType = $(this).hasClass('set') ? 'set' : 'unset';
        moveItems(currentDualListbox, setType, false);
    });

    // 全部移動
    $(document).on('click', '.control-wrapper .set-all, .control-wrapper .unset-all', function () {
        currentDualListbox = $(this).closest('.dual-listbox-container');
        if (currentDualListbox.hasClass('disabled')) return;
        let setType = $(this).hasClass('set-all') ? 'set' : 'unset';
        moveItems(currentDualListbox, setType, true);
    });

    // 解除鎖定
    $(document).on('change', '.switch-dual-listbox', function () {
        let isChecked = $(this).prop("checked");
        const dualListbox = $(this).closest('.field').next('.dual-listbox-container');
        if (isChecked) {
            dualListbox.removeClass('disabled');
            dualListbox.find('.searchbar input').prop('disabled', false);
            dualListbox.find('button').prop('disabled', false);
            // 顯示 trailing-element button（依照 toggleClearButton 控制是否顯示）
            toggleClearButton(dualListbox);
        } else {
            dualListbox.addClass('disabled');
            dualListbox.find('.searchbar input').prop('disabled', true);
            dualListbox.find('button').prop('disabled', true);
            dualListbox.find('li').removeClass('selected');
            // 隱藏 trailing-element button
            dualListbox.find('.searchbar .trailing-element button').hide();
        }
    });

    // 解除鎖定（依 listbox-wrap 控制，不同區塊互不影響，支援多個 dual-listbox-container）
    $(document).on('change', '.switch-dual-listbox', function () {
        let isChecked = $(this).prop("checked");
        let $wrap = $(this).closest('.listbox-wrap');
        let $allContainers = $wrap.find('.dual-listbox-container');

        if (isChecked) {
            // 啟用第一層
            $allContainers.eq(0).removeClass('disabled');
            $allContainers.eq(0).find('.searchbar input, button').prop('disabled', false);

            // 依序判斷每一層 set-wrapper 是否有值，決定下一層啟用/禁用
            for (let i = 1; i < $allContainers.length; i++) {
                let prevSetCount = $allContainers.eq(i - 1).find('.set-wrapper ul li').length;
                if (prevSetCount > 0) {
                    $allContainers.eq(i).removeClass('disabled');
                    $allContainers.eq(i).find('.searchbar input, button').prop('disabled', false);
                } else {
                    $allContainers.eq(i).addClass('disabled');
                    $allContainers.eq(i).find('.searchbar input, button').prop('disabled', true);
                }
            }
            // 顯示 trailing-element button（依照 toggleClearButton 控制是否顯示）
            $allContainers.each(function () {
                toggleClearButton($(this));
            });
        } else {
            // 全部禁用，但不清空資料
            $allContainers.addClass('disabled');
            $allContainers.find('.searchbar input, button').prop('disabled', true);
            $allContainers.find('li.selected').removeClass('selected');
            // 隱藏 trailing-element button
            $allContainers.find('.searchbar .trailing-element button').hide();
        }
    });

    // 動態顯示/隱藏「清除」按鈕
    function toggleClearButton($dualListbox) {
        // 左側
        var $unsetSelected = $dualListbox.find('.unset-wrapper ul li.selected');
        var $unsetClearBtn = $dualListbox.find('.unset-wrapper .searchbar [data-add-button]');
        if ($unsetSelected.length > 0) {
            $unsetClearBtn.show();
        } else {
            $unsetClearBtn.hide();
        }
        // 右側
        var $setSelected = $dualListbox.find('.set-wrapper ul li.selected');
        var $setClearBtn = $dualListbox.find('.set-wrapper .searchbar [data-add-button]');
        if ($setSelected.length > 0) {
            $setClearBtn.show();
        } else {
            $setClearBtn.hide();
        }
    }

    // 初始化時隱藏
    $('.dual-listbox-container').each(function () {
        $(this).find('.unset-wrapper .searchbar [data-add-button]').hide();
        $(this).find('.set-wrapper .searchbar [data-add-button]').hide();
    });

    // 每次選擇變動時觸發
    $(document).on('click', '.dual-listbox-container .unset-wrapper li, .dual-listbox-container .set-wrapper li', function () {
        var $dualListbox = $(this).closest('.dual-listbox-container');
        setTimeout(function() {
            toggleClearButton($dualListbox);
        }, 0);
    });

    // 點擊清除按鈕時，取消所有選取
    $(document).on('click', '.dual-listbox-container .searchbar [data-add-button]', function () {
        var $dualListbox = $(this).closest('.dual-listbox-container');
        var $wrapper = $(this).closest('.unset-wrapper, .set-wrapper');
        $wrapper.find('ul li.selected').removeClass('selected');
        toggleClearButton($dualListbox);
        // 更新計數器
        updateCounters($dualListbox);
    });

    // 點擊 control-wrapper 任一按鈕時，重新檢查清除按鈕顯示
    $(document).on('click', '.dual-listbox-container .control-wrapper button', function () {
        var $dualListbox = $(this).closest('.dual-listbox-container');
        setTimeout(function() {
            toggleClearButton($dualListbox);
        }, 0);
    });

    //「初始化」每個 dual-listbox-container 的計數器正確顯示（例如頁面剛載入時）
    $('.dual-listbox-container').each(function () {
        updateCounters($(this));
    });
    
    // 監聽所有 listbox-wrap 內的 input（不限 checkbox/radio/text...）變動時，更新所有 dual-listbox-container 的計數器
    $(document).on('change', '.listbox-wrap input', function () {
        let $wrap = $(this).closest('.listbox-wrap');
        $wrap.find('.dual-listbox-container').each(function () {
            updateCounters($(this));
        });
    });
});