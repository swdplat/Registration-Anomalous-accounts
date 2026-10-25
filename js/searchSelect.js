// searchSelect.js

$(document).ready(function () {

    // 呼叫初始化函式
    initSearchSelect();

    // 初始化
    function initSearchSelect() {
        // 綁定點擊下拉選單事件
        $(document).on('mousedown', '.searchSelect', handleSelectClick);

        // 綁定搜尋框輸入事件
        $(document).on('input', '.searchSelectInput', handleSearchInput);

        // 綁定點擊搜尋結果事件
        $(document).on('click', '.searchSelectResults li', handleResultClick);

        // 點擊其他地方隱藏搜尋框和結果
        $(document).on('click', hideAllSearchFields);
    }

    // 點擊下拉搜尋選單
    function handleSelectClick(e) {
        e.stopPropagation();
        e.preventDefault();
        const $currentSelect = $(this);
        const $searchInput = $currentSelect.siblings('.searchSelectInput');
        const $searchResults = $currentSelect.siblings('.searchSelectResults');
    
        $currentSelect.hide();
        $searchInput.val('').show().focus();
        $searchResults.show();
        renderSearchOptions($currentSelect, $searchInput, $searchResults);
    }

    // 依搜尋框的輸入進行動態篩選
    function handleSearchInput() {
        const $searchInput = $(this);
        const $currentSelect = $searchInput.siblings('.searchSelect');
        const $searchResults = $searchInput.siblings('.searchSelectResults');
        renderSearchOptions($currentSelect, $searchInput, $searchResults);
    }

    // 點擊搜尋列表項目時更新資料來源Option
    function handleResultClick() {
        const $selectedItem = $(this);
        const $field = $selectedItem.closest('.field');
        const $currentSelect = $field.find('.searchSelect');
        const $searchInput = $field.find('.searchSelectInput');
        const $searchResults = $field.find('.searchSelectResults');

        $currentSelect.val($selectedItem.text()).show();
        $searchInput.hide();
        $searchResults.hide();
    }

    // 隱藏所有搜尋框和結果的邏輯
    function hideAllSearchFields(e) {
        if (!$(e.target).closest('.field').length) {
            $('.searchSelectInput').hide();
            $('.searchSelectResults').hide();
            $('.searchSelect').show();
        }
    }

    // 渲染所有選項的邏輯
    function renderSearchOptions($select, $searchInput, $searchResults) {
        let searchQuery = $searchInput.val() ? $searchInput.val().toLowerCase() : '';
        let $options = $select.find('option');
        $searchResults.empty();
        $options.each(function () {
            let optionText = $(this).text().toLowerCase();
            if (!searchQuery || optionText.indexOf(searchQuery) > -1) {
                $searchResults.append(`<li data-value="${$(this).val()}">${$(this).text()}</li>`);
            }
        });
    }

});