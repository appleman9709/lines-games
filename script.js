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
    const statusEl = document.getElementById("status");
    const newGameBtn = document.getElementById("newGame");
    const themeSelect = document.getElementById("themeSelect");
    const THEMES = {
        modern: "theme-modern",
        classic: "theme-classic"
    };
    const THEME_STORAGE_KEY = "lines98-theme";
    const DEFAULT_THEME = "modern";
    const themeClassList = Object.values(THEMES);

    const boardState = new Array(TOTAL_CELLS).fill(null);
    const cellElements = [];

    let selectedIndex = null;
    let locked = false;
    let nextColors = [];
    let score = 0;

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const motionQuery = (typeof window !== "undefined" && typeof window.matchMedia === "function")
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;

    const moveStepDelay = () => (motionQuery && motionQuery.matches ? 0 : 30);

    const vibrate = (pattern) => {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
            try {
                navigator.vibrate(pattern);
            } catch (error) {
                // Ignore vibration errors silently
            }
        }
    };

    const readStoredTheme = () => {
        if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
            return null;
        }
        try {
            return window.localStorage.getItem(THEME_STORAGE_KEY);
        } catch (error) {
            return null;
        }
    };

    const persistTheme = (value) => {
        if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
            return;
        }
        try {
            window.localStorage.setItem(THEME_STORAGE_KEY, value);
        } catch (error) {
            // Ignore storage errors silently
        }
    };

    const applyTheme = (theme, { persist = false } = {}) => {
        const normalized = Object.prototype.hasOwnProperty.call(THEMES, theme) ? theme : DEFAULT_THEME;
        if (typeof document !== "undefined" && document.body) {
            document.body.classList.remove(...themeClassList);
            document.body.classList.add(THEMES[normalized]);
        }
        if (themeSelect) {
            themeSelect.value = normalized;
        }
        if (persist) {
            persistTheme(normalized);
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
        const boardRect = boardEl.getBoundingClientRect();
        const ballRect = originalBall.getBoundingClientRect();
        const clone = originalBall.cloneNode(true);
        clone.classList.add("ball--in-flight");
        clone.style.left = `${ballRect.left - boardRect.left}px`;
        clone.style.top = `${ballRect.top - boardRect.top}px`;
        clone.style.width = `${ballRect.width}px`;
        clone.style.height = `${ballRect.height}px`;
        clone.style.zIndex = "20";
        const stepDelay = moveStepDelay();
        clone.style.transitionDuration = stepDelay ? `${stepDelay}ms` : "0ms";
        boardEl.appendChild(clone);
        removeBall(start);
        const ballWidth = ballRect.width;
        const ballHeight = ballRect.height;
        if (stepDelay === 0) {
            const lastRect = cellElements[path[path.length - 1]].getBoundingClientRect();
            const targetLeft = lastRect.left - boardRect.left + (lastRect.width - ballWidth) / 2;
            const targetTop = lastRect.top - boardRect.top + (lastRect.height - ballHeight) / 2;
            clone.style.left = `${targetLeft}px`;
            clone.style.top = `${targetTop}px`;
            await wait(0);
        } else {
            for (let i = 1; i < path.length; i += 1) {
                const cellRect = cellElements[path[i]].getBoundingClientRect();
                const targetLeft = cellRect.left - boardRect.left + (cellRect.width - ballWidth) / 2;
                const targetTop = cellRect.top - boardRect.top + (cellRect.height - ballHeight) / 2;
                clone.style.left = `${targetLeft}px`;
                clone.style.top = `${targetTop}px`;
                await wait(stepDelay);
            }
        }
        clone.remove();
        return true;
    };

    const updateScore = () => {
        scoreEl.textContent = score.toString();
    };

    const updateNextPreview = () => {
        nextEl.innerHTML = "";
        nextColors.forEach((color) => {
            nextEl.appendChild(createBallElement(color));
        });
    };

    const setStatus = (text) => {
        statusEl.textContent = text;
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
        updateScore();
        setStatus(`Удалено ${unique.length} шаров`);
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
        setStatus("Игра окончена. Попробуйте снова!");
        vibrate([80, 40, 80]);
    };

    const attemptMove = async (from, to) => {
        if (locked) {
            return;
        }
        locked = true;
        const path = findPath(from, to);
        if (!path) {
            setStatus("Путь заблокирован");
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
            setStatus("Ходите");
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
                setStatus("Выберите шар");
            } else {
                selectIndex(index);
                setStatus("Выберите свободную клетку для перемещения");
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
            cell.addEventListener("click", () => handleCellInteraction(index));
            cell.addEventListener("touchend", (event) => {
                event.preventDefault();
                handleCellInteraction(index);
            }, { passive: false });
            cell.addEventListener("keyup", (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    handleCellInteraction(index);
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
        locked = false;
        selectedIndex = null;
        nextColors = randomColors(BALLS_PER_TURN);
        updateScore();
        updateNextPreview();
        setStatus("Соберите линии из пяти шаров");
    };

    const startGame = async () => {
        resetState();
        await spawnBalls(randomColors(INITIAL_BALLS));
        setStatus("Ходите");
    };

    const handleNewGame = () => {
        if (locked) {
            locked = false;
        }
        startGame();
    };

    const storedTheme = readStoredTheme();
    applyTheme(storedTheme || DEFAULT_THEME);

    buildBoard();
    newGameBtn.addEventListener("click", handleNewGame);
    if (themeSelect) {
        themeSelect.addEventListener("change", (event) => {
            applyTheme(event.target.value, { persist: true });
        });
    }
    window.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") {
            event.preventDefault();
            handleNewGame();
        }
    });

    startGame();
})();
