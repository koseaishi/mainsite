const SPEED = 24;
const LINES = 60;
const TAIL = 60;
const EDGE_OPACITY = 0.5;
const MIDDLE_STRENGTH = 0;
const FALLOFF_WIDTH = 1.4;
const COLUMNS = 64;
const COLOR = "228,217,213";
const SNAKE_CELL_SIZE = 2;
const MIN_INTERACTIVE_OPACITY = 0.05;
const DEATH_DURATION = 1;
const LINE_FADE_DURATION = 0.4;
const BOOST_DURATION = 3;
const BOOST_COOLDOWN = 10;
const BOOST_SNAKE_MULTIPLIER = 3;
const BOOST_LINE_MULTIPLIER = 0.4;

const DIRECTIONS = {
    w: { column: 0, row: -1 },
    a: { column: -1, row: 0 },
    s: { column: 0, row: 1 },
    d: { column: 1, row: 0 },
};

const canvas = document.querySelector("#background-lines");
const context = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let width = 0;
let height = 0;
let pixelRatio = 1;
let columnWidth = 0;
let lines = [];
let snake = null;
let animationFrame = 0;
let lastFrameTime = 0;
let boostRemaining = 0;
let boostCooldownRemaining = 0;

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function createLine(y) {
    return {
        column: Math.floor(Math.random() * COLUMNS),
        y,
        speed: SPEED * randomBetween(0.6, 1.4),
        tail: TAIL * randomBetween(0.5, 1.3),
        opacity: randomBetween(0.4, 1),
        fading: false,
        fadeElapsed: 0,
    };
}

function snakeX(column) {
    return snake.originX + column * SNAKE_CELL_SIZE;
}

function snakeY(row) {
    return snake.originY + row * SNAKE_CELL_SIZE;
}

function columnCenter(column) {
    return (column + 0.5) * columnWidth;
}

function resizeCanvas() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    pixelRatio = window.devicePixelRatio || 1;
    columnWidth = width / COLUMNS;

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    if (snake?.alive) {
        const head = snake.body[0];
        if (snakeX(head.column) < 0 || snakeX(head.column) > width
            || snakeY(head.row) < 0 || snakeY(head.row) > height) {
            killSnake();
        }
    }

    if (reducedMotion.matches) {
        draw();
    }
}

function edgeFactor(x) {
    const normalizedX = Math.abs(x - width / 2) / (width / 2);
    const t = Math.min(1, normalizedX / FALLOFF_WIDTH);
    const smoothStep = t * t * (3 - 2 * t);
    return MIDDLE_STRENGTH + (1 - MIDDLE_STRENGTH) * smoothStep;
}

function lineOpacity(line) {
    return EDGE_OPACITY * line.opacity * edgeFactor(columnCenter(line.column));
}

function snakePoints(progressOverride) {
    if (!snake.alive && snake.deathPoints) {
        return snake.deathPoints;
    }

    const progress = progressOverride ?? Math.min(1, snake.progress);

    return snake.body.map((cell, index) => {
        const target = index === 0
            ? {
                column: cell.column + snake.direction.column,
                row: cell.row + snake.direction.row,
            }
            : snake.body[index - 1];

        return {
            x: snakeX(cell.column)
                + (snakeX(target.column) - snakeX(cell.column)) * progress,
            y: snakeY(cell.row) + (snakeY(target.row) - snakeY(cell.row)) * progress,
        };
    });
}

function killSnake(progress) {
    if (!snake?.alive) {
        return;
    }

    snake.deathPoints = snakePoints(progress);
    snake.alive = false;
    snake.deathElapsed = 0;
}

function drawLines() {
    for (const line of lines) {
        const x = columnCenter(line.column);
        const fadeOpacity = line.fading
            ? Math.max(0, 1 - line.fadeElapsed / LINE_FADE_DURATION)
            : 1;
        const alpha = lineOpacity(line) * fadeOpacity;
        const gradient = context.createLinearGradient(x, line.y - line.tail, x, line.y);
        gradient.addColorStop(0, `rgba(${COLOR}, 0)`);
        gradient.addColorStop(1, `rgba(${COLOR}, ${alpha})`);

        context.beginPath();
        context.strokeStyle = gradient;
        context.lineWidth = 1;
        context.moveTo(x, line.y - line.tail);
        context.lineTo(x, line.y);
        context.stroke();
    }
}

