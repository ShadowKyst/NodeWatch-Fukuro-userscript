// ==UserScript==
// @name         NodeWatch
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  WebSocket listener for fukuro.su, displaying user join/leave events and location analysis results in an overlay and popup. Performs automated location scans and returns to the original location.
// @author       ShadowKyst
// @match        https://www.fukuro.su/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const originalWebSocket = window.WebSocket;
    const userMap = {};
    let overlayDiv = null;
    const overlayHistory = [];
    const historySize = 5;
    const messageTimeout = 5000;
    const fadeOutDuration = 500;
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
    let isAnalyzing = false;
    let currentWs = null;
    let analysisPopup = null;
    let lastVisitedNode = null;
    let isTrackingNode = true;
    let analysisStatusDiv = null;

    // New Node Navigation Variables
    let goToNodeButton = null;
    let originalNode = null;     // To store the node before navigation
    let nodeInput = null;         // Input field for node
    let currentNodeDisplay = null; // Display current node
    let goToNodeContainer = null; // Container for GoToNode elements (module-level)

    function createOverlay() {
        overlayDiv = document.createElement('div');
        overlayDiv.id = 'websocket-overlay';
        Object.assign(overlayDiv.style, {
            position: 'fixed',
            top: '10px',
            right: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: '1000',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            textAlign: 'left',
            maxWidth: '300px',
            overflowWrap: 'break-word',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end'
        });
        document.body.appendChild(overlayDiv);
        overlayDiv.textContent = "WebSocket Listener Активен";
    }

    function clearOverlayInitialMessage() {
        if (overlayDiv) {
            overlayDiv.innerHTML = '';
        }
    }

    function updateOverlay(message) {
        if (!overlayDiv) {
            createOverlay();
        }
        overlayHistory.push(message);
        if (overlayHistory.length > historySize) {
            overlayHistory.shift();
        }
        overlayDiv.innerHTML = '';
        if (analysisStatusDiv) {
            overlayDiv.appendChild(analysisStatusDiv);
        }
        overlayHistory.forEach(histMessage => {
            const messageDiv = document.createElement('div');
            messageDiv.textContent = messageText;
            overlayDiv.appendChild(messageDiv);
        });
    }

    function setAnalysisStatus(statusText) {
        if (!analysisStatusDiv) {
            analysisStatusDiv = document.createElement('div');
            overlayDiv.prepend(analysisStatusDiv);
        }
        analysisStatusDiv.textContent = statusText;
    }

    function clearAnalysisStatus() {
        if (analysisStatusDiv && overlayDiv.contains(analysisStatusDiv)) {
            overlayDiv.removeChild(analysisStatusDiv);
            analysisStatusDiv = null;
        }
    }


    function addToOverlayHistory(messageText) {
        if (!overlayDiv) {
            createOverlay();
        }
        const messageDiv = document.createElement('div');
        messageDiv.textContent = messageText;
        Object.assign(messageDiv.style, {
            opacity: '1',
            transition: `opacity ${fadeOutDuration}ms ease-in-out`
        });
        overlayDiv.appendChild(messageDiv);

        overlayHistory.push(messageDiv);
        if (overlayHistory.length > historySize) {
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
            }, fadeOutDuration);
        }, messageTimeout);
    }


    function createAnalyzeButton() {
        analyzeButton = document.createElement('button');
        analyzeButton.textContent = 'Найти РП';
        Object.assign(analyzeButton.style, {
            position: 'fixed',
            top: '10px',
            left: '10px',
            zIndex: '1000',
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
            width: '150px' // Set width to Analyze button
        });

        analyzeButton.addEventListener('mouseover', () => {
            analyzeButton.style.backgroundColor = 'rgba(70, 70, 70, 0.7)';
        });
        analyzeButton.addEventListener('mouseout', () => {
            analyzeButton.style.backgroundColor = 'rgba(50, 50, 50, 0.6)';
        });

        document.body.appendChild(analyzeButton);
        analyzeButton.addEventListener('click', startLocationAnalysis);

        progressBarContainer = document.createElement('div');
        Object.assign(progressBarContainer.style, {
            position: 'fixed',
            top: '45px',
            left: '10px',
            width: '150px',
            height: '10px',
            backgroundColor: 'rgba(100, 100, 100, 0.3)',
            borderRadius: '5px',
            overflow: 'hidden',
            zIndex: '1000',
            display: 'none'
        });
        document.body.appendChild(progressBarContainer);

        progressBar = document.createElement('div');
        Object.assign(progressBar.style, {
            width: '0%',
            height: '100%',
            backgroundColor: 'rgba(0, 150, 0, 0.7)'
        });
        progressBarContainer.appendChild(progressBar);

        progressText = document.createElement('div');
        Object.assign(progressText.style, {
            position: 'fixed',
            top: '45px',
            left: '170px',
            color: '#eee',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            zIndex: '1000',
            display: 'none'
        });
        progressText.textContent = '0%';
        document.body.appendChild(progressText);
    }

    function updateProgressBar(percentage) {
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    }


    function startLocationAnalysis() {
        if (isAnalyzing) {
            console.log("Анализ уже запущен.");
            return;
        }
        if (!myInitiatorId) {
            console.log("Initiator ID не получен. Перезагрузите страницу.");
            return;
        }

        isAnalyzing = true;
        locationData = {};
        currentNodeIndex = 0;
        isTrackingNode = false;
        updateProgressBar(0);
        console.log("Начинаю анализ локаций...");
        setAnalysisStatus("Анализ локаций...");
        analyzeNextLocation();
    }

    function analyzeNextLocation() {
        if (currentNodeIndex < nodeList.length) {
            const node = nodeList[currentNodeIndex];
            setAnalysisStatus(`Анализ локаций: ${node}`);

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

    function finishLocationAnalysis() {
        isAnalyzing = false;
        setAnalysisStatus("Анализ локаций завершен");
        updateProgressBar(100);
        console.log("Анализ локаций завершен!");

        const sortedLocations = Object.entries(locationData)
            .map(([node, users]) => [node, users.filter(user => user.id !== myInitiatorId)])
            .filter(([, users]) => users.length > 0)
            .sort(([, usersA], [, usersB]) => usersB.length - usersA.length);

        let popupContentHTML = '<h2>Результаты анализа локаций:</h2><div style="max-height: 300px; overflow-y: auto;">';

        if (sortedLocations.length === 0) {
            popupContentHTML += "<p>Нет пользователей в локациях (кроме вас).</p>";
        } else {
            for (const [node, users] of sortedLocations) {
                const userNames = users.map(user => user.name).join(', ');
                popupContentHTML += `<p><b>${node}:</b> ${node} - ${userNames}</p>`;
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
            console.log(`Возвращаюсь в последнюю локацию: ${lastVisitedNode}`);
            addToOverlayHistory(`Возврат в: ${lastVisitedNode}`);
        }
        isTrackingNode = true;
        setTimeout(clearAnalysisStatus, messageTimeout);
    }

    function createAnalysisPopup(contentHTML) {
        if (analysisPopup) {
            document.body.removeChild(analysisPopup);
            analysisPopup = null;
        }

        analysisPopup = document.createElement('div');
        Object.assign(analysisPopup.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(20, 20, 20, 0.9)',
            color: 'white',
            padding: '20px',
            borderRadius: '10px',
            zIndex: '1001',
            fontFamily: 'sans-serif',
            fontSize: '16px',
            textAlign: 'left',
            maxWidth: '400px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.5)'
        });

        analysisPopup.innerHTML = contentHTML;

        // Create close icon крестик
        const closeIcon = document.createElement('div');
        closeIcon.id = 'popup-close-icon';
        Object.assign(closeIcon.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            width: '20px',
            height: '20px',
            cursor: 'pointer',
            opacity: '0.7'
        });

        // Styling for the крестик (X) using CSS pseudo-elements
        closeIcon.innerHTML = `
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
        `;

        closeIcon.onclick = closeAnalysisPopup;
        analysisPopup.appendChild(closeIcon);

        document.body.appendChild(analysisPopup);
    }

    function closeAnalysisPopup() {
        if (analysisPopup) {
            document.body.removeChild(analysisPopup);
            analysisPopup = null;
        }
    }

    function createGoToNodeButton() {
        // Container for button and input
        goToNodeContainer = document.createElement('div'); // Assign to module-level variable
        Object.assign(goToNodeContainer.style, {
            position: 'fixed',
            top: '70px',
            left: '10px',
            zIndex: '1000',
            display: 'none', // Initially hidden
            display: 'flex',
            flexDirection: 'column', // Changed to column to stack vertically
            alignItems: 'flex-start',
            width: '150px' // Set width for the container to match Analyze Button
        });


        // Input field for Node name
        nodeInput = document.createElement('input'); // Assign to module-level variable
        nodeInput.type = 'text';
        nodeInput.id = 'node-input';
        nodeInput.placeholder = 'Node';
        Object.assign(nodeInput.style, {
            width: '100%',      // Input field takes full width of container
            padding: '8px',
            borderRadius: '5px',
            border: '1px solid #777',
            backgroundColor: 'rgba(30, 30, 30, 0.7)',
            color: '#eee',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            marginBottom: '5px', // Space below input
            boxSizing: 'border-box' // Make padding and border part of the element's total width
        });
        goToNodeContainer.appendChild(nodeInput);

        goToNodeButton = document.createElement('button');
        goToNodeButton.textContent = 'Астрал';
        Object.assign(goToNodeButton.style, {
            width: '100%',      // Button takes full width of container
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
            boxSizing: 'border-box' // Make padding and border part of the element's total width
        });

        goToNodeButton.addEventListener('mouseover', () => {
            goToNodeButton.style.backgroundColor = 'rgba(70, 70, 70, 0.7)';
        });
        goToNodeButton.addEventListener('mouseout', () => {
            goToNodeButton.style.backgroundColor = 'rgba(50, 50, 50, 0.6)';
        });

        goToNodeButton.addEventListener('click', handleGoToNodeClick);
        goToNodeContainer.appendChild(goToNodeButton);

        // Display for current node below input and button
        currentNodeDisplay = document.createElement('div');
        currentNodeDisplay.id = 'current-node-display';
        currentNodeDisplay.textContent = 'Вы сейчас в: -';
        Object.assign(currentNodeDisplay.style, {
            color: '#ccc',
            fontSize: '12px',
            fontFamily: 'sans-serif',
            marginTop: '5px',
            textAlign: 'left',
            width: '100%',
            boxSizing: 'border-box' // Make padding and border part of the element's total width
        });
        goToNodeContainer.appendChild(currentNodeDisplay);
    }

    function handleGoToNodeClick() {
        if (goToNodeButton.textContent === 'Астрал') { // Text changed to 'Астрал'
            // 1. Remember current location
            originalNode = lastVisitedNode;

            // 2. Check if location is null
            originalNode = lastVisitedNode;
            if (!originalNode) {
                addToOverlayHistory("Предупреждение: Невозможно запомнить текущую локацию.");
                console.warn("Current location is null, cannot proceed with navigation.");
                return; // Stop here if no location is remembered
            }

            // 3. Get node from input field
            const targetNode = nodeInput.value.trim(); // Get value from input field (using module-level variable)

            if (!targetNode) { // Check if input is empty
                addToOverlayHistory("Предупреждение: Введите имя Node.");
                console.warn("Node input is empty, cannot proceed with navigation.");
                return;
            }


            // 4. Send roomChange request with user-entered node
            const roomChangeMessage = {
                "reason": "roomChange",
                "initiator": myInitiatorId,
                "node": targetNode
            };
            currentWs.send(JSON.stringify(roomChangeMessage));
            console.log(`Запрос roomChange отправлен для node: ${targetNode}`);

            // 5. Change button text
            goToNodeButton.textContent = 'Вернуться';

        } else if (goToNodeButton.textContent === 'Вернуться') {
            // 6. Return to original location
            if (originalNode) {
                const returnRoomChangeMessage = {
                    "reason": "roomChange",
                    "initiator": myInitiatorId,
                    "node": originalNode
                };
                currentWs.send(JSON.stringify(returnRoomChangeMessage));
                console.log(`Возврат в последнюю локацию: ${originalNode}`);
                addToOverlayHistory(`Возврат в: ${originalNode}`);
            }

            // 7. Reset button state
            goToNodeButton.textContent = 'Астрал';
            originalNode = null; // Clear remembered location
        }
    }


    window.WebSocket = function(url, protocols) {
        currentWs = new originalWebSocket(url, protocols);
        const ws = currentWs;
        const originalSend = ws.send.bind(ws);

        ws.send = function(message) {
            try {
                const data = JSON.parse(message);
                if (data.reason === 'roomChange' && data.initiator === myInitiatorId && isTrackingNode) {
                    lastVisitedNode = data.node;
                    console.log(`[NodeWatch WebSocket Listener]: Last visited node запомнен: ${lastVisitedNode}`);
                    if (currentNodeDisplay) { // Update current node display
                        currentNodeDisplay.textContent = `Вы сейчас в: ${lastVisitedNode}`;
                    }
                }
            } catch (e) { /* Ignore JSON parse errors */ }
            originalSend(message);
        };


        ws.addEventListener('open', () => {
            console.log('[NodeWatch WebSocket Listener]: WebSocket соединение установлено для URL:', url);
            addToOverlayHistory("WebSocket: Соединение установлено");
            clearOverlayInitialMessage();
            analyzeButton.style.display = 'block';
            progressBarContainer.style.display = 'block';
            progressText.style.display = 'block';
            goToNodeContainer.style.display = 'flex'; // Show the container for input and button
            document.body.appendChild(goToNodeContainer); // Append to body only when WebSocket opens
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
                    addToOverlayHistory(`[User Join] ${userName}`);

                } else if (data.reason === 'userLeft' && data.initiator && data.initiator !== myInitiatorId) {
                    const userIdLeft = data.initiator;
                    const userNameLeft = userMap[userIdLeft];
                    console.log('[NodeWatch WebSocket Listener - Обнаружено userLeft сообщение. Пользователь:', userNameLeft ? userNameLeft : 'ID: ' + userIdLeft, 'ID:', userIdLeft);

                    const overlayMessage = userNameLeft ? `[User Left] ${userNameLeft}` : `[User Left] ID: ${userIdLeft}`;
                    addToOverlayHistory(overlayMessage);
                    delete userMap[userIdLeft];

                } else if (data.reason === 'nodeUsers') {
                    if (isAnalyzing) {
                        const node = nodeList[currentNodeIndex];
                        locationData[node] = data.users;
                        console.log(`Получены nodeUsers для node: ${node}, пользователей: ${data.users.length}`);
                        currentNodeIndex++;
                        analyzeNextLocation();
                    }
                }
            } catch (e) { /* JSON parse error handling */ }
        });

        ws.addEventListener('close', () => {
            console.log('[NodeWatch WebSocket Listener]: WebSocket соединение закрыто для URL:', url);
            addToOverlayHistory("WebSocket: Соединение закрыто");
            clearAnalysisStatus();
            isAnalyzing = false;
            isTrackingNode = false;
            goToNodeContainer.style.display = 'none'; // Hide the input and button container
            if (goToNodeContainer.parentNode === document.body) { // Check if it's appended before removing
                document.body.removeChild(goToNodeContainer); // Cleanly remove from DOM on close
            }
        });

        ws.addEventListener('error', (error) => {
            console.error('[NodeWatch WebSocket Listener]: Ошибка WebSocket для URL:', url, error);
            addToOverlayHistory("WebSocket: Ошибка соединения");
            clearAnalysisStatus();
            isAnalyzing = false;
            isTrackingNode = false;
            goToNodeContainer.style.display = 'none'; // Hide the input and button container
            if (goToNodeContainer.parentNode === document.body) { // Check if it's appended before removing
                document.body.removeChild(goToNodeContainer); // Cleanly remove from DOM on error
            }
        });

        return ws;
    };

    console.log('[NodeWatch WebSocket Listener]: Скрипт активен и перехватывает WebSocket на fukuro.su');
    createOverlay();
    createAnalyzeButton();
    createGoToNodeButton(); // Create button and input - but don't append yet
})();