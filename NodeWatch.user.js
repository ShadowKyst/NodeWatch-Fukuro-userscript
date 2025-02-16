// ==UserScript==
// @name         NodeWatch
// @namespace    http://tampermonkey.net/
// @version      3.8.4
// @icon         https://github.com/Shadowkyst/NodeWatch-Fukuro-userscript/raw/master/assets/favicon.webp
// @description  WebSocket listener for fukuro.su, displaying user join/leave events and location analysis results in an overlay and popup. Jokes button toggle, userMap updated from nodeUsers, added "Найти РП" warning.
// @author       ShadowKyst
// @match        https://www.fukuro.su/
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
        PROGRESS_BAR_Z_INDEX: 1000,
        POPUP_Z_INDEX: 1001,
        DEFAULT_OVERLAY_TEXT: "WebSocket Listener Активен",
        ANALYZE_BUTTON_TEXT: "Найти РП",
        GO_TO_ASTRAL_BUTTON_TEXT: "Астрал",
        GO_BACK_BUTTON_TEXT: "Вернуться",
        NODE_INPUT_PLACEHOLDER: "Node",
        CURRENT_NODE_TEXT_PREFIX: "Вы сейчас в: -",
        ANALYSIS_STATUS_PREFIX: "Анализ локаций: ",
        ANALYSIS_COMPLETE_STATUS: "Анализ локаций завершен",
        ANALYSIS_POPUP_TITLE: "Результаты анализа локаций:",
        ANALYSIS_POPUP_NO_USERS: "<p>Нет пользователей в локациях (кроме вас).</p>",
        WEBSocket_CONNECTION_ESTABLISHED: "WebSocket: Соединение установлено",
        WEBSocket_CONNECTION_CLOSED: "WebSocket: Соединение закрыто",
        WEBSocket_CONNECTION_ERROR: "WebSocket: Ошибка соединения",
        USER_JOIN_MESSAGE_PREFIX: "[User Join] ",
        USER_LEFT_MESSAGE_PREFIX: "[User Left] ",
        RETURN_TO_LAST_LOCATION_PREFIX: "Возврат в: ",
        GO_TO_NODE_MESSAGE_PREFIX: "Переход в: ", // New log message for "Astral" navigation
        LOCATION_ANALYSIS_STARTING: "Начинаю анализ локаций...",
        LOCATION_ANALYSIS_ALREADY_RUNNING: "Анализ уже запущен.",
        INITIATOR_ID_NOT_RECEIVED: "Initiator ID не получен. Перезагрузите страницу.",
        WARNING_NO_CURRENT_LOCATION: "Предупреждение: Невозможно запомнить текущую локацию.",
        WARNING_NODE_INPUT_EMPTY: "Предупреждение: Введите имя Node.",
        ANALYZE_BUTTON_TOOLTIP: "Запустить анализ локаций для поиска РП", // Tooltip for Analyze button
        GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL: "Перейти в указанную Node", // Tooltip for "Astral" button mode
        GO_TO_NODE_BUTTON_TOOLTIP_BACK: "Вернуться в предыдущую локацию", // Tooltip for "Вернуться" button mode
        JOKES_BUTTON_TEXT: "Приколы", // Text for Jokes button
        JOKES_BUTTON_TOOLTIP: "Открыть меню приколов", // Tooltip for Jokes button
        JOKE_BUTTON_LIGHT_TEXT: "Свет", // Text for "Light" joke button
        JOKE_BUTTON_LIGHT_TOOLTIP: "Включить/выключить свет (для прикола)", // Tooltip for "Light" joke button
        JOKE_BUTTON_LIGHT_ACTIVE_TEXT: "Свет [ВКЛ]", // Text when "Light" joke is active
        JOKE_BUTTON_LIGHT_INACTIVE_TEXT: "Свет", // Text when "Light" joke is inactive
        WARNING_NO_LAST_LOCATION_FOR_ANALYSIS: "Предупреждение: Невозможно вернуться в последнюю локацию после анализа, так как она не запомнена." // Warning for Analyze Button
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
        goToNodeButtonMode: 'astral' // 'astral' или 'back'
    };

    const originalWebSocket = window.WebSocket;
    const userMap = {};
    let overlayDiv = null;
    const overlayHistory = [];
    let myInitiatorId = null;
    let isFirstMessage = true;

    // Location Analyzer variables
    let analyzeButton = null;
    let progressBarContainer = null;
    let progressBar = null;
    let progressText = null;
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
    let currentNodeIndex = 0;
    let locationData = {};
    let currentWs = null;
    let analysisPopup = null;
    let lastVisitedNode = null;
    let analysisStatusDiv = null;

    // New Node Navigation Variables
    let goToNodeButton = null;
    let nodeInput = null;
    let currentNodeDisplay = null;
    let goToNodeContainer = null;

    // Jokes Button and Menu Variables
    let jokesButton = null;
    let jokesMenuContainer = null;
    let jokeButtonLight = null; // Variable for "Light" joke button
    let isLightJokeActive = false; // State for "Light" joke toggle
    let lightJokeIntervalId = null; // Interval ID for blinking and joke requests


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
            textContent: Config.DEFAULT_OVERlay_TEXT
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
     * Sets the analysis status text in the overlay.
     * @param {string} statusText - The status text to display.
     */
    function setAnalysisStatus(statusText) {
        if (!analysisStatusDiv) {
            analysisStatusDiv = Utils.createElement('div');
            overlayDiv.prepend(analysisStatusDiv);
        }
        analysisStatusDiv.textContent = statusText;
    }

    /**
     * Clears the analysis status text from the overlay.
     */
    function clearAnalysisStatus() {
        if (analysisStatusDiv && overlayDiv.contains(analysisStatusDiv)) {
            overlayDiv.removeChild(analysisStatusDiv);
            analysisStatusDiv = null;
        }
    }

    /**
     * Creates the "Analyze Location" button.
     */
    function createAnalyzeButton() {
        analyzeButton = Utils.createElement('button', {
            attributes: { title: Config.ANALYZE_BUTTON_TOOLTIP }, // Add tooltip
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
        analyzeButton.addEventListener('click', startLocationAnalysis);

        document.body.appendChild(analyzeButton);
        createProgressBar();
    }

    /**
     * Creates the progress bar elements.
     */
    function createProgressBar() {
        progressBarContainer = Utils.createElement('div', {
            styles: {
                position: 'fixed',
                top: '45px',
                left: '10px',
                width: '150px',
                height: '10px',
                backgroundColor: 'rgba(100, 100, 100, 0.3)',
                borderRadius: '5px',
                overflow: 'hidden',
                zIndex: Config.PROGRESS_BAR_Z_INDEX,
                display: 'none'
            }
        });
        document.body.appendChild(progressBarContainer);

        progressBar = Utils.createElement('div', {
            styles: {
                width: '0%',
                height: '100%',
                backgroundColor: 'rgba(0, 150, 0, 0.7)'
            }
        });
        progressBarContainer.appendChild(progressBar);

        progressText = Utils.createElement('div', {
            textContent: '0%',
            styles: {
                position: 'fixed',
                top: '45px',
                left: '170px',
                color: '#eee',
                fontSize: '12px',
                fontFamily: 'sans-serif',
                zIndex: Config.PROGRESS_BAR_Z_INDEX,
                display: 'none'
            }
        });
        document.body.appendChild(progressText);
    }

    /**
     * Updates the progress bar and text.
     * @param {number} percentage - The progress percentage (0-100).
     */
    function updateProgressBar(percentage) {
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }

    /**
     * Starts the location analysis process.
     */
    function startLocationAnalysis() {
        if (ScriptState.isAnalyzing) {
            console.log(Config.LOCATION_ANALYSIS_ALREADY_RUNNING);
            return;
        }
        if (!myInitiatorId) {
            console.log(Config.INITIATOR_ID_NOT_RECEIVED);
            return;
        }
        if (!lastVisitedNode) { // Check if lastVisitedNode is null
            addToOverlayHistory(Config.WARNING_NO_LAST_LOCATION_FOR_ANALYSIS); // Show warning
            console.warn(Config.WARNING_NO_LAST_LOCATION_FOR_ANALYSIS);
            return; // Exit function early if lastVisitedNode is null
        }

        ScriptState.isAnalyzing = true;
        locationData = {};
        currentNodeIndex = 0;
        ScriptState.isTrackingNode = false;
        updateProgressBar(0);
        console.log(Config.LOCATION_ANALYSIS_STARTING);
        setAnalysisStatus(Config.ANALYSIS_STATUS_PREFIX + nodeList[0]); // Initial status
        analyzeNextLocation();
    }

    /**
     * Analyzes the next location in the nodeList.
     */
    function analyzeNextLocation() {
        if (currentNodeIndex < nodeList.length) {
            const node = nodeList[currentNodeIndex];
            setAnalysisStatus(Config.ANALYSIS_STATUS_PREFIX + node);

            const roomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": node
            };
            currentWs.send(JSON.stringify(roomChangeMessage));
            console.log(`Запрос roomChange отправлен для node: ${node}`);

            const progressPercentage = Math.round(((currentNodeIndex + 1) / nodeList.length) * 100);
            updateProgressBar(progressPercentage);
        } else {
            finishLocationAnalysis();
        }
    }

    /**
     * Finishes the location analysis, displays results, and returns to the last visited node.
     */
    function finishLocationAnalysis() {
        ScriptState.isAnalyzing = false;
        setAnalysisStatus(Config.ANALYSIS_COMPLETE_STATUS);
        updateProgressBar(100);
        console.log(Config.ANALYSIS_COMPLETE_STATUS);

        const sortedLocations = Object.entries(locationData)
            .map(([node, users]) => [node, users.filter(user => user.id !== myInitiatorId)])
            .filter(([, users]) => users.length > 0)
            .sort(([, usersA], [, usersB]) => usersB.length - usersA.length);

        let popupContentHTML = `<h2>${Config.ANALYSIS_POPUP_TITLE}</h2><div style="max-height: 300px; overflow-y: auto;">`;

        if (sortedLocations.length === 0) {
            popupContentHTML += Config.ANALYSIS_POPUP_NO_USERS;
        } else {
            for (const [node, users] of sortedLocations) {
                const userNames = users.map(user => user.name).join(', ');
                popupContentHTML += `<p><b>${node}:</b> ${userNames}</p>`;
            }
        }
        popupContentHTML += '</div>';

        createAnalysisPopup(popupContentHTML);

        if (lastVisitedNode) {
            const returnRoomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": lastVisitedNode
            };
            currentWs.send(JSON.stringify(returnRoomChangeMessage));
            console.log(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${lastVisitedNode}`);
            addToOverlayHistory(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${lastVisitedNode}`);
        }
        ScriptState.isTrackingNode = true;
        setTimeout(clearAnalysisStatus, Config.MESSAGE_TIMEOUT);
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
        closeIconElement.onclick = closeAnalysisPopup;
        popupElement.appendChild(closeIconElement);
    }


    /**
     * Creates and displays the analysis results popup.
     * @param {string} contentHTML - HTML content for the popup.
     */
    function createAnalysisPopup(contentHTML) {
        if (analysisPopup) {
            closeAnalysisPopup();
        }

        analysisPopup = _createPopupElement(contentHTML);
        const closeIcon = _createCloseIcon();
        _appendCloseIconToPopup(analysisPopup, closeIcon);

        document.body.appendChild(analysisPopup);

        // --- Drag and drop logic with boundaries ---
        let isDragging = false;
        let offsetX, offsetY;

        analysisPopup.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - analysisPopup.offsetLeft;
            offsetY = e.clientY - analysisPopup.offsetTop;
            analysisPopup.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            let newLeft = e.clientX - offsetX;
            let newTop = e.clientY - offsetY;

            // Boundary checks
            if (newLeft < 0) {
                newLeft = 0;
            }
            if (newTop < 0) {
                newTop = 0;
            }
            if (newLeft > window.innerWidth - analysisPopup.offsetWidth) {
                newLeft = window.innerWidth - analysisPopup.offsetWidth;
            }
            if (newTop > window.innerHeight - analysisPopup.offsetHeight) {
                newTop = window.innerHeight - analysisPopup.offsetHeight;
            }

            analysisPopup.style.left = newLeft + 'px';
            analysisPopup.style.top = newTop + 'px';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            analysisPopup.style.cursor = 'grab';
            document.body.style.userSelect = 'auto';
        });

        analysisPopup.style.cursor = 'grab';
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
            }, 1000); // Small delay for effect
        }, 3000); // Repeat every 3 seconds
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
                marginTop: '5px', // Space between buttons
                display: 'block' // Ensure it's block for width: 100% to work in flex column
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
                display: 'none', // Initially hidden
                backgroundColor: 'rgba(30, 30, 30, 0.7)',
                borderRadius: '5px',
                marginTop: '5px',
                padding: '10px',
                width: '100%',
                boxSizing: 'border-box',
                flexDirection: 'column', // Stack menu buttons vertically
                alignItems: 'stretch' // Stretch buttons to full width
            }
        });

        // "Light" Joke Button
        jokeButtonLight = Utils.createElement('button', { // Assign to module-level variable
            attributes: { title: Config.JOKE_BUTTON_LIGHT_TOOLTIP },
            textContent: Config.JOKE_BUTTON_LIGHT_INACTIVE_TEXT, // Initial text - inactive
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
                marginBottom: '5px' // Space between menu buttons
            }
        });
        jokeButtonLight.addEventListener('click', lightToggleJoke); // Add event listener for "Light" joke
        jokesMenuContainer.appendChild(jokeButtonLight);


        const jokeButton2 = Utils.createElement('button', {
            textContent: 'Прикол 2',
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
                marginBottom: '5px' // Space between menu buttons
            }
        });
        jokesMenuContainer.appendChild(jokeButton2);

        const jokeButton3 = Utils.createElement('button', {
            textContent: 'Прикол 3',
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
        jokesMenuContainer.appendChild(jokeButton3);


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
                top: '70px',
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
            attributes: { title: Config.GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL }, // Default tooltip for "Astral" mode
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
                display: 'block' // Ensure it's block for width: 100% to work in flex column
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

        createJokesButtonAndMenu(); // Call function to create Jokes button and menu
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

        const targetNode = nodeInput.value.trim();
        if (!targetNode) {
            addToOverlayHistory(Config.WARNING_NODE_INPUT_EMPTY);
            console.warn(Config.WARNING_NODE_INPUT_EMPTY);
            return;
        }

        const roomChangeMessage = {
            "reason": "roomChange",
            "initiator": myInitiatorId,
            "node": targetNode
        };
        currentWs.send(JSON.stringify(roomChangeMessage));
        console.log(`Запрос roomChange отправлен для node: ${targetNode}`);
        addToOverlayHistory(`${Config.GO_TO_NODE_MESSAGE_PREFIX} ${targetNode}`); // Log "Astral" navigation
        goToNodeButton.textContent = Config.GO_BACK_BUTTON_TEXT;
        goToNodeButton.title = Config.GO_TO_NODE_BUTTON_TOOLTIP_BACK; // Change tooltip
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
            console.log(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${ScriptState.originalNode}`);
            addToOverlayHistory(`${Config.RETURN_TO_LAST_LOCATION_PREFIX} ${ScriptState.originalNode}`);
        }
        goToNodeButton.textContent = Config.GO_TO_ASTRAL_BUTTON_TEXT;
        goToNodeButton.title = Config.GO_TO_NODE_BUTTON_TOOLTIP_ASTRAL; // Change tooltip back
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


    window.WebSocket = function(url, protocols) {
        currentWs = new originalWebSocket(url, protocols);
        const ws = currentWs;
        const originalSend = ws.send.bind(ws);

        ws.send = function(message) {
            try {
                const data = JSON.parse(message);
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
            progressBarContainer.style.display = 'block';
            progressText.style.display = 'block';
            goToNodeContainer.style.display = 'flex';
            document.body.appendChild(goToNodeContainer);
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

                if (data.reason === 'userJoin' && data.user && data.user.name && data.user.id && data.user.id !== myInitiatorId) {
                    const userName = data.user.name;
                    const userId = data.user.id;
                    userMap[userId] = userName;
                    console.log('[NodeWatch WebSocket Listener - Обнаружено userJoin сообщение. Пользователь:', userName, 'ID:', userId);
                    addToOverlayHistory(`${Config.USER_JOIN_MESSAGE_PREFIX} ${userName}`);

                } else if (data.reason === 'userLeft' && data.initiator && data.initiator !== myInitiatorId) {
                    const userIdLeft = data.initiator;
                    const userNameLeft = userMap[userIdLeft];
                    console.log('[NodeWatch WebSocket Listener - Обнаружено userLeft сообщение. Пользователь:', userNameLeft ? userNameLeft : 'ID: ' + userIdLeft, 'ID:', userIdLeft);

                    const overlayMessage = userNameLeft ? `${Config.USER_LEFT_MESSAGE_PREFIX} ${userNameLeft}` : `${Config.USER_LEFT_MESSAGE_PREFIX} ID: ${userIdLeft}`;
                    addToOverlayHistory(overlayMessage);
                    delete userMap[userIdLeft];

                } else if (data.reason === 'nodeUsers') {
                    console.log('[NodeWatch WebSocket Listener - Обнаружено nodeUsers сообщение. Обновление userMap из nodeUsers.');
                    data.users.forEach(user => {
                        if (user.id && user.name && user.id !== myInitiatorId) {
                            userMap[user.id] = user.name;
                            console.log(`[NodeWatch WebSocket Listener - nodeUsers]: Пользователь ${user.name} (ID: ${user.id}) добавлен в userMap.`);
                        }
                    });
                    if (ScriptState.isAnalyzing) {
                        const node = nodeList[currentNodeIndex];
                        locationData[node] = data.users;
                        console.log(`Получены nodeUsers для node: ${node}, пользователей: ${data.users.length}`);
                        currentNodeIndex++;
                        analyzeNextLocation();
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
            clearAnalysisStatus();
            ScriptState.isAnalyzing = false;
            ScriptState.isTrackingNode = false;
            goToNodeContainer.style.display = 'none';
            if (goToNodeContainer.parentNode === document.body) {
                document.body.removeChild(goToNodeContainer);
            }
        });

        ws.addEventListener('error', (error) => {
            console.error('[NodeWatch WebSocket Listener]: Ошибка WebSocket для URL:', url, error);
            addToOverlayHistory(Config.WEBSocket_CONNECTION_ERROR);
            clearAnalysisStatus();
            ScriptState.isAnalyzing = false;
            ScriptState.isTrackingNode = false;
            goToNodeContainer.style.display = 'none';
            if (goToNodeContainer.parentNode === document.body) {
                document.body.removeChild(goToNodeContainer);
            }
        });

        return ws;
    };

    // CSS для мигающей кнопки
    const style = Utils.createElement('style');
    style.textContent = `
        .blinking-button {
            animation: blinker 1s linear infinite;
        }
        @keyframes blinker {
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);


    console.log('[NodeWatch WebSocket Listener]: Скрипт активен и перехватывает WebSocket на fukuro.su');
    createOverlay();
    createAnalyzeButton();
    createGoToNodeButton();
})();