// ==UserScript==
// @name         NodeWatch
// @namespace    http://tampermonkey.net/
// @version      4.5.0
// @icon         https://github.com/Shadowkyst/NodeWatch-Fukuro-userscript/raw/master/assets/favicon.webp
// @description  WebSocket listener for fukuro.su, displaying user join/leave events and location analysis results in an overlay and popup. Sorts users in analysis by state (playing/watching). Fix for initial overlay text visibility. Added character copy and return original character feature, with state and move updates, dynamic character list updates, current location for character switch, and fixes for edge cases. + Mute Panel Development
// @author       Shadowkyst
// @match        https://fukuro.su/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * Configuration object to store constants and configurable values.
     */
    const Config = {
        HISTORY_SIZE: 5,
        MESSAGE_TIMEOUT: 5000,
        FADE_OUT_DURATION: 500,
        OVERLAY_Z_INDEX: 1000,
        BUTTON_Z_INDEX: 1000,
        POPUP_Z_INDEX: 1001,
        DEFAULT_OVERLAY_TEXT: "WebSocket Listener Активен",
        ANALYZE_BUTTON_TEXT: "Найти РП",
        ANALYZE_BUTTON_TOOLTIP: "Запустить поиск РП по всем локациям",
        GO_TO_ASTRAL_BUTTON_TEXT: "Астрал",
        GO_BACK_BUTTON_TEXT: "Вернуться",
        NODE_INPUT_PLACEHOLDER: "Node",
        CURRENT_NODE_TEXT_PREFIX: "Вы сейчас в: -",
        ANALYSIS_POPUP_TITLE: "Результаты поиска РП:",
        ANALYSIS_POPUP_NO_USERS: "<p>Нет пользователей в локациях (кроме вас).</p>",
        WEBSocket_CONNECTION_ESTABLISHED: "WebSocket: Соединение установлено",
        WEBSocket_CONNECTION_CLOSED: "WebSocket: Соединение закрыто",
        WEBSocket_CONNECTION_ERROR: "WebSocket: Ошибка соединения",
        USER_JOIN_MESSAGE_PREFIX: "[User Join] ",
        USER_LEFT_MESSAGE_PREFIX: "[User Left] ",
        RETURN_TO_LAST_LOCATION_PREFIX: "Возврат в: ",
        GO_TO_NODE_MESSAGE_PREFIX: "Переход в: ",
        LOCATION_ANALYSIS_ALREADY_RUNNING: "Анализ уже запущен.",
        INITIATOR_ID_NOT_RECEIVED: "Initiator ID не получен. Перезагрузите страницу.",
        WARNING_NO_CURRENT_LOCATION: "Предупреждение: Невозможно скопировать персонажа, не запомнив текущую локацию. Перейдите в другую локацию и вернитесь.",
        WARNING_NODE_INPUT_EMPTY: "Предупреждение: Введите имя Node.",
        GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL: "Перейти в указанную Node",
        GO_TO_NODE_BUTTON_TOOLTIP_BACK: "Вернуться в предыдущую локацию",
        JOKES_BUTTON_TEXT: "Приколы",
        JOKES_BUTTON_TOOLTIP: "Открыть меню приколов",
        JOKE_BUTTON_LIGHT_TEXT: "Свет",
        JOKE_BUTTON_LIGHT_TOOLTIP: "Включить/выключить свет (для прикола)",
        JOKE_BUTTON_LIGHT_ACTIVE_TEXT: "Свет [ВКЛ]",
        JOKE_BUTTON_LIGHT_INACTIVE_TEXT: "Свет",
        WARNING_NO_LAST_LOCATION_FOR_ANALYSIS: "Предупреждение: Невозможно вернуться в последнюю локацию после анализа, так как она не запомнена.",
        JOKE_BUTTON_COPY_TEXT: "Персонажи", // Text for "Copy Character" joke button
        JOKE_BUTTON_COPY_TOOLTIP: "Открыть меню персонажей", // Tooltip for "Copy Character" joke button
        CHARACTERS_MENU_TITLE: "Персонажи на локации:", // Title for characters menu popup
        COPY_CHARACTER_BUTTON_TEXT: "Скопировать", // Button text in character menu
        COPYING_CHARACTER_OVERLAY_MESSAGE: "[Joke]: Копирую персонажа...", // Overlay message when copying character
        CHARACTER_COPY_SUCCESSFUL_OVERLAY: "[Joke]: Персонаж скопирован!", // Overlay message for successful copy
        RETURN_ORIGINAL_CHARACTER_BUTTON_TEXT: "Вернуть себя", // New constant
        RETURN_ORIGINAL_CHARACTER_BUTTON_TOOLTIP: "Вернуть свой изначальный персонаж", // New constant
        WEBSOCKET_INPUT_PLACEHOLDER: "Введите JSON для отправки", // Placeholder для textarea
        WEBSOCKET_SEND_BUTTON_TEXT: "Отправить WS", // Текст кнопки отправки
        WEBSOCKET_SEND_BUTTON_TOOLTIP: "Отправить JSON сообщение через WebSocket", // Подсказка для кнопки
        MUTE_BUTTON_TEXT: "Муты", // Кнопка открытия панели мутов
        MUTE_BUTTON_TOOLTIP: "Открыть панель управления мутами", // Подсказка для кнопки мутов
        MUTE_PANEL_TITLE: "Панель управления мутами:", // Заголовок панели мутов
        MUTE_USER_BUTTON_TEXT: "Мут", // Текст кнопки "Мут" в списке пользователей
        MUTED_USERS_TAB_TEXT: "Замученные", // Текст вкладки "Замученные"
        LOCATION_USERS_TAB_TEXT: "На локации" // Текст вкладки "На локации"
    };

    /**
     * Utility functions for DOM manipulation and styling.
     */
    const Utils = {
        createElement: function(tagName, options = {}) {
            const element = document.createElement(tagName);
            if (options.styles) {
                this.applyStyles(element, options.styles);
            }
            if (options.attributes) {
                for (const key in options.attributes) {
                    element.setAttribute(key, options.attributes[key]);
                }
            }
            if (options.textContent) {
                element.textContent = options.textContent;
            }
            if (options.innerHTML) {
                element.innerHTML = options.innerHTML;
            }
            if (options.className) {
                element.className = options.className;
            }
            return element;
        },
        applyStyles: function(element, styles) {
            Object.assign(element.style, styles);
        }
    };

    /**
     * Script state management object.
     */
    const ScriptState = {
        isAnalyzing: false,
        isTrackingNode: true,
        originalNode: null,
        goToNodeButtonMode: 'astral' ,// 'astral' или 'back'
        locationUsers: {}, // Store users in the current location and their profiles
        mutedUserIds: [] // Список ID замученных пользователей
    };

    const originalWebSocket = window.WebSocket;
    let userMap = {};
    let overlayDiv = null;
    const overlayHistory = [];
    let myInitiatorId = null;
    let isFirstMessage = true;
    let originalUserInitData = null; // To store initial userInit data
    let characterListPopupContent = null;


    // Location Analyzer variables (оставляем только analyzeButton)
    let analyzeButton = null;
    const nodeList = [
        "int_lib", "ext_lib", "ext_aidpost", "int_aidpost", "ext_polyana", "ext_path2", "ext_path", "ext_bathhouse", "ext_washstand", "ext_house_of_un",
        "int_house_of_un", "ext_house_of_sam", "int_house_of_sam", "ext_house_of_nas", "int_house_of_nas", "ext_house_of_el", "int_house_of_el",
        "ext_house_of_mt", "int_house_of_mt", "ext_stage_big", "ext_stage_normal", "ext_backstage", "ext_house_of_sl", "int_house_of_sl", "ext_musclub",
        "int_musclub", "int_musclub_wh", "ext_square", "ext_road", "int_bus", "ext_bus", "ext_camp_entrance", "ext_clubs", "int_clubs", "int_clubs2",
        "ext_dining_hall_away", "ext_dining_hall_near", "int_dining_hall", "int_kitchen", "ext_playground", "int_sporthall", "ext_house_of_dv",
        "int_house_of_dv", "ext_house_of_pa", "int_house_of_pa", "ext_beach", "ext_shower", "ext_boathouse", "ext_boat", "ext_island", "ext_old_camp",
        "int_old_camp", "int_catacombs_enter", "int_catacombs_door", "int_catacombs_living", "int_catacombs_exit", "int_catacombs_hole", "int_mine",
        "int_mine_exit2", "int_mine_exit3", "ext_houses", "ext_admins", "int_admins_path", "int_admins", "int_admins_warehouse", "ext_backdoor",
        "ext_backroad", "ext_backroad2", "ext_dining_hall_backroad", "ext_lake", "ext_bushes", "ext_musclub_close", "ext_tower_gate", "int_tower_inside",
        "ext_tower_top", "ext_warehouse", "int_aidpost_room", "int_female", "int_old_building_room", "int_old_building_room2", "ext_campfire", "ext_sandpit",
        "ext_hideout", "ext_forest_camp", "ext_forest_camp_bar", "ext_forest_camp_scene", "ext_house_of_uv", "int_house_of_uv", "ext_island2",
        "ext_island_polyana", "ext_path3", "ext_pier", "ext_boathouse_alt", "int_boathouse", "int_boathouse_storage", "ext_clubs2", "int_radio",
        "int_theater_club", "ext_tree_house", "int_tree_house", "ext_volley_court", "int_warehouse", "int_bathhouse", "int_catacombs_living2",
        "int_sport_storage", "int_catacombs_lift", "int_catacombs_tunnel", "int_catacombs_tunnel_door", "int_catacombs_tunnel2", "int_catacombs_end",
        "int_catacombs_tunnel_exit", "int_catacombs_tunnel_laboratory", "ext_circle", "ext_busstation", "ext_enroute", "ext_froad", "ext_forest2",
        "ext_pinery", "ext_bunker", "int_bunker"
    ];
    let currentWs = null;
    let analysisPopup = null;
    let lastVisitedNode = null;
    let nodeBeforeRPTest = null;
    let characterListPopup = null; // Popup for character list
    let muteListPopup = null; // Popup for mute list
    let muteListPopupContent = null;


    // New Node Navigation Variables
    let goToNodeButton = null;
    let nodeInput = null;
    let currentNodeDisplay = null;
    let goToNodeContainer = null;

    // Jokes Button and Menu Variables
    let jokesButton = null;
    let jokesMenuContainer = null;
    let jokeButtonLight = null;
    let isLightJokeActive = false;
    let lightJokeIntervalId = null;
    let rpTestResults = {};
    let expectedResponsesCount = 0;
    let isRPTestRunning = false;
    let jokeButtonCopyCharacter = null; // "Скопировать" button
    let muteButton = null; // Кнопка "Муты"


    /**
     * Creates the overlay div to display WebSocket messages.
     */
    function createOverlay() {
        overlayDiv = Utils.createElement('div', {
            attributes: { id: 'websocket-overlay' },
            styles: {
                position: 'fixed',
                top: '10px',
                right: '10px',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '10px',
                borderRadius: '5px',
                zIndex: Config.OVERLAY_Z_INDEX,
                fontFamily: 'sans-serif',
                fontSize: '14px',
                textAlign: 'left',
                maxWidth: '300px',
                overflowWrap: 'break-word',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end'
            },
            textContent: Config.DEFAULT_OVERLAY_TEXT
        });
        document.body.appendChild(overlayDiv);
    }

    /**
     * Clears the initial message from the overlay.
     */
    function clearOverlayInitialMessage() {
        if (overlayDiv) {
            overlayDiv.innerHTML = '';
        }
    }

    /**
     * Updates the overlay with a new message, managing history and fade out.
     * @param {string} messageText - The message to display.
     */
    function addToOverlayHistory(messageText) {
        if (!overlayDiv) {
            createOverlay();
        }
        const messageDiv = Utils.createElement('div', {
            textContent: messageText,
            styles: {
                opacity: '1',
                transition: `opacity ${Config.FADE_OUT_DURATION}ms ease-in-out`
            }
        });
        overlayDiv.appendChild(messageDiv);

        overlayHistory.push(messageDiv);
        if (overlayHistory.length > Config.HISTORY_SIZE) {
            const oldestMessageDiv = overlayHistory.shift();
            if (oldestMessageDiv && overlayDiv.contains(oldestMessageDiv)) {
                overlayDiv.removeChild(oldestMessageDiv);
            }
        }

        setTimeout(() => {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (overlayDiv && overlayDiv.contains(messageDiv)) {
                    overlayDiv.removeChild(messageDiv);
                }
            }, Config.FADE_OUT_DURATION);
        }, Config.MESSAGE_TIMEOUT);
    }


    /**
     * Creates the "Analyze Location" button.
     */
    function createAnalyzeButton() {
        analyzeButton = Utils.createElement('button', {
            attributes: { title: Config.ANALYZE_BUTTON_TOOLTIP },
            textContent: Config.ANALYZE_BUTTON_TEXT,
            styles: {
                position: 'fixed',
                top: '10px',
                left: '10px',
                zIndex: Config.BUTTON_Z_INDEX,
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                border: '1px solid #777',
                padding: '8px 15px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxShadow: '2px 2px 3px rgba(0,0,0,0.3)',
                transition: 'background-color 0.3s ease',
                display: 'none',
                width: '150px'
            }
        });

        analyzeButton.addEventListener('mouseover', () => {
            analyzeButton.style.backgroundColor = 'rgba(70, 70, 70, 0.7)';
        });
        analyzeButton.addEventListener('mouseout', () => {
            analyzeButton.style.backgroundColor = 'rgba(50, 50, 50, 0.6)';
        });
        analyzeButton.addEventListener('click', startRPTestAnalysis);

        document.body.appendChild(analyzeButton);
    }


    /**
     * Creates the analysis results popup element.
     * @param {string} contentHTML - HTML content for the popup.
     * @returns {HTMLDivElement} The popup div element.
     * @private
     */
    function _createPopupElement(contentHTML) {
        return Utils.createElement('div', {
            styles: {
                position: 'fixed',
                top: '50%',
                left: '50%',
                backgroundColor: 'rgba(20, 20, 20, 0.9)',
                color: 'white',
                padding: '20px',
                borderRadius: '10px',
                zIndex: Config.POPUP_Z_INDEX,
                fontFamily: 'sans-serif',
                fontSize: '16px',
                textAlign: 'left',
                maxWidth: '400px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                boxSizing: 'border-box'
            },
            innerHTML: contentHTML
        });
    }

    /**
     * Creates the close icon element for the popup.
     * @returns {HTMLDivElement} The close icon div element.
     * @private
     */
    function _createCloseIcon() {
        return Utils.createElement('div', {
            attributes: { id: 'popup-close-icon' },
            styles: {
                position: 'absolute',
                top: '10px',
                right: '10px',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
                opacity: '0.7'
            },
            innerHTML: `
                <style>
                    #popup-close-icon::before, #popup-close-icon::after {
                        content: '';
                        position: absolute;
                        top: 50%;
                        left: 50%;
                        width: 100%;
                        height: 2px;
                        background-color: white;
                    }
                    #popup-close-icon::before {
                        transform: translate(-50%, -50%) rotate(45deg);
                    }
                    #popup-close-icon::after {
                        transform: translate(-50%, -50%) rotate(-45deg);
                    }
                    #popup-close-icon:hover {
                        opacity: 1;
                    }
                </style>
            `
        });
    }

    /**
     * Appends the close icon to the popup and sets its onclick handler.
     * @param {HTMLDivElement} popupElement - The popup element.
     * @param {HTMLDivElement} closeIconElement - The close icon element.
     * @private
     */
    function _appendCloseIconToPopup(popupElement, closeIconElement) {
        closeIconElement.onclick = closeAnyPopup; // Используем общую функцию закрытия
        popupElement.appendChild(closeIconElement);
    }


    /**
     * Creates and displays the analysis results popup.
     * @param {string} contentHTML - HTML content for the popup.
     */
    function createAnalysisPopup(contentHTML) {
        if (analysisPopup) {
            closeAnyPopup(); // Закрываем любой открытый попап перед открытием нового
        }

        analysisPopup = _createPopupElement(contentHTML);
        const closeIcon = _createCloseIcon();
        _appendCloseIconToPopup(analysisPopup, closeIcon);

        document.body.appendChild(analysisPopup);
        _setupPopupDrag(analysisPopup); // Настройка драг&дроп для попапа
    }

    /**
     * Creates and displays the mute list popup.
     */
    function openMuteListPopup() {
        if (muteListPopup) {
            closeAnyPopup();
            return;
        }

        let muteListHTML = `<h2>${Config.MUTE_PANEL_TITLE}</h2>`;
        muteListHTML += `<div id="mute-list-tabs">
                            <button id="location-users-tab" class="mute-tab active">${Config.LOCATION_USERS_TAB_TEXT}</button>
                            <button id="muted-users-tab" class="mute-tab">${Config.MUTED_USERS_TAB_TEXT}</button>
                         </div>`;
        muteListHTML += `<div id="mute-list-content-container" style="max-height: 300px; overflow-y: auto;">
                            <div id="location-users-content">`;
        muteListHTML += generateLocationUsersListHTML(); // Generate initial content for location users
        muteListHTML += `</div>
                            <div id="muted-users-content" style="display: none;">`;
        muteListHTML += generateMutedUsersListHTML(); // Generate initial content for muted users
        muteListHTML += `</div>
                         </div>`;


        muteListPopup = _createPopupElement(muteListHTML);
        muteListPopupContent = muteListPopup.querySelector('#mute-list-content-container'); // Store content element
        const closeIcon = _createCloseIcon();
        _appendCloseIconToPopup(muteListPopup, closeIcon);
        document.body.appendChild(muteListPopup);
        _setupPopupDrag(muteListPopup); // Настройка драг&дроп для попапа

        // Setup tab switching logic
        const locationUsersTab = muteListPopup.querySelector('#location-users-tab');
        const mutedUsersTab = muteListPopup.querySelector('#muted-users-tab');
        const locationUsersContent = muteListPopup.querySelector('#location-users-content');
        const mutedUsersContent = muteListPopup.querySelector('#muted-users-content');

        locationUsersTab.addEventListener('click', () => {
            locationUsersContent.style.display = 'block';
            mutedUsersContent.style.display = 'none';
            locationUsersTab.classList.add('active');
            mutedUsersTab.classList.remove('active');
        });

        mutedUsersTab.addEventListener('click', () => {
            locationUsersContent.style.display = 'none';
            mutedUsersContent.style.display = 'block';
            mutedUsersTab.classList.add('active');
            locationUsersTab.classList.remove('active');
        });

        rerenderMuteListPopup(); // Ensure content is up-to-date on open
    }


    /**
     * Gets the user ID (UUID) associated with a local_id.
     * @param {string} localId - The local_id of the user.
     * @returns {string|null} The user ID or null if not found.
     */
    function getUserIdByLocalId(localId) {
        for (const userId in ScriptState.locationUsers) {
            if (ScriptState.locationUsers[userId].local_id === localId) {
                return userId;
            }
        }
        return null;
    }

    /**
     * Generates HTML for the list of users currently in the location for the mute panel.
     * @returns {string} HTML string for the location users list.
     */
    function generateLocationUsersListHTML() {
        let usersListHTML = "";
        const usersInLocation = Object.values(ScriptState.locationUsers);
        if (usersInLocation.length === 0) {
            usersListHTML += "<p>Нет других персонажей на локации.</p>";
        } else {
            usersInLocation.forEach(userProfile => {
                if (userProfile.id !== myInitiatorId) { // Exclude current user from the list
                    const isMuted = ScriptState.mutedUserIds.includes(userProfile.id); // Still using id for mute list
                    const muteButtonText = isMuted ? "Замучен" : Config.MUTE_USER_BUTTON_TEXT;
                    const userNameDisplay = isMuted ? `<b>${userProfile.name}</b> <span style="color: orange;">(Замучен)</span>` : `<b>${userProfile.name}</b>`;

                    usersListHTML += `<div style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #555; display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <p style="margin: 0;">${userNameDisplay} (ID: ${userProfile.id}, Local ID: ${userProfile.local_id})</p>
                                        </div>
                                        <div>
                                            <button class="mute-user-button" style="padding: 5px 10px; cursor: pointer;"
                                                    data-user-id="${userProfile.id}"
                                                    ${isMuted ? 'disabled' : ''}>${muteButtonText}</button>
                                        </div>
                                     </div>`;
                }
            });
        }
        return usersListHTML;
    }

    /**
     * Generates HTML for the list of muted users for the mute panel.
     * @returns {string} HTML string for the muted users list.
     */
    function generateMutedUsersListHTML() {
        let mutedUsersListHTML = "";
        if (ScriptState.mutedUserIds.length === 0) {
            mutedUsersListHTML += "<p>Список замученных пользователей пуст.</p>";
        } else {
            ScriptState.mutedUserIds.forEach(userId => {
                const userProfile = ScriptState.locationUsers[userId]; // Get profile by id
                const userName = userProfile ? userProfile.name : userMap[userId] || `ID: ${userId}`; // Fallback to name from userMap or just ID
                const localId = userProfile ? userProfile.local_id : "N/A";

                mutedUsersListHTML += `<div style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #555; display: flex; justify-content: space-between; align-items: center;">
                                         <div>
                                             <p style="margin: 0;"><b>${userName}</b> (ID: ${userId}, Local ID: ${localId}) - <span style="color: orange;">Замучен</span></p>
                                         </div>
                                         <div>
                                             <button class="unmute-user-button" style="padding: 5px 10px; cursor: pointer;"
                                                     data-user-id="${userId}">Снять мут</button>
                                         </div>
                                      </div>`;
            });
        }
        return mutedUsersListHTML;
    }

    /**
     * Re-renders the mute list popup content to update user lists.
     */
    function rerenderMuteListPopup() {
        if (!muteListPopup || !muteListPopupContent) return;

        const locationUsersContentDiv = muteListPopupContent.querySelector('#location-users-content');
        const mutedUsersContentDiv = muteListPopupContent.querySelector('#muted-users-content');

        if (locationUsersContentDiv) {
            locationUsersContentDiv.innerHTML = generateLocationUsersListHTML();
        }
        if (mutedUsersContentDiv) {
            mutedUsersContentDiv.innerHTML = generateMutedUsersListHTML();
        }

        // Re-bind event listeners for new "Mute User" buttons in location users tab
        const muteButtons = muteListPopupContent.querySelectorAll('.mute-user-button');
        muteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const userId = this.getAttribute('data-user-id');
                muteUser(userId);
            });
        });

        // Re-bind event listeners for new "Unmute User" buttons in muted users tab
        const unmuteButtons = muteListPopupContent.querySelectorAll('.unmute-user-button');
        unmuteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const userId = this.getAttribute('data-user-id');
                unmuteUser(userId);
            });
        });
    }


    /**
     * Mutes a user by adding their ID to the mutedUserIds list and updates the popup.
     * @param {string} userId - The ID of the user to mute.
     */
    function muteUser(userId) {
        if (!ScriptState.mutedUserIds.includes(userId)) {
            ScriptState.mutedUserIds.push(userId);
            console.log(`[NodeWatch - Mute Panel]: User ID ${userId} muted.`);
            addToOverlayHistory(`[Mute Panel]: Пользователь ID ${userId} замучен.`);
        } else {
            console.log(`[NodeWatch - Mute Panel]: User ID ${userId} is already muted.`);
            addToOverlayHistory(`[Mute Panel]: Пользователь ID ${userId} уже замучен.`);
        }
        rerenderMuteListPopup();
    }


    /**
     * Unmutes a user by removing their ID from the mutedUserIds list and updates the popup.
     * @param {string} userId - The ID of the user to unmute.
     */
    function unmuteUser(userId) {
        if (ScriptState.mutedUserIds.includes(userId)) {
            ScriptState.mutedUserIds = ScriptState.mutedUserIds.filter(id => id !== userId);
            console.log(`[NodeWatch - Mute Panel]: User ID ${userId} unmuted.`);
            addToOverlayHistory(`[Mute Panel]: Пользователь ID ${userId} размучен.`);
        } else {
            console.log(`[NodeWatch - Mute Panel]: User ID ${userId} is not muted.`);
            addToOverlayHistory(`[Mute Panel]: Пользователь ID ${userId} не замучен.`);
        }
        rerenderMuteListPopup();
    }


    /**
     * Sets up drag and drop functionality for a given popup element.
     * @param {HTMLDivElement} popupElement - The popup element to make draggable.
     * @private
     */
    function _setupPopupDrag(popupElement) {
        let isDragging = false;
        let offsetX, offsetY;

        popupElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - popupElement.offsetLeft;
            offsetY = e.clientY - popupElement.offsetTop;
            popupElement.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            // Boundary checks (optional, can be added if needed)
            if (newLeft < 0) newLeft = 0;
            if (newTop < 0) newTop = 0;
            if (newLeft > window.innerWidth - popupElement.offsetWidth) newLeft = window.innerWidth - popupElement.offsetWidth;
            if (newTop > window.innerHeight - popupElement.offsetHeight) newTop = window.innerHeight - popupElement.offsetHeight;


            popupElement.style.left = newLeft + 'px';
            popupElement.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            popupElement.style.cursor = 'grab';
            document.body.style.userSelect = 'auto';
        });

        popupElement.style.cursor = 'grab';
    }


    /**
     * Closes the analysis results popup.
     */
    function closeAnalysisPopup() {
        if (analysisPopup) {
            document.body.removeChild(analysisPopup);
            analysisPopup = null;
        }
    }

    /**
     * Closes the mute list popup.
     */
    function closeMuteListPopup() {
        if (muteListPopup) {
            document.body.removeChild(muteListPopup);
            muteListPopup = null;
            muteListPopupContent = null;
        }
    }

    /**
     * Общая функция для закрытия любого попапа (анализа или мутов).
     */
    function closeAnyPopup() {
        closeAnalysisPopup();
        closeMuteListPopup();
        closeCharacterListPopup(); // Добавлено закрытие попапа списка персонажей
    }


    /**
 * Создает элементы UI для отправки произвольных WebSocket сообщений.
 */