function drawSnake() {
    if (!snake) {
        return;
    }

    const deathOpacity = snake.alive ? 1 : Math.max(0, 1 - snake.deathElapsed / DEATH_DURATION);
    const points = snake.alive ? snakePoints() : snake.deathPoints;

    context.lineCap = "butt";
    context.lineJoin = "miter";
    context.lineWidth = 1;

    for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const startFade = 1 - index / (points.length - 1);
        const endFade = 1 - (index + 1) / (points.length - 1);
        const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
        const startAlpha = EDGE_OPACITY * snake.opacity * deathOpacity * startFade;
        const endAlpha = EDGE_OPACITY * snake.opacity * deathOpacity * endFade;
        gradient.addColorStop(0, `rgba(${COLOR}, ${startAlpha})`);
        gradient.addColorStop(1, `rgba(${COLOR}, ${endAlpha})`);

        context.beginPath();
        context.strokeStyle = gradient;
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
    }
}

function draw() {
    context.clearRect(0, 0, width, height);
    drawLines();
    drawSnake();
}

function startSnake(key) {
    const direction = DIRECTIONS[key];
    const eligibleLineIndices = lines.reduce((indices, line, index) => {
        if (line.fading
            || line.y < 0
            || line.y > height
            || lineOpacity(line) < MIN_INTERACTIVE_OPACITY) {
            return indices;
        }

        indices.push(index);
        return indices;
    }, []);

    if (!eligibleLineIndices.length) {
        return;
    }

    const selectedIndex = eligibleLineIndices[Math.floor(Math.random() * eligibleLineIndices.length)];
    const selectedLine = lines.splice(selectedIndex, 1)[0];
    const bodyLength = Math.max(2, Math.ceil(selectedLine.tail / SNAKE_CELL_SIZE) + 1);

    snake = {
        body: Array.from({ length: bodyLength }, (_, index) => ({
            column: 0,
            row: -index,
        })),
        originX: columnCenter(selectedLine.column),
        originY: selectedLine.y,
        direction,
        nextDirection: direction,
        progress: 0,
        deathElapsed: 0,
        growthPending: 0,
        opacity: selectedLine.opacity,
        speed: selectedLine.speed,
        deathPoints: null,
        alive: true,
    };
}

function moveSnake() {
    const direction = snake.nextDirection || snake.direction;
    snake.nextDirection = null;

    const head = snake.body[0];
    const nextHead = {
        column: head.column + direction.column,
        row: head.row + direction.row,
    };
    const grows = snake.growthPending > 0;
    const nextX = snakeX(nextHead.column);
    const nextY = snakeY(nextHead.row);
    const outsideBoard = nextX < 0 || nextX > width || nextY < 0 || nextY > height;

    if (outsideBoard) {
        killSnake(1);
        return false;
    }

    const hitLine = lines.some((line) => !line.fading
        && lineOpacity(line) >= MIN_INTERACTIVE_OPACITY
        && Math.abs(columnCenter(line.column) - nextX) <= SNAKE_CELL_SIZE / 2 + 0.5
        && line.y >= nextY - SNAKE_CELL_SIZE / 2
        && line.y - line.tail <= nextY + SNAKE_CELL_SIZE / 2);
    const bodyToCheck = grows ? snake.body : snake.body.slice(0, -1);
    const hitSelf = bodyToCheck.some((cell) => (
        cell.column === nextHead.column && cell.row === nextHead.row
    ));

    if (hitLine || hitSelf) {
        killSnake(1);
        return false;
    }

    snake.direction = direction;
    snake.body.unshift(nextHead);
    if (grows) {
        snake.growthPending -= 1;
    } else {
        snake.body.pop();
    }
    return true;
}

function lineHitsSnake(line, points) {
    if (line.fading || lineOpacity(line) < MIN_INTERACTIVE_OPACITY) {
        return false;
    }

    const x = columnCenter(line.column);
    const top = line.y - line.tail;
    const bottom = line.y;

    for (const point of points) {
        if (Math.abs(point.x - x) <= 1 && point.y >= top - 0.5 && point.y <= bottom + 0.5) {
            return true;
        }
    }

    for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const deltaX = end.x - start.x;
        const progress = Math.abs(deltaX) < 0.001
            ? 0
            : Math.max(0, Math.min(1, (x - start.x) / deltaX));
        const closestX = start.x + deltaX * progress;
        const closestY = start.y + (end.y - start.y) * progress;

        if (Math.abs(closestX - x) <= 1
            && closestY >= top - 0.5
            && closestY <= bottom + 0.5) {
            return true;
        }
    }

    return false;
}

