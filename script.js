(() => {
    const BOARD_SIZE = 9;
    const TOTAL_CELLS = BOARD_SIZE * BOARD_SIZE;
    const INITIAL_BALLS = 5;
    const BALLS_PER_TURN = 3;
    const SCORE_PER_BALL = 10;
    const COLORS = [
        "#ff1d4d",
        "#ffeb0a",
        "#00d4ff",
        "#00b34f",
        "#004bff",
        "#bf34ff",
        "#ff7a00"
    ];

    const boardEl = document.getElementById("board");
    const scoreEl = document.getElementById("score");
    const nextEl = document.getElementById("next");
    const linesEl = document.getElementById("lines");
    const levelEl = document.getElementById("level");

    const boardState = new Array(TOTAL_CELLS).fill(null);
    const cellElements = [];

    let selectedIndex = null;
    let locked = false;
    let nextColors = [];
    let score = 0;
    let lines = 0;
    let level = 1;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const motionQuery = (typeof window !== "undefined" && typeof window.matchMedia === "function")
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const moveStepDelay = () => {
        if (motionQuery && motionQuery.matches) {
            return 0;
        }
        // Адаптивная задержка в зависимости от размера экрана
        const isMobile = window.innerWidth <= 560;
        const isSmallScreen = window.innerWidth <= 360;
        
        if (isSmallScreen) {
            return 15; // Быстрее для маленьких экранов
        } else if (isMobile) {
            return 20; // Средняя скорость для мобильных
        }
        return 30; // Стандартная скорость для десктопа
    };

    const vibrate = (pattern) => {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            try {
                // Оптимизация вибрации для мобильных устройств
                const isMobile = window.innerWidth <= 560;
                if (isMobile) {
                    // Уменьшаем интенсивность вибрации на мобильных
                    if (Array.isArray(pattern)) {
                        pattern = pattern.map(duration => Math.min(duration, 30));
                    } else {
                        pattern = Math.min(pattern, 30);
                    }
                }
                navigator.vibrate(pattern);
            } catch (error) {
                // Ignore vibration errors silently
            }
        }
    };


    const adjustLuminance = (hex, amount) => {
        let color = hex.replace(/[^0-9a-f]/gi, "");
        if (color.length === 3) {
            color = color.split("").map((char) => char + char).join("");
        }
        const num = parseInt(color, 16);
        const r = (num >> 16) & 0xff;
        const g = (num >> 8) & 0xff;
        const b = num & 0xff;
        const adjustChannel = (channel) => {
            if (amount < 0) {
                return Math.round(channel * (1 + amount));
            }
            return Math.round(channel + (255 - channel) * amount);
        };
        const newR = Math.min(255, Math.max(0, adjustChannel(r)));
        const newG = Math.min(255, Math.max(0, adjustChannel(g)));
        const newB = Math.min(255, Math.max(0, adjustChannel(b)));
        return `#${((1 << 24) + (newR << 16) + (newG << 8) + newB).toString(16).slice(1)}`;
    };

    const coordToIndex = (row, col) => row * BOARD_SIZE + col;

    const indexToCoord = (index) => ({
        row: Math.floor(index / BOARD_SIZE),
        col: index % BOARD_SIZE
    });

    const inside = (row, col) => row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;

    const getNeighbors = (index) => {
        const { row, col } = indexToCoord(index);
        const deltas = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
        ];

        const neighbors = [];
        for (const [dy, dx] of deltas) {
            const nr = row + dy;
            const nc = col + dx;
            if (inside(nr, nc)) {
                neighbors.push(coordToIndex(nr, nc));
            }
        }
        return neighbors;
    };

    const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    const randomColors = (count) => Array.from({ length: count }, randomColor);

    const emptyCells = () => {
        const result = [];
        boardState.forEach((value, idx) => {
            if (value === null) {
                result.push(idx);
            }
        });
        return result;
    };

    const createBallElement = (color, extraClass = "") => {
        const ball = document.createElement("div");
        const highlight = adjustLuminance(color, 0.5);
        const midtone = adjustLuminance(color, 0.15);
        const shadow = adjustLuminance(color, -0.55);
        ball.className = `ball ${extraClass}`.trim();
        ball.style.background = [
            `radial-gradient(circle at 28% 28%, ${highlight} 0%, rgba(255, 255, 255, 0) 44%)`,
            `radial-gradient(circle at 70% 70%, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 58%)`,
            `radial-gradient(circle at 50% 50%, ${midtone} 0%, ${shadow} 95%)`
        ].join(", ");
        ball.dataset.color = color;
        return ball;
    };

    const setBall = (index, color, { animate = false } = {}) => {
        boardState[index] = color;
        const cell = cellElements[index];
        cell.innerHTML = "";
        if (color) {
            const ball = createBallElement(color, animate ? "ball--spawn" : "");
            cell.appendChild(ball);
        }
    };

    const removeBall = (index) => {
        boardState[index] = null;
        const cell = cellElements[index];
        cell.innerHTML = "";
    };


    const animateBallMove = async (path) => {
        if (!path || path.length < 2) {
            return false;
        }
        const [start] = path;
        const startCell = cellElements[start];
        if (!startCell) {
            return false;
        }
        const originalBall = startCell.querySelector(".ball");
        if (!originalBall) {
            return false;
        }

        // Кэшируем размеры один раз
        const boardRect = boardEl.getBoundingClientRect();
        const ballRect = originalBall.getBoundingClientRect();
        const ballSize = Math.min(ballRect.width, ballRect.height);
        
        // Создаем клон с оптимизированными стилями для GPU
        const clone = originalBall.cloneNode(true);
        clone.classList.add("ball--falling");
        
        // Используем transform вместо left/top для лучшей производительности
        const startX = ballRect.left - boardRect.left + (ballRect.width - ballSize) / 2;
        const startY = ballRect.top - boardRect.top + (ballRect.height - ballSize) / 2;
        
        clone.style.position = "absolute";
        clone.style.left = `${startX}px`;
        clone.style.top = `${startY}px`;
        clone.style.width = `${ballSize}px`;
        clone.style.height = `${ballSize}px`;
        clone.style.zIndex = "20";
        clone.style.transform = "translate3d(0, 0, 0)"; // Включаем аппаратное ускорение
        clone.style.willChange = "transform"; // Подсказка браузеру
        
        boardEl.appendChild(clone);
        removeBall(start);

        const stepDelay = moveStepDelay();
        
        if (stepDelay === 0) {
            // Мгновенное перемещение для быстрых устройств
            clone.remove();
            return true;
        } else {
            // Анимация проваливания
            const lastRect = cellElements[path[path.length - 1]].getBoundingClientRect();
            const targetX = lastRect.left - boardRect.left + (lastRect.width - ballSize) / 2;
            const targetY = lastRect.top - boardRect.top + (lastRect.height - ballSize) / 2;
            
            // Сначала шарик проваливается вниз с эффектом уменьшения
            clone.style.transitionDuration = `${stepDelay * 2}ms`;
            clone.style.transitionTimingFunction = "ease-in";
            clone.style.transform = `translate3d(${targetX - startX}px, ${targetY - startY + boardRect.height}px, 0) scale(0.3)`;
            clone.style.opacity = "0.1";
            
            await wait(stepDelay * 2);
            
            // Затем появляется снизу в целевой позиции с эффектом увеличения
            clone.style.transitionDuration = `${stepDelay}ms`;
            clone.style.transitionTimingFunction = "ease-out";
            clone.style.transform = `translate3d(${targetX - startX}px, ${targetY - startY}px, 0) scale(1)`;
            clone.style.opacity = "1";
            
            await wait(stepDelay);
        }
        
        // Очищаем will-change после анимации
        clone.style.willChange = "auto";
        clone.remove();
        return true;
    };

    const updateScore = () => {
        scoreEl.textContent = score.toString().padStart(5, '0');
        linesEl.textContent = lines.toString().padStart(5, '0');
        levelEl.textContent = level.toString().padStart(5, '0');
    };

    const updateNextPreview = () => {
        nextEl.innerHTML = "";
        nextColors.forEach((color) => {
            nextEl.appendChild(createBallElement(color));
        });
    };

    const clearSelection = () => {
        if (selectedIndex !== null) {
            cellElements[selectedIndex].classList.remove("cell--highlight");
        }
        selectedIndex = null;
    };

    const selectIndex = (index) => {
        clearSelection();
        selectedIndex = index;
        cellElements[index].classList.add("cell--highlight");
        vibrate(20);
    };

    const findPath = (start, target) => {
        if (start === target) {
            return [start];
        }

        const queue = [start];
        const visited = new Array(TOTAL_CELLS).fill(false);
        const previous = new Array(TOTAL_CELLS).fill(-1);
        visited[start] = true;

        while (queue.length > 0) {
            const current = queue.shift();
            for (const neighbor of getNeighbors(current)) {
                if (visited[neighbor]) {
                    continue;
                }
                if (neighbor !== target && boardState[neighbor] !== null) {
                    continue;
                }
                visited[neighbor] = true;
                previous[neighbor] = current;
                if (neighbor === target) {
                    queue.length = 0;
                    break;
                }
                queue.push(neighbor);
            }
        }

        if (!visited[target]) {
            return null;
        }

        const path = [target];
        let node = target;
        while (previous[node] !== -1) {
            node = previous[node];
            path.push(node);
        }
        return path.reverse();
    };

    const collectLinesFrom = (index) => {
        const color = boardState[index];
        if (!color) {
            return [];
        }
        const groups = [];
        const directions = [
            [1, 0],
            [0, 1],
            [1, 1],
            [1, -1]
        ];

        for (const [dy, dx] of directions) {
            const line = [index];
            for (const sign of [1, -1]) {
                let { row, col } = indexToCoord(index);
                while (true) {
                    row += dy * sign;
                    col += dx * sign;
                    if (!inside(row, col)) {
                        break;
                    }
                    const idx = coordToIndex(row, col);
                    if (boardState[idx] === color) {
                        line.push(idx);
                    } else {
                        break;
                    }
                }
            }
            if (line.length >= 5) {
                groups.push(line);
            }
        }
        if (!groups.length) {
            return [];
        }
        const unique = new Set();
        groups.forEach((line) => line.forEach((idx) => unique.add(idx)));
        return [...unique];
    };

    const clearLines = async (indices) => {
        if (!indices.length) {
            return;
        }
        const unique = [...new Set(indices)];
        unique.forEach((index) => {
            const cell = cellElements[index];
            const ball = cell.querySelector(".ball");
            if (ball) {
                ball.classList.add("ball--vanish");
            }
        });
        await wait(180);
        unique.forEach(removeBall);
        score += unique.length * SCORE_PER_BALL;
        lines += 1;
        if (lines % 10 === 0) {
            level += 1;
        }
        updateScore();
        vibrate([40, 30, 40]);
    };

    const spawnBalls = async (colors) => {
        const empties = emptyCells();
        if (!empties.length) {
            return [];
        }
        const spawnedIndices = [];
        for (const color of colors) {
            if (!empties.length) {
                break;
            }
            const randomIdx = Math.floor(Math.random() * empties.length);
            const index = empties.splice(randomIdx, 1)[0];
            setBall(index, color, { animate: true });
            spawnedIndices.push(index);
        }
        if (!spawnedIndices.length) {
            return [];
        }
        const allToClear = new Set();
        spawnedIndices.forEach((index) => {
            collectLinesFrom(index).forEach((idx) => allToClear.add(idx));
        });
        if (allToClear.size) {
            await clearLines([...allToClear]);
        }
        return spawnedIndices;
    };

    const gameOver = () => {
        locked = true;
        vibrate([80, 40, 80]);
    };

    const attemptMove = async (from, to) => {
        if (locked) {
            return;
        }
        locked = true;
        const path = findPath(from, to);
        if (!path) {
            vibrate(120);
            locked = false;
            return;
        }
        const color = boardState[from];
        const animated = await animateBallMove(path);
        if (!animated) {
            removeBall(from);
        }
        setBall(to, color, { animate: !animated });
        const toClear = collectLinesFrom(to);
        if (toClear.length) {
            await clearLines(toClear);
            nextColors = randomColors(BALLS_PER_TURN);
            updateNextPreview();
        } else {
            await spawnBalls(nextColors);
            nextColors = randomColors(BALLS_PER_TURN);
            updateNextPreview();
        }
        clearSelection();
        if (emptyCells().length === 0) {
            gameOver();
        } else {
            locked = false;
        }
    };

    const handleCellInteraction = (index) => {
        if (locked) {
            return;
        }
        if (boardState[index]) {
            if (selectedIndex === index) {
                clearSelection();
            } else {
                selectIndex(index);
            }
            return;
        }
        if (selectedIndex !== null) {
            attemptMove(selectedIndex, index);
        }
    };

    const buildBoard = () => {
        boardEl.innerHTML = "";
        for (let index = 0; index < TOTAL_CELLS; index += 1) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.index = index;
            
            // Оптимизированная обработка событий для мобильных устройств
            let touchStartTime = 0;
            let touchStartPos = { x: 0, y: 0 };
            
            const handleInteraction = (event) => {
                // Предотвращаем двойные срабатывания
                if (locked) {
                    event.preventDefault();
                    return;
                }
                
                // Для touch событий проверяем, что это не скролл
                if (event.type === 'touchend') {
                    const touch = event.changedTouches[0];
                    const deltaX = Math.abs(touch.clientX - touchStartPos.x);
                    const deltaY = Math.abs(touch.clientY - touchStartPos.y);
                    const deltaTime = Date.now() - touchStartTime;
                    
                    // Если движение слишком большое или время слишком короткое - игнорируем
                    if (deltaX > 10 || deltaY > 10 || deltaTime < 100) {
                        return;
                    }
                    
                    event.preventDefault();
                }
                
                handleCellInteraction(index);
            };
            
            // Touch события
            cell.addEventListener("touchstart", (event) => {
                const touch = event.touches[0];
                touchStartTime = Date.now();
                touchStartPos = { x: touch.clientX, y: touch.clientY };
            }, { passive: true });
            
            cell.addEventListener("touchend", handleInteraction, { passive: false });
            
            // Click события (для десктопа)
            cell.addEventListener("click", (event) => {
                // Игнорируем click если это было touch событие
                if (Date.now() - touchStartTime < 500) {
                    event.preventDefault();
                    return;
                }
                handleInteraction(event);
            });
            
            // Клавиатурные события
            cell.addEventListener("keyup", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleInteraction(event);
                }
            });
            
            boardEl.appendChild(cell);
            cellElements.push(cell);
        }
    };

    const resetState = () => {
        boardState.fill(null);
        cellElements.forEach((cell) => {
            cell.innerHTML = "";
            cell.classList.remove("cell--highlight");
        });
        score = 0;
        lines = 0;
        level = 1;
        locked = false;
        selectedIndex = null;
        nextColors = randomColors(BALLS_PER_TURN);
        updateScore();
        updateNextPreview();
    };

    const startGame = async () => {
        resetState();
        await spawnBalls(randomColors(INITIAL_BALLS));
    };

    const handleNewGame = () => {
        if (locked) {
            locked = false;
        }
        startGame();
    };

    buildBoard();
    
    // Добавляем обработчик для новой игры по клику на игровое поле
    boardEl.addEventListener("dblclick", handleNewGame);
    
    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
            event.preventDefault();
            handleNewGame();
        }
    });

    startGame();
})();
