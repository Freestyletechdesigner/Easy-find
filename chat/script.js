const messageForm = document.querySelector(".message-input");
const messageInput = document.querySelector(".message-input input");
const messagesContainer = document.querySelector(".messages");

const conversations = document.querySelectorAll(".conversation");
const searchInput = document.querySelector(".search-box input");

const themeSwitch = document.querySelector(".switch input");

const navItems = document.querySelectorAll(".nav-item");

const sidebar = document.querySelector(".sidebar");
const conversationPanel = document.querySelector(".conversation-panel");

const backButton = document.querySelector(".back-button");

const newChatButton = document.querySelector(".new-chat");

const attachmentButton =
    document.querySelector(".attachment-button");

const emojiButton =
    document.querySelector(".emoji-button");

const userMenu =
    document.querySelector(".user-menu");

const chatActionButtons =
    document.querySelectorAll(".chat-actions button");

const tabletMenuButton =
    document.querySelector(".tablet-menu-button");


/* ==========================================
   SEND MESSAGE
========================================== */

messageForm.addEventListener("submit", function (event) {

    event.preventDefault();

    const text = messageInput.value.trim();

    if (!text) {
        return;
    }

    createMessage(text);

    messageInput.value = "";

    scrollToBottom();
});


/* ==========================================
   CREATE MESSAGE
========================================== */

function createMessage(text) {

    const message = document.createElement("div");

    message.classList.add(
        "message",
        "sent"
    );

    const bubble =
        document.createElement("div");

    bubble.classList.add(
        "message-bubble"
    );

    const paragraph =
        document.createElement("p");

    paragraph.textContent = text;

    const time =
        document.createElement("span");

    time.classList.add(
        "message-time"
    );

    time.innerHTML = `
        ${getCurrentTime()}
        <i class="fa-solid fa-check-double"></i>
    `;

    bubble.appendChild(paragraph);
    bubble.appendChild(time);

    message.appendChild(bubble);

    messagesContainer.appendChild(message);
}


/* ==========================================
   CURRENT TIME
========================================== */

function getCurrentTime() {

    const now = new Date();

    return now.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
    });
}


/* ==========================================
   ENTER TO SEND
========================================== */

messageInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            messageForm.requestSubmit();
        }

    }
);


/* ==========================================
   SCROLL TO BOTTOM
========================================== */

function scrollToBottom() {

    messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: "smooth"
    });
}


/* ==========================================
   CONVERSATION SELECTION
========================================== */

conversations.forEach(function (conversation) {

    conversation.addEventListener(
        "click",
        function () {

            conversations.forEach(function (item) {

                item.classList.remove("active");

            });

            conversation.classList.add("active");


            /* Remove unread count */

            const unread =
                conversation.querySelector(
                    ".unread-count"
                );

            if (unread) {
                unread.remove();
            }


            /* Open chat on phone */

            if (window.innerWidth <= 850) {

                conversationPanel.classList.add(
                    "mobile-hidden"
                );

                messagesContainer.scrollTop =
                    messagesContainer.scrollHeight;
            }

        }
    );

});


/* ==========================================
   SEARCH
========================================== */

searchInput.addEventListener(
    "input",
    function () {

        const value =
            searchInput.value
                .toLowerCase()
                .trim();

        conversations.forEach(
            function (conversation) {

                const name =
                    conversation
                        .querySelector(
                            ".conversation-name h3"
                        )
                        .textContent
                        .toLowerCase();

                const message =
                    conversation
                        .querySelector(
                            ".conversation-message p"
                        )
                        .textContent
                        .toLowerCase();

                if (
                    name.includes(value) ||
                    message.includes(value)
                ) {

                    conversation.style.display =
                        "flex";

                } else {

                    conversation.style.display =
                        "none";
                }

            }
        );

    }
);

/* ==========================================
   MOBILE + TABLET HAMBURGER MENU
========================================== */

document.addEventListener("click", function (event) {

    const menuButton =
        event.target.closest(".tablet-menu-button");

    if (!menuButton) {
        return;
    }

    const sidebar =
        document.querySelector(".sidebar");

    if (!sidebar) {
        return;
    }

    event.stopPropagation();

    sidebar.classList.toggle("mobile-open");

});


/* ==========================================
   CLOSE SIDEBAR WHEN CLICKING OUTSIDE
========================================== */

document.addEventListener("click", function (event) {

    if (window.innerWidth > 850) {
        return;
    }

    const sidebar =
        document.querySelector(".sidebar");

    const menuButton =
        event.target.closest(".tablet-menu-button");

    if (!sidebar) {
        return;
    }

    if (
        sidebar.classList.contains("mobile-open") &&
        !sidebar.contains(event.target) &&
        !menuButton
    ) {

        sidebar.classList.remove("mobile-open");

    }

});

/* ==========================================
   SIDEBAR NAVIGATION
========================================== */

navItems.forEach(function (item) {

    item.addEventListener(
        "click",
        function () {

            navItems.forEach(
                function (nav) {

                    nav.classList.remove(
                        "active"
                    );

                }
            );

            item.classList.add("active");

        }
    );

});


/* ==========================================
   THEME
========================================== */

themeSwitch.addEventListener(
    "change",
    function () {

        document.body.classList.toggle(
            "light-theme",
            themeSwitch.checked
        );

    }
);


/* ==========================================
   NEW CHAT BUTTON
========================================== */

newChatButton.addEventListener(
    "click",
    function () {

        const username =
            prompt(
                "Enter the username you want to chat with:"
            );

        if (!username || !username.trim()) {
            return;
        }

        alert(
            `Starting a new chat with ${username.trim()}`
        );

    }
);


/* ==========================================
   ATTACHMENT BUTTON
========================================== */

attachmentButton.addEventListener(
    "click",
    function () {

        alert(
            "File attachment will be available when we connect the backend."
        );

    }
);


/* ==========================================
   EMOJI BUTTON
========================================== */

emojiButton.addEventListener(
    "click",
    function () {

        const emoji =
            prompt(
                "Enter an emoji:"
            );

        if (!emoji) {
            return;
        }

        messageInput.value += emoji;

        messageInput.focus();

    }
);


/* ==========================================
   USER MENU
========================================== */

userMenu.addEventListener(
    "click",
    function () {

        alert(
            "Profile menu will be added here."
        );

    }
);


/* ==========================================
   CHAT ACTIONS
========================================== */

chatActionButtons.forEach(
    function (button, index) {

        button.addEventListener(
            "click",
            function () {

                if (index === 0) {

                    messageInput.focus();

                }

                else if (index === 1) {

                    alert(
                        "Voice calling will be connected later."
                    );

                }

                else if (index === 2) {

                    alert(
                        "Video calling will be connected later."
                    );

                }

                else if (index === 3) {

                    alert(
                        "More chat options will be added here."
                    );

                }

            }
        );

    }
);


/* ==========================================
   BACK BUTTON — MOBILE
========================================== */

/* ==========================================
   BACK BUTTON — MOBILE
========================================== */

if (backButton && conversationPanel) {

    backButton.addEventListener("click", function () {

        conversationPanel.classList.remove("mobile-hidden");

    });

}


/* ==========================================
   WINDOW RESIZE
========================================== */

window.addEventListener(
    "resize",
    function () {

        if (window.innerWidth > 850) {

            conversationPanel.classList.remove(
                "mobile-hidden"
            );

        }

    }
);