function removeLinesThatHitSnake() {
    if (!snake?.alive) {
        return;
    }

    const points = snakePoints();

    for (const line of lines) {
        if (!line.fading && lineHitsSnake(line, points)) {
            line.fading = true;
            line.fadeElapsed = 0;
            snake.growthPending += 1;
        }
    }
}

function update(deltaTime) {
    const boosting = boostRemaining > 0;
    boostRemaining = Math.max(0, boostRemaining - deltaTime);
    boostCooldownRemaining = Math.max(0, boostCooldownRemaining - deltaTime);

    if (snake?.alive) {
        const speedMultiplier = boosting ? BOOST_SNAKE_MULTIPLIER : 1;
        snake.progress += (snake.speed * speedMultiplier * deltaTime) / SNAKE_CELL_SIZE;
        while (snake.progress >= 1 && snake.alive) {
            if (!moveSnake()) {
                break;
            }
            snake.progress -= 1;
        }
    }

    lines = lines.filter((line) => {
        if (line.fading) {
            line.fadeElapsed += deltaTime;
            return line.fadeElapsed < LINE_FADE_DURATION;
        }

        const speedMultiplier = boosting ? BOOST_LINE_MULTIPLIER : 1;
        line.y += line.speed * speedMultiplier * deltaTime;
        if (line.y - line.tail > height) {
            const replacement = createLine(-randomBetween(0, height + line.tail));
            Object.assign(line, replacement);
        }
        return true;
    });

    removeLinesThatHitSnake();

    if (snake && !snake.alive) {
        snake.deathElapsed += deltaTime;
        if (snake.deathElapsed >= DEATH_DURATION) {
            snake = null;
        }
    }
}

function animate(timestamp) {
    if (document.hidden || reducedMotion.matches) {
        animationFrame = 0;
        return;
    }

    const deltaTime = lastFrameTime
        ? Math.min((timestamp - lastFrameTime) / 1000, 0.05)
        : 0;
    lastFrameTime = timestamp;

    update(deltaTime);
    draw();
    animationFrame = window.requestAnimationFrame(animate);
}

function startAnimation() {
    if (reducedMotion.matches || document.hidden) {
        draw();
        return;
    }

    if (!animationFrame) {
        lastFrameTime = 0;
        animationFrame = window.requestAnimationFrame(animate);
    }
}

function handleKeydown(event) {
    const key = event.key.toLowerCase();
    const direction = DIRECTIONS[key];
    const target = event.target;

    if (reducedMotion.matches || event.altKey || event.ctrlKey || event.metaKey) {
        return;
    }

    if (target instanceof HTMLElement
        && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) {
        return;
    }

    if (event.code === "Space") {
        if (!snake?.alive) {
            return;
        }

        event.preventDefault();
        if (boostCooldownRemaining <= 0) {
            boostRemaining = BOOST_DURATION;
            boostCooldownRemaining = BOOST_COOLDOWN;
        }
        return;
    }

    if (!direction) {
        return;
    }

    event.preventDefault();

    if (!snake) {
        startSnake(key);
        draw();
        return;
    }

    if (!snake.alive) {
        return;
    }

    const currentDirection = snake.nextDirection || snake.direction;
    const isReverse = direction.column === -currentDirection.column
        && direction.row === -currentDirection.row;

    if (!isReverse) {
        snake.nextDirection = direction;
    }
}

function handleVisibilityChange() {
    if (document.hidden) {
        if (animationFrame) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
        }
        lastFrameTime = 0;
        return;
    }

    startAnimation();
}

resizeCanvas();
lines = Array.from({ length: LINES }, () => createLine(randomBetween(-height, height)));
draw();

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", handleKeydown);
document.addEventListener("visibilitychange", handleVisibilityChange);
reducedMotion.addEventListener("change", startAnimation);
startAnimation();