function createWebsocketSender() {
    const websocketInput = Utils.createElement('textarea', {
        attributes: {
            id: 'websocket-input',
            placeholder: Config.WEBSOCKET_INPUT_PLACEHOLDER
        },
        styles: {
            width: '100%',
            padding: '8px',
            borderRadius: '5px',
            border: '1px solid #777',
            backgroundColor: 'rgba(30, 30, 30, 0.7)',
            color: '#eee',
            fontFamily: 'monospace', // Моноширинный шрифт для JSON
            fontSize: '14px',
            marginBottom: '5px',
            boxSizing: 'border-box',
            resize: 'vertical', // Разрешить вертикальное изменение размера
            minHeight: '50px' // Минимальная высота textarea
        }
    });
    jokesMenuContainer.appendChild(websocketInput);

    const sendButton = Utils.createElement('button', {
        attributes: { title: Config.WEBSOCKET_SEND_BUTTON_TOOLTIP },
        textContent: Config.WEBSOCKET_SEND_BUTTON_TEXT,
        styles: {
            width: '100%',
            padding: '8px 15px',
            borderRadius: '5px',
            border: '1px solid #777',
            backgroundColor: 'rgba(50, 50, 50, 0.6)',
            color: '#eee',
            cursor: 'pointer',
            fontFamily: 'serif',
            fontSize: '15px',
            boxSizing: 'border-box'
        }
    });
    sendButton.addEventListener('click', () => {
        const message = websocketInput.value.trim();
        if (message) {
            try {
                JSON.parse(message); // Проверка, что это валидный JSON (необязательно, но полезно)

                currentWs.send(message);
                addToOverlayHistory(`[WS Отправка]: ${message}`);
                console.log('[NodeWatch - WS Отправка]: Отправлено сообщение:', message);
                websocketInput.value = ''; // Очистить поле ввода после отправки

            } catch (e) {
                addToOverlayHistory("[WS Ошибка]: Невалидный JSON.");
                console.error("[NodeWatch - WS Ошибка]: Введенный текст не является валидным JSON:", e);
            }
        } else {
            addToOverlayHistory("[WS Предупреждение]: Введите JSON сообщение.");
            console.warn("[NodeWatch - WS Предупреждение]: Попытка отправить пустое WebSocket сообщение.");
        }
    });
    jokesMenuContainer.appendChild(sendButton);
}

    /**
     * Handles the "Light" joke button click - now a toggle.
     */
    function lightToggleJoke() {
        isLightJokeActive = !isLightJokeActive; // Toggle state

        if (isLightJokeActive) {
            jokeButtonLight.textContent = Config.JOKE_BUTTON_LIGHT_ACTIVE_TEXT; // Update button text
            jokeButtonLight.classList.add('blinking-button'); // Add blinking class
            startLightJokeInterval(); // Start sending joke requests

        } else {
            jokeButtonLight.textContent = Config.JOKE_BUTTON_LIGHT_INACTIVE_TEXT; // Update button text
            jokeButtonLight.classList.remove('blinking-button'); // Remove blinking class
            stopLightJokeInterval(); // Stop sending joke requests
        }
    }

    /**
     * Starts the interval for sending light joke requests.
     */
    function startLightJokeInterval() {
        if (lightJokeIntervalId) {
            clearInterval(lightJokeIntervalId); // Clear any existing interval
        }
        lightJokeIntervalId = setInterval(() => {
            if (!myInitiatorId) {
                console.log(Config.INITIATOR_ID_NOT_RECEIVED);
                addToOverlayHistory(Config.INITIATOR_ID_NOT_RECEIVED);
                stopLightJokeInterval(); // Stop interval if no initiator ID
                return;
            }

            const lightOffMessage = JSON.stringify({
                "reason": "nodeAction",
                "initiator": myInitiatorId,
                "action": { "name": "c_light_off", "from": "light_on", "to": "light_off" }
            });
            const lightOnMessage = JSON.stringify({
                "reason": "nodeAction",
                "initiator": myInitiatorId,
                "action": { "name": "c_light_on", "from": "light_off", "to": "light_on" }
            });

            currentWs.send(lightOffMessage);
            console.log("[NodeWatch - Joke]: Sending light off request");
            addToOverlayHistory("[Joke]: Выключаю свет...");

            setTimeout(() => {
                currentWs.send(lightOnMessage);
                console.log("[NodeWatch - Joke]: Sending light on request");
                addToOverlayHistory("[Joke]: Включаю свет...");
            }, 500); // Small delay for effect
        }, 1000); // Repeat every 3 seconds
    }

    /**
     * Stops the interval for sending light joke requests.
     */
    function stopLightJokeInterval() {
        if (lightJokeIntervalId) {
            clearInterval(lightJokeIntervalId);
            lightJokeIntervalId = null;
        }
    }

    /**
     * Handles the "Copy Character" joke button click.
     */
    function copyCharacterJoke() {
        openCharacterListPopup();
    }

    /**
     * Opens the popup displaying the list of characters in the current location.
     */
    function openCharacterListPopup() {
        if (characterListPopup) {
            closeAnyPopup();
            return;
        }

        let characterListHTML = `<h2>${Config.CHARACTERS_MENU_TITLE}</h2><div id="character-list-content" style="max-height: 300px; overflow-y: auto; margin-bottom: 10px;">`; // Added margin-bottom for button spacing and content id

        const usersInLocation = Object.values(ScriptState.locationUsers);
        if (usersInLocation.length === 0) {
            characterListHTML += "<p>Нет других персонажей на локации.</p>";
        } else {
            characterListHTML += `<button id="return-original-button" style="width: 100%; padding: 8px 15px; border-radius: 5px; border: 1px solid #777; background-color: rgba(50, 50, 50, 0.6); color: #eee; cursor: pointer; font-family: serif; font-size: 15px; box-sizing: border-box; display: block; margin-bottom: 10px;">${Config.RETURN_ORIGINAL_CHARACTER_BUTTON_TEXT}</button>`; // Вернуть себя button at the top

            usersInLocation.forEach(userProfile => {
                if (userProfile.id !== myInitiatorId) { // Exclude current user from the list
                    characterListHTML += `<div style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #555;">
                                        <p><b>${userProfile.name}</b></p>
                                        <button class="copy-char-button" style="padding: 5px 10px; cursor: pointer;"
                                                data-user-id="${userProfile.id}">${Config.COPY_CHARACTER_BUTTON_TEXT}</button>
                                     </div>`;
                }
            });
        }
        characterListHTML += '</div>';


        characterListPopup = _createPopupElement(characterListHTML);
        characterListPopupContent = characterListPopup.querySelector('#character-list-content'); // Store content element
        const closeIcon = _createCloseIcon();
        _appendCloseIconToPopup(characterListPopup, closeIcon);
        document.body.appendChild(characterListPopup);
        _setupPopupDrag(characterListPopup); // Настройка драг&дроп для попапа

        // Add event listeners after popup is in DOM
        const copyButtons = characterListPopup.querySelectorAll('.copy-char-button');
        copyButtons.forEach(button => {
            button.addEventListener('click', function() {
                const userId = this.getAttribute('data-user-id');
                copyCharacterProfile(userId);
            });
        });

        const returnOriginalButton = characterListPopup.querySelector('#return-original-button'); // Select button inside popup
        returnOriginalButton.addEventListener('click', returnOriginalCharacterJoke);
    }

    /**
     * Re-renders the character list popup content.
     */
    function rerenderCharacterListPopup() {
        if (!characterListPopup || !characterListPopupContent) return;

        let characterListHTML = `<button id="return-original-button" style="width: 100%; padding: 8px 15px; border-radius: 5px; border: 1px solid #777; background-color: rgba(50, 50, 50, 0.6); color: #eee; cursor: pointer; font-family: serif; font-size: 15px; box-sizing: border-box; display: block; margin-bottom: 10px;">${Config.RETURN_ORIGINAL_CHARACTER_BUTTON_TEXT}</button>`; // Вернуть себя button at the top

        const usersInLocation = Object.values(ScriptState.locationUsers);
        if (usersInLocation.length > 0) {
            usersInLocation.forEach(userProfile => {
                if (userProfile.id !== myInitiatorId) { // Exclude current user from the list
                    characterListHTML += `<div style="margin-bottom: 10px; padding: 5px; border-bottom: 1px solid #555;">
                                        <p><b>${userProfile.name}</b></p>
                                        <button class="copy-char-button" style="padding: 5px 10px; cursor: pointer;"
                                                data-user-id="${userProfile.id}">${Config.COPY_CHARACTER_BUTTON_TEXT}</button>
                                     </div>`;
                }
            });
        } else {
            characterListHTML += "<p>Нет других персонажей на локации.</p>";
        }
        characterListPopupContent.innerHTML = characterListHTML; // Update content

        // Re-bind event listeners for new "Return Original Character" button
        const returnOriginalButton = characterListPopup.querySelector('#return-original-button');
        returnOriginalButton.addEventListener('click', returnOriginalCharacterJoke);

        // Re-bind event listeners for new "Copy Character" buttons
        const copyButtons = characterListPopup.querySelectorAll('.copy-char-button');
        copyButtons.forEach(button => {
            button.addEventListener('click', function() {
                const userId = this.getAttribute('data-user-id');
                copyCharacterProfile(userId);
            });
        });
    }


    /**
     * Closes the character list popup.
     */
    function closeCharacterListPopup() {
        if (characterListPopup) {
            document.body.removeChild(characterListPopup);
            characterListPopup = null;
            characterListPopupContent = null; // Clear content reference
        }
    }

    /**
     * Copies the character profile and sends a userInit message to impersonate.
     * This function needs to be globally accessible from the HTML onclick event.
     * @param {string} userId - The ID of the user to copy.
     */
    window.copyCharacterProfile = function(userId) {
        if (!lastVisitedNode) {
            addToOverlayHistory(Config.WARNING_NO_CURRENT_LOCATION);
            console.warn(Config.WARNING_NO_CURRENT_LOCATION);
            return;
        }
        ScriptState.isTrackingNode = false; // Disable location tracking before relocation

        closeCharacterListPopup();
        const profileToCopy = ScriptState.locationUsers[userId];

        if (profileToCopy) {
            addToOverlayHistory(Config.COPYING_CHARACTER_OVERLAY_MESSAGE);
            console.log(`[NodeWatch - Joke]: Copying character profile for user ID: ${userId}`);
            console.log("[NodeWatch - Joke]: Profile to copy:", profileToCopy);

            // -- Relocation Workaround --
            const bunkerNode = "int_bunker"; // Temporary node
            const originalLocationNode = lastVisitedNode; // Store original location

            const goToBunkerMessage = { // Move to bunker first
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": bunkerNode
            };
            currentWs.send(JSON.stringify(goToBunkerMessage));
            addToOverlayHistory(`[NodeWatch - Joke]: Перемещаюсь в ${bunkerNode} для смены персонажа...`);
            const profileToSend = { ...profileToCopy };


            const userInitMessage = {
                "reason": "userInit",
                "name": profileToSend.name,
                "color": profileToSend.color,
                "sprite": profileToSend.sprite,
                "node": bunkerNode, // Set node to bunker initially
                "position": profileToSend.position,
                "is_fliped": profileToSend.is_fliped,
                "user_info": originalUserInitData ? originalUserInitData.user_info : "unknown", // Use original user_info if available
                "additional": profileToSend.additional
            };

            console.log("[NodeWatch - Joke]: userInitMessage:", userInitMessage);
            currentWs.send(JSON.stringify(userInitMessage));

            const updateStateMessage = { "reason": "updatePlayerState", "state": "watching" };
            currentWs.send(JSON.stringify(updateStateMessage));
            console.log("[NodeWatch - Joke]: Sending updatePlayerState message:", updateStateMessage);

            const userMoveMessage = { "reason": "userMove", "position": profileToCopy.position || "" }; // Use empty string as default if position is missing
            currentWs.send(JSON.stringify(userMoveMessage));
            console.log("[NodeWatch - Joke]: Sending userMove message:", userMoveMessage);

            // After userInit, move back to original location
            const returnToOriginalLocationMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": originalLocationNode
            };
            currentWs.send(JSON.stringify(returnToOriginalLocationMessage));
            addToOverlayHistory(`[NodeWatch - Joke]: Возвращаюсь в ${originalLocationNode}...`);
            ScriptState.isTrackingNode = true; // Re-enable location tracking after return

            addToOverlayHistory(Config.CHARACTER_COPY_SUCCESSFUL_OVERLAY);
            console.log("[NodeWatch - Joke]: userInit message sent to impersonate character.");




        } else {
            console.warn(`[NodeWatch - Joke]: Profile for user ID ${userId} not found.`);
            addToOverlayHistory("[Joke]: Ошибка копирования.");
            ScriptState.isTrackingNode = true; // Re-enable location tracking in case of error
        }
    };

    /**
     * Handles the "Return Original Character" joke button click.
     */
    window.returnOriginalCharacterJoke = function() {
        if (!originalUserInitData) {
            console.warn("[NodeWatch - Joke]: Original userInit data not available.");
            addToOverlayHistory("[Joke]: Нет данных об изначальном персонаже.");
            return;
        }
        if (!lastVisitedNode) {
            addToOverlayHistory(Config.WARNING_NO_CURRENT_LOCATION);
            console.warn(Config.WARNING_NO_CURRENT_LOCATION);
            return;
        }

        closeCharacterListPopup(); // Close the popup after clicking "Return Original Character"
        addToOverlayHistory("[Joke]: Возвращаю изначального персонажа...");
        console.log("[NodeWatch - Joke]: Returning to original character.");
        console.log("[NodeWatch - Joke]: Sending original userInit message:", originalUserInitData); // Debug log

        const bunkerNode = "int_bunker"; // Temporary node
        const originalLocationNode = lastVisitedNode; // Store original location

        const goToBunkerMessage = { // Move to bunker first
            "reason": "roomChange",
            "initiator": myInitiatorId,
            "node": bunkerNode
        };
        currentWs.send(JSON.stringify(goToBunkerMessage));
        addToOverlayHistory(`[NodeWatch - Joke]: Перемещаюсь в ${bunkerNode} для смены персонажа...`);


        const userInitMessage = {
            "reason": "userInit",
            "name": originalUserInitData.name,
            "color": originalUserInitData.color,
            "sprite": originalUserInitData.sprite,
            "node": lastVisitedNode, // <---- Use lastVisitedNode here
            "position": originalUserInitData.position,
            "is_fliped": originalUserInitData.is_fliped,
            "user_info": originalUserInitData.user_info,
            "additional": originalUserInitData.additional
        };
        currentWs.send(JSON.stringify(userInitMessage));


        // Send updatePlayerState after returning to original - using original state
        const updateStateMessage = { "reason": "updatePlayerState", "state": "watching" };
        currentWs.send(JSON.stringify(updateStateMessage));
        console.log("[NodeWatch - Joke]: Sending updatePlayerState message:", updateStateMessage);

        const returnToOriginalLocationMessage = {
            "reason": "roomChange",
            "initiator": myInitiatorId,
            "node": originalLocationNode
        };
        currentWs.send(JSON.stringify(returnToOriginalLocationMessage));
        addToOverlayHistory(`[NodeWatch - Joke]: Возвращаюсь в ${originalLocationNode}...`);


        addToOverlayHistory("[Joke]: Изначальный персонаж восстановлен!");
        console.log("[NodeWatch - Joke]: Original userInit message sent.");
    }


    /**
     * Creates the "Jokes" button and its menu.
     */
    function createJokesButtonAndMenu() {
        jokesButton = Utils.createElement('button', {
            attributes: { title: Config.JOKES_BUTTON_TOOLTIP },
            textContent: Config.JOKES_BUTTON_TEXT,
            styles: {
                width: '100%',
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                border: '1px solid #777',
                padding: '8px 15px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxShadow: '2px 2px 3px rgba(0,0,0,0.3)',
                transition: 'background-color 0.3s ease',
                height: '35px',
                boxSizing: 'border-box',
                marginTop: '5px',
                display: 'block'
            }
        });

        jokesButton.addEventListener('mouseover', () => {
            jokesButton.style.backgroundColor = 'rgba(70, 70, 70, 0.7)';
        });
        jokesButton.addEventListener('mouseout', () => {
            jokesButton.style.backgroundColor = 'rgba(50, 50, 50, 0.6)';
        });
        jokesButton.addEventListener('click', toggleJokesMenu);


        jokesMenuContainer = Utils.createElement('div', {
            styles: {
                display: 'none',
                backgroundColor: 'rgba(30, 30, 30, 0.7)',
                borderRadius: '5px',
                marginTop: '5px',
                padding: '10px',
                width: '100%',
                boxSizing: 'border-box',
                flexDirection: 'column',
                alignItems: 'stretch'
            }
        });

        // "Light" Joke Button
        jokeButtonLight = Utils.createElement('button', {
            attributes: { title: Config.JOKE_BUTTON_LIGHT_TOOLTIP },
            textContent: Config.JOKE_BUTTON_LIGHT_INACTIVE_TEXT,
            styles: {
                width: '100%',
                padding: '8px 15px',
                borderRadius: '5px',
                border: '1px solid #777',
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxSizing: 'border-box',
                marginBottom: '5px'
            }
        });
        jokeButtonLight.addEventListener('click', lightToggleJoke);
        jokesMenuContainer.appendChild(jokeButtonLight);

        // "Copy Character" Joke Button
        jokeButtonCopyCharacter = Utils.createElement('button', {
            attributes: { title: Config.JOKE_BUTTON_COPY_TOOLTIP },
            textContent: Config.JOKE_BUTTON_COPY_TEXT,
            styles: {
                width: '100%',
                padding: '8px 15px',
                borderRadius: '5px',
                border: '1px solid #777',
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxSizing: 'border-box',
                marginBottom: '5px'
            }
        });
        jokeButtonCopyCharacter.addEventListener('click', copyCharacterJoke);
        jokesMenuContainer.appendChild(jokeButtonCopyCharacter);

        // "Mute Panel" Button
        muteButton = Utils.createElement('button', {
            attributes: { title: Config.MUTE_BUTTON_TOOLTIP },
            textContent: Config.MUTE_BUTTON_TEXT,
            styles: {
                width: '100%',
                padding: '8px 15px',
                borderRadius: '5px',
                border: '1px solid #777',
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxSizing: 'border-box',
                marginBottom: '5px'
            }
        });
        muteButton.addEventListener('click', openMuteListPopup);
        jokesMenuContainer.appendChild(muteButton);


        createWebsocketSender();

        goToNodeContainer.appendChild(jokesButton);
        goToNodeContainer.appendChild(jokesMenuContainer);
    }

    /**
     * Toggles the visibility of the jokes menu.
     */
    function toggleJokesMenu() {
        jokesMenuContainer.style.display = (jokesMenuContainer.style.display === 'none' ? 'flex' : 'none');
    }


     /**
     * Creates the "Go To Node" button and input elements.
     */
    function createGoToNodeButton() {
        goToNodeContainer = Utils.createElement('div', {
            styles: {
                position: 'fixed',
                top: '50px',
                left: '10px',
                zIndex: Config.BUTTON_Z_INDEX,
                display: 'none',
                flexDirection: 'column',
                alignItems: 'flex-start',
                width: '150px'
            }
        });

        nodeInput = Utils.createElement('input', {
            attributes: {
                type: 'text',
                id: 'node-input',
                placeholder: Config.NODE_INPUT_PLACEHOLDER
            },
            styles: {
                width: '100%',
                padding: '8px',
                borderRadius: '5px',
                border: '1px solid #777',
                backgroundColor: 'rgba(30, 30, 30, 0.7)',
                color: '#eee',
                fontFamily: 'sans-serif',
                fontSize: '14px',
                marginBottom: '5px',
                boxSizing: 'border-box'
            }
        });
        goToNodeContainer.appendChild(nodeInput);

        goToNodeButton = Utils.createElement('button', {
            attributes: { title: Config.GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL },
            textContent: Config.GO_TO_ASTRAL_BUTTON_TEXT,
            styles: {
                width: '100%',
                backgroundColor: 'rgba(50, 50, 50, 0.6)',
                color: '#eee',
                border: '1px solid #777',
                padding: '8px 15px',
                borderRadius: '5px',
                cursor: 'pointer',
                fontFamily: 'serif',
                fontSize: '15px',
                boxShadow: '2px 2px 3px rgba(0,0,0,0.3)',
                transition: 'background-color 0.3s ease',
                height: '35px',
                boxSizing: 'border-box',
                display: 'block'
            }
        });

        goToNodeButton.addEventListener('mouseover', () => {
            goToNodeButton.style.backgroundColor = 'rgba(70, 70, 70, 0.7)';
        });
        goToNodeButton.addEventListener('mouseout', () => {
            goToNodeButton.style.backgroundColor = 'rgba(50, 50, 50, 0.6)';
        });
        goToNodeButton.addEventListener('click', handleGoToNodeClick);
        goToNodeContainer.appendChild(goToNodeButton);


        currentNodeDisplay = Utils.createElement('div', {
            attributes: { id: 'current-node-display' },
            textContent: Config.CURRENT_NODE_TEXT_PREFIX,
            styles: {
                color: '#ccc',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                marginTop: '5px',
                textAlign: 'left',
                width: '100%',
                boxSizing: 'border-box'
            }
        });
        goToNodeContainer.appendChild(currentNodeDisplay);

        createJokesButtonAndMenu();
        document.body.appendChild(goToNodeContainer);
    }


    /**
     * Handles user join messages to update the character list and mute panel.
     * @param {object} user - The user data from the userJoin message.
     */
    function handleUserJoin(user) {
        if (user && user.id && user.id !== myInitiatorId) {
            user.local_id = user.local_id || "N/A"; // Ensure local_id is stored, default to "N/A" if missing
            ScriptState.locationUsers[user.id] = user;
            rerenderCharacterListPopup();
            rerenderMuteListPopup();
        }
    }

    /**
     * Handles user left messages to update the character list and mute panel.
     * @param {string} userId - The ID of the user who left.
     */
    function handleUserLeft(userId) {
        if (ScriptState.locationUsers[userId]) {
            delete ScriptState.locationUsers[userId];
            rerenderCharacterListPopup(); // Update the character list popup
            rerenderMuteListPopup(); // Update the mute list popup
        }
    }

    /**
     * Handles nodeUsers messages to update user information, including local_id.
     */
    function handleNodeUsers(usersData) {
        ScriptState.locationUsers = {}; // Clear current location users data
        userMap = {}; // Clear userMap as well, to refresh names based on nodeUsers

        usersData.forEach(user => {
            if (user.id && user.name && user.id !== myInitiatorId) {
                user.local_id = user.local_id || "N/A"; // Ensure local_id is stored, default to "N/A" if missing
                userMap[user.id] = user.name;
                ScriptState.locationUsers[user.id] = user; // Store full user profile including local_id
                console.log(`[NodeWatch WebSocket Listener - nodeUsers]: Пользователь ${user.name} (ID: ${user.id}, Local ID: ${user.local_id}) добавлен в userMap и locationUsers.`);
            }
        });
        rerenderCharacterListPopup(); // Update character list popup
        rerenderMuteListPopup();    // Update mute list popup
    }


    /**
     * Handles the "Go To Astral" button click.
     * @private
     */
    function _handleGoToAstralClick() {
        ScriptState.originalNode = lastVisitedNode;

        if (!ScriptState.originalNode) {
            addToOverlayHistory(Config.WARNING_NO_CURRENT_LOCATION);
            console.warn(Config.WARNING_NO_CURRENT_LOCATION);
            return;
        }

        const nodeTarget = nodeInput.value.trim();
        if (!nodeTarget) {
            addToOverlayHistory(Config.WARNING_NODE_INPUT_EMPTY);
            console.warn(Config.WARNING_NODE_INPUT_EMPTY);
            return;
        }

        const roomChangeMessage = {
            "reason": "roomChange",
            "initiator": myInitiatorId,
            "node": nodeTarget
        };
        currentWs.send(JSON.stringify(roomChangeMessage));
        addToOverlayHistory(`${Config.GO_TO_NODE_MESSAGE_PREFIX} ${nodeTarget}`);
        goToNodeButton.textContent = Config.GO_BACK_BUTTON_TEXT;
        goToNodeButton.title = Config.GO_TO_NODE_BUTTON_TOOLTIP_BACK;
        ScriptState.goToNodeButtonMode = 'back';
    }

    /**
     * Handles the "Go Back" button click.
     * @private
     */
    function _handleGoBackClick() {
        if (ScriptState.originalNode) {
            const returnRoomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": ScriptState.originalNode
            };
            currentWs.send(JSON.stringify(returnRoomChangeMessage));
            addToOverlayHistory(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${ScriptState.originalNode}`);
        }
        goToNodeButton.textContent = Config.GO_TO_ASTRAL_BUTTON_TEXT;
        goToNodeButton.title = Config.GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL;
        ScriptState.goToNodeButtonMode = 'astral';
        ScriptState.originalNode = null;
    }


    /**
     * Handles the click event for the "Go To Node" button, delegating to specific handlers.
     */
    function handleGoToNodeClick() {
        if (ScriptState.goToNodeButtonMode === 'astral') {
            _handleGoToAstralClick();
        } else if (ScriptState.goToNodeButtonMode === 'back') {
            _handleGoBackClick();
        }
    }

    /**
     * Starts the "Find RP (test)" analysis.
     */
    function startRPTestAnalysis() {
        if (isRPTestRunning) {
            console.log(Config.LOCATION_ANALYSIS_ALREADY_RUNNING);
            addToOverlayHistory(Config.LOCATION_ANALYSIS_ALREADY_RUNNING);
            return;
        }
        if (!myInitiatorId) {
            console.log(Config.INITIATOR_ID_NOT_RECEIVED);
            addToOverlayHistory(Config.INITIATOR_ID_NOT_RECEIVED);
            return;
        }
        if (!lastVisitedNode) {
            addToOverlayHistory(Config.WARNING_NO_CURRENT_LOCATION);
            console.warn(Config.WARNING_NO_CURRENT_LOCATION);
            return;
        }

        nodeBeforeRPTest = lastVisitedNode;
        ScriptState.isTrackingNode = false;
        isRPTestRunning = true;
        rpTestResults = {};
        expectedResponsesCount = nodeList.length;
        addToOverlayHistory("Идет поиск РП...");
        console.log("[NodeWatch - RP Test]: Starting RP Test Analysis...");

        // Send roomChange requests for all nodes immediately
        nodeList.forEach(node => {
            const roomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": node
            };
            currentWs.send(JSON.stringify(roomChangeMessage));
            console.log(`[NodeWatch - RP Test]: Sent roomChange for node: ${node}`);
        });
    }

    /**
     * Analyzes the results of the "Find RP (test)" and displays them in a popup.
     */
    function analyzeRPTestResults() {
        console.log("[NodeWatch - RP Test]: Analyzing RP Test Results...");
        const sortedLocations = Object.entries(rpTestResults)
            .map(([node, users]) => [node, users.filter(user => user.id !== myInitiatorId)])
            .filter(([, users]) => users.length > 0)
            .sort(([, usersA], [, usersB]) => usersB.length - usersA.length);

        // Sort users within each location: playing first, then watching
        const sortedLocationsWithState = sortedLocations.map(([node, users]) => {
            const playingUsers = users.filter(user => user.state === 'playing');
            const watchingUsers = users.filter(user => user.state === 'watching');
            return [node, [...playingUsers, ...watchingUsers]];
        });

        let popupContentHTML = `<h2>${Config.ANALYSIS_POPUP_TITLE}</h2><div style="max-height: 300px; overflow-y: auto;">`;

        if (sortedLocationsWithState.length === 0) {
            popupContentHTML += Config.ANALYSIS_POPUP_NO_USERS;
        } else {
            for (const [node, users] of sortedLocationsWithState) {
                let userNamesWithState = users.map(user => {
                    return user.state === 'watching' ? `${user.name} (👁️)` : user.name;
                }).join(', ');
                popupContentHTML += `<p><b>${node}:</b> ${userNamesWithState}</p>`;
            }
        }
        popupContentHTML += '</div>';

        createAnalysisPopup(popupContentHTML);
        ScriptState.isTrackingNode = true;

        if (nodeBeforeRPTest) {
            const returnRoomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": nodeBeforeRPTest
            };
            currentWs.send(JSON.stringify(returnRoomChangeMessage));
            addToOverlayHistory(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${nodeBeforeRPTest}`);
            nodeBeforeRPTest = null;
        }
    }


    window.WebSocket = function(url, protocols) {
        currentWs = new originalWebSocket(url, protocols);
        const ws = currentWs;
        const originalSend = ws.send.bind(ws);

        ws.send = function(message) {
            try {
                const data = JSON.parse(message);
                if (data.reason === 'userInit') {
                    if (!originalUserInitData) { // Capture only the first userInit
                        originalUserInitData = data;
                        console.log('[NodeWatch WebSocket Listener]: Original userInit data captured:', originalUserInitData);
                    }
                }
                if (data.reason === 'roomChange' && data.initiator === myInitiatorId && ScriptState.isTrackingNode) {
                    lastVisitedNode = data.node;
                    console.log(`[NodeWatch WebSocket Listener]: Last visited node запомнен: ${lastVisitedNode}`);
                    if (currentNodeDisplay) {
                        currentNodeDisplay.textContent = `${Config.CURRENT_NODE_TEXT_PREFIX} ${lastVisitedNode}`;
                    }
                }
            } catch (e) { /* Ignore JSON parse errors in send */ }
            originalSend(message);
        };


        ws.addEventListener('open', () => {
            console.log('[NodeWatch WebSocket Listener]: WebSocket соединение установлено для URL:', url);
            addToOverlayHistory(Config.WEBSocket_CONNECTION_ESTABLISHED);
            clearOverlayInitialMessage();
            analyzeButton.style.display = 'block';
            goToNodeContainer.style.display = 'flex';

            // --- Chat Input Maxlength Modification ---
            let chatInputInterval = setInterval(() => {
                const chatInput = document.querySelector('#chat-input');
                if (chatInput) {
                    chatInput.setAttribute('maxlength', '2000');
                    console.log('NodeWatch: Chat input maxlength увеличен до 2000');
                    clearInterval(chatInputInterval);
                }
            }, 1000); // Check every 1 second
            // --- End Chat Input Maxlength Modification ---
        });

        ws.addEventListener('message', function(event) {
            if (isFirstMessage) {
                try {
                    JSON.parse(event.data);
                } catch (e) {
                    if (typeof event.data === 'string') {
                        myInitiatorId = event.data;
                        console.log('[NodeWatch WebSocket Listener]: Initiator ID captured:', myInitiatorId);
                        isFirstMessage = false;
                        return;
                    }
                }
                isFirstMessage = false;
            }

            try {
                const data = JSON.parse(event.data);

                if (data.reason === 'chat') {
                    const chatLocalId = data.local_id;
                    const chatSenderId = getUserIdByLocalId(chatLocalId);

                    if (chatSenderId && ScriptState.mutedUserIds.includes(chatSenderId)) {
                        console.log(`[NodeWatch - Mute Panel]: Blocked message from muted user with local_id: ${chatLocalId}, user_id: ${chatSenderId}`);
                        // --- CHANGE: Modify event.data to prevent chat message processing ---
                        event.stopImmediatePropagation(); // Stop further message processing
                        event.preventDefault();
                        Object.defineProperty(event, 'data', {
                            writable: true,
                            value: JSON.stringify({"reason": "pong"}) // Replace with pong or empty message
                        });
                        // --- END CHANGE ---
                        return;
                    }
                    } else if (data.reason === 'userJoin' && data.user && data.user.name && data.user.id && data.user.id !== myInitiatorId) {
                    handleUserJoin(data.user); // Call handleUserJoin to update lists
                    const userName = data.user.name;
                    const userId = data.user.id;
                    userMap[userId] = userName;
                    console.log('[NodeWatch WebSocket Listener - Обнаружено userJoin сообщение. Пользователь:', userName, 'ID:', userId);
                    addToOverlayHistory(`${Config.USER_JOIN_MESSAGE_PREFIX} ${userName}`);

                } else if (data.reason === 'userLeft' && data.initiator && data.initiator !== myInitiatorId) {
                    handleUserLeft(data.initiator); // Call handleUserLeft to update lists
                    const userIdLeft = data.initiator;
                    const userNameLeft = userMap[userIdLeft];
                    console.log('[NodeWatch WebSocket Listener - Обнаружено userLeft сообщение. Пользователь:', userNameLeft ? userNameLeft : 'ID: ' + userIdLeft, 'ID:', userIdLeft);

                    const overlayMessage = userNameLeft ? `${Config.USER_LEFT_MESSAGE_PREFIX} ${userNameLeft}` : `${Config.USER_LEFT_MESSAGE_PREFIX} ID: ${userIdLeft}`;
                    addToOverlayHistory(overlayMessage);
                    delete userMap[userIdLeft];
                    delete ScriptState.locationUsers[userIdLeft]; // Remove from location users as well

                } else if (data.reason === 'nodeUsers') {
                    handleNodeUsers(data.users);
                    console.log('[NodeWatch WebSocket Listener - Обнаружено nodeUsers сообщение. Обновление userMap и locationUsers.');

                    // Clear current location users data before updating from nodeUsers
                    ScriptState.locationUsers = {};

                    data.users.forEach(user => {
                        if (user.id && user.name && user.id !== myInitiatorId) {
                            userMap[user.id] = user.name;
                            ScriptState.locationUsers[user.id] = user; // Store full user profile
                            console.log(`[NodeWatch WebSocket Listener - nodeUsers]: Пользователь ${user.name} (ID: ${user.id}) добавлен в userMap и locationUsers.`);
                        }
                    });
                    rerenderCharacterListPopup(); // Update character list popup
                    rerenderMuteListPopup(); // Update mute list popup

                    if (isRPTestRunning) {
                        if (expectedResponsesCount > 0) {
                            if (data.users && data.users.length > 0 && data.users[0].node) {
                                const nodeName = data.users[0].node;

                                if (!rpTestResults[nodeName]) {
                                    rpTestResults[nodeName] = data.users;
                                    expectedResponsesCount--;

                                    console.log(`[NodeWatch - RP Test]: Received nodeUsers for node: ${nodeName}, remaining responses: ${expectedResponsesCount}`);

                                    if (expectedResponsesCount === 0) {
                                        console.log("[NodeWatch - RP Test]: All nodeUsers responses received. Starting analysis.");
                                        isRPTestRunning = false;
                                        addToOverlayHistory("Поиск РП завершен.");
                                        analyzeRPTestResults();
                                    }
                                } else {
                                    console.warn(`[NodeWatch - RP Test]: Duplicate nodeUsers response received for node: ${nodeName}. Ignoring.`);
                                }
                            } else {
                                console.warn("[NodeWatch - RP Test]: Invalid nodeUsers response format or no users in response to determine node.", event.data);
                                expectedResponsesCount--;
                                if (expectedResponsesCount < 0) expectedResponsesCount = 0;
                                if (expectedResponsesCount === 0) {
                                    isRPTestRunning = false;
                                    addToOverlayHistory("Поиск РП завершен.");
                                    analyzeRPTestResults();
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[NodeWatch WebSocket Listener]: Ошибка обработки JSON сообщения:', e, event.data);
                addToOverlayHistory("WebSocket: Ошибка данных");
            }
        });

        ws.addEventListener('close', () => {
            console.log('[NodeWatch WebSocket Listener]: WebSocket соединение закрыто для URL:', url);
            addToOverlayHistory(Config.WEBSocket_CONNECTION_CLOSED);
            clearOverlayInitialMessage();
            ScriptState.isAnalyzing = false;
            ScriptState.isTrackingNode = false;
            isRPTestRunning = false;
            goToNodeContainer.style.display = 'none';
        });

        ws.addEventListener('error', (error) => {
            console.error('[NodeWatch WebSocket Listener]: Ошибка WebSocket для URL:', url, error);
            addToOverlayHistory(Config.WEBSocket_CONNECTION_ERROR);
            clearOverlayInitialMessage();
            ScriptState.isAnalyzing = false;
            ScriptState.isTrackingNode = false;
            isRPTestRunning = false;
            goToNodeContainer.style.display = 'none';
        });

        return ws;
    };

    // CSS для мигающей кнопки и вкладок
    const style = Utils.createElement('style');
    style.textContent = `
        .blinking-button {
            animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
            50% { opacity: 0.5; }
        }
        /* Стили для вкладок в попапе мутов */
        #mute-list-tabs {
            display: flex;
            margin-bottom: 10px;
        }
        .mute-tab {
            padding: 8px 15px;
            border: 1px solid #777;
            border-radius: 5px 5px 0 0;
            background-color: rgba(50, 50, 50, 0.6);
            color: #eee;
            cursor: pointer;
            font-family: serif;
            font-size: 15px;
            box-sizing: border-box;
        }
        .mute-tab.active {
            background-color: rgba(70, 70, 70, 0.7);
        }
        .mute-tab:not(.active) {
            border-bottom: none; /* Убираем нижнюю границу для неактивной вкладки */
        }
        #mute-list-content-container {
            border: 1px solid #777;
            border-radius: 0 5px 5px 5px;
            padding: 10px;
            background-color: rgba(30, 30, 30, 0.7);
        }
    `;
    document.head.appendChild(style);


    console.log('[NodeWatch WebSocket Listener]: Скрипт активен и перехватывает WebSocket на fukuro.su');
    createOverlay();
    createAnalyzeButton();
    createGoToNodeButton();
})();