(function ($) {
    var defaults = {
        btnName: "關閉"
    };

    if ($.PopupBox) return;

    $.PopupBox = {
        // 顯示彈窗
        show: function (msg, btnText) {
            // 如果彈窗尚未存在，創建它
            if ($(".popup-container").length === 0) {
                var $box = $('<div class="popup-container" style="display:none;"></div>');
                var $content = $(
                    `<div class="popup">
                        <div class="msg"><p></p></div>
                        <button class="btn">${defaults.btnName}</button>
                    </div>`
                );
                var $overlay = $('<div class="overlay"></div>');
                $box.append($content).append($overlay);
                $(document.body).append($box);
            }

            // 更新消息內容
            if (msg) {
                $(".popup .msg p").text(msg);
            }

            // 更新按鈕文字（如果提供了自定義文字）
            $(".popup .btn").text(btnText || defaults.btnName);

            // 綁定關閉事件
            $(".popup-container .btn, .popup-container .overlay").off('click').on('click', function () {
                $.PopupBox.hide();
            });

            // 顯示彈窗
            $(".popup-container").stop(true, true).fadeIn();
        },

        // 隱藏彈窗
        hide: function () {
            $(".popup-container").stop(true, true).fadeOut();
        }
    };
})(jQuery);
