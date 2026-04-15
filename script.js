const config = {
  gravity: -0.2,
  drag: 0.98,
  bounce: 0.7,
  rotationSpeed: 0.02,
  mouseForce: 150,
};

const gravityModes = {
  anti: { label: "Anti-Gravity", value: config.gravity },
  zero: { label: "Zero Gravity", value: 0 },
  normal: { label: "Normal Gravity", value: Math.abs(config.gravity) },
};

const luckyQueries = [
  "shooting stars near me",
  "best snacks for orbit",
  "why is my homepage escaping",
  "cloud surfing tips",
  "physics easter eggs",
];

class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Vector(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(vector) {
    this.x += vector.x;
    this.y += vector.y;
    return this;
  }

  subtract(vector) {
    this.x -= vector.x;
    this.y -= vector.y;
    return this;
  }

  scale(amount) {
    this.x *= amount;
    this.y *= amount;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const length = this.length() || 1;
    this.x /= length;
    this.y /= length;
    return this;
  }
}

class PhysicsBody {
  constructor(element, rect, options = {}) {
    this.element = element;
    this.size = new Vector(rect.width, rect.height);
    this.position = new Vector(rect.left, rect.top);
    this.velocity = options.velocity || new Vector();
    this.mass = options.mass || 1;
    this.rotation = options.rotation || 0;
    this.angularVelocity = options.angularVelocity || 0;
    this.restitution = options.restitution || config.bounce;
    this.pointerRadius = options.pointerRadius || Math.max(rect.width, rect.height) + 180;
    this.zIndex = options.zIndex || 30;
    this.driftSeed = Math.random() * Math.PI * 2;
    this.ephemeral = Boolean(options.ephemeral);
    this.inlineStyle = element.getAttribute("style") || "";

    this.activateFloatingStyles();
  }

  activateFloatingStyles() {
    this.element.classList.add("floating-active");
    this.element.style.width = `${this.size.x}px`;
    this.element.style.height = `${this.size.y}px`;
    this.element.style.left = "0px";
    this.element.style.top = "0px";
    this.element.style.zIndex = String(this.zIndex);
    this.render();
  }

  center() {
    return new Vector(this.position.x + this.size.x / 2, this.position.y + this.size.y / 2);
  }

  applyForce(force) {
    this.velocity.add(force.scale(1 / this.mass));
  }

  update(deltaFactor, state) {
    const gravityForce = new Vector(0, gravityModes[state.gravityMode].value * deltaFactor);
    this.applyForce(gravityForce);

    // A small orbital drift keeps bodies lively, especially in zero gravity.
    const drift = new Vector(
      Math.sin(state.time * 0.0014 + this.driftSeed),
      Math.cos(state.time * 0.0011 + this.driftSeed)
    ).scale(0.012 * deltaFactor / this.mass);
    this.velocity.add(drift);

    if (state.pointer.active) {
      this.applyPointerForce(deltaFactor, state.pointer, state.pointerMode);
    }

    this.velocity.scale(config.drag ** deltaFactor);
    this.position.add(this.velocity.clone().scale(deltaFactor));
    this.rotation += this.angularVelocity * deltaFactor;

    this.handleBoundaryCollision();
    this.render();
  }

  applyPointerForce(deltaFactor, pointer, pointerMode) {
    const direction = this.center().subtract(pointer.position);
    const distance = direction.length();
    const influenceRadius = pointer.radius + this.pointerRadius;

    if (!distance || distance > influenceRadius) {
      return;
    }

    const signedDirection = pointerMode === "repel" ? 1 : -1;
    const falloff = 1 - distance / influenceRadius;
    const strength = (config.mouseForce * falloff * falloff * deltaFactor) / (this.mass * 20);

    this.velocity.add(direction.normalize().scale(signedDirection * strength));
  }

  handleBoundaryCollision() {
    const maxX = Math.max(0, window.innerWidth - this.size.x);
    const maxY = Math.max(0, window.innerHeight - this.size.y);

    if (this.position.x <= 0) {
      this.position.x = 0;
      this.velocity.x = Math.abs(this.velocity.x) * this.restitution;
    } else if (this.position.x >= maxX) {
      this.position.x = maxX;
      this.velocity.x = -Math.abs(this.velocity.x) * this.restitution;
    }

    if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = Math.abs(this.velocity.y) * this.restitution;
    } else if (this.position.y >= maxY) {
      this.position.y = maxY;
      this.velocity.y = -Math.abs(this.velocity.y) * this.restitution;
    }
  }

  render() {
    this.element.style.transform = `translate3d(${this.position.x}px, ${this.position.y}px, 0) rotate(${this.rotation}rad)`;
  }

  destroy() {
    if (this.ephemeral) {
      this.element.remove();
      return;
    }

    this.element.classList.remove("floating-active");

    if (this.inlineStyle) {
      this.element.setAttribute("style", this.inlineStyle);
    } else {
      this.element.removeAttribute("style");
    }
  }
}

const state = {
  bodies: [],
  frameId: 0,
  lastTime: 0,
  time: 0,
  gravityMode: "anti",
  pointerMode: "repel",
  pointer: {
    active: false,
    radius: 190,
    position: new Vector(window.innerWidth / 2, window.innerHeight / 2),
  },
  launchTimer: 0,
  resizeTimer: 0,
};

const dom = {
  floatingNodes: Array.from(document.querySelectorAll("[data-float='ui']")),
  shapeLayer: document.getElementById("shapeLayer"),
  forceField: document.getElementById("forceField"),
  statusLine: document.getElementById("statusLine"),
  modeBadge: document.getElementById("modeBadge"),
  resetButton: document.getElementById("resetButton"),
  boostButton: document.getElementById("boostButton"),
  pointerModeButton: document.getElementById("pointerModeButton"),
  modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
  searchForm: document.getElementById("searchForm"),
  searchInput: document.getElementById("searchInput"),
  luckyButton: document.getElementById("luckyButton"),
  footerLinks: Array.from(document.querySelectorAll(".footer-link")),
};

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function setStatus(message) {
  dom.statusLine.textContent = message;
}

function updateModeUI() {
  dom.modeButtons.forEach((button) => {
    button.dataset.active = String(button.dataset.mode === state.gravityMode);
  });

  const pointerLabel = state.pointerMode === "repel" ? "Repel" : "Black Hole";
  dom.pointerModeButton.dataset.active = String(state.pointerMode === "attract");
  dom.pointerModeButton.textContent =
    state.pointerMode === "repel" ? "Repel Cursor" : "Black Hole Cursor";
  dom.modeBadge.textContent = `Mode: ${gravityModes[state.gravityMode].label} | Cursor: ${pointerLabel}`;
}

function updateForceField() {
  const { x, y } = state.pointer.position;
  const isRepel = state.pointerMode === "repel";

  dom.forceField.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${state.pointer.active ? 1 : 0.68})`;
  dom.forceField.style.background = isRepel
    ? "radial-gradient(circle, rgba(125, 211, 252, 0.26) 0%, rgba(125, 211, 252, 0.14) 36%, rgba(125, 211, 252, 0) 72%)"
    : "radial-gradient(circle, rgba(251, 146, 60, 0.28) 0%, rgba(251, 146, 60, 0.16) 36%, rgba(251, 146, 60, 0) 72%)";
  dom.forceField.style.boxShadow = isRepel
    ? "0 0 80px rgba(56, 189, 248, 0.25)"
    : "0 0 90px rgba(249, 115, 22, 0.28)";
}

function burstBodies(multiplier = 1) {
  state.bodies.forEach((body) => {
    const angle = randomBetween(0, Math.PI * 2);
    const impulse = new Vector(Math.cos(angle), Math.sin(angle)).scale(
      randomBetween(0.15, 0.9) * multiplier
    );

    if (state.gravityMode === "anti") {
      impulse.y -= randomBetween(0.3, 1.1) * multiplier;
    } else if (state.gravityMode === "normal") {
      impulse.y += randomBetween(0.3, 1.1) * multiplier;
    }

    body.applyForce(impulse);
  });
}

function buildBodySet() {
  const viewportCenter = new Vector(window.innerWidth / 2, window.innerHeight / 2);
  const nodes = dom.floatingNodes
    .map((element, index) => ({
      element,
      rect: element.getBoundingClientRect(),
      index,
    }))
    .filter(({ rect }) => rect.width > 0 && rect.height > 0);

  return nodes.map(({ element, rect, index }) => {
    const mass = Number(element.dataset.mass) || Math.max(1, rect.width * rect.height / 16000);
    const spin = Number(element.dataset.spin) || randomBetween(-config.rotationSpeed, config.rotationSpeed);
    const body = new PhysicsBody(element, rect, {
      mass,
      angularVelocity: spin,
      restitution: config.bounce,
      pointerRadius: Math.max(rect.width, rect.height) + 180,
      zIndex: 35 + index,
    });

    const breakout = body.center().subtract(viewportCenter).normalize();
    body.velocity = new Vector(
      breakout.x * randomBetween(0.15, 1.2) + randomBetween(-0.4, 0.4),
      breakout.y * randomBetween(0.05, 0.6) - randomBetween(0.6, 1.9)
    );

    return body;
  });
}

function spawnDecorativeShapes(count = 14) {
  const palette = [
    ["rgba(96, 165, 250, 0.35)", "rgba(191, 219, 254, 0.2)"],
    ["rgba(251, 191, 36, 0.32)", "rgba(254, 240, 138, 0.18)"],
    ["rgba(52, 211, 153, 0.28)", "rgba(167, 243, 208, 0.14)"],
    ["rgba(244, 114, 182, 0.22)", "rgba(253, 224, 239, 0.14)"],
  ];

  const bodies = [];

  for (let index = 0; index < count; index += 1) {
    const width = randomBetween(24, 82);
    const height = width * randomBetween(0.75, 1.35);
    const minTop = window.innerHeight * 0.15;
    const maxTop = Math.max(minTop, window.innerHeight - height);
    const colors = palette[index % palette.length];
    const shape = document.createElement("div");

    shape.className = "floating-shape";
    shape.style.borderRadius = `${randomBetween(18, 999)}px`;
    shape.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
    shape.style.opacity = String(randomBetween(0.16, 0.28));
    shape.style.filter = `blur(${randomBetween(0, 0.4)}px)`;
    dom.shapeLayer.appendChild(shape);

    const rect = {
      left: randomBetween(0, Math.max(1, window.innerWidth - width)),
      top: randomBetween(minTop, maxTop),
      width,
      height,
    };

    const body = new PhysicsBody(shape, rect, {
      mass: randomBetween(0.7, 1.6),
      angularVelocity: randomBetween(-config.rotationSpeed, config.rotationSpeed),
      restitution: 0.84,
      pointerRadius: 140,
      zIndex: 12,
      ephemeral: true,
    });

    body.velocity = new Vector(randomBetween(-1.1, 1.1), randomBetween(-1.8, 0.4));
    bodies.push(body);
  }

  return bodies;
}

function clearSimulation() {
  cancelAnimationFrame(state.frameId);
  clearTimeout(state.launchTimer);

  state.bodies.forEach((body) => body.destroy());
  state.bodies = [];
  state.frameId = 0;
}

function scheduleLaunch(delay = 900) {
  clearTimeout(state.launchTimer);
  setStatus(`Launching ${gravityModes[state.gravityMode].label.toLowerCase()} in ${(delay / 1000).toFixed(1)} seconds.`);

  state.launchTimer = window.setTimeout(() => {
    startSimulation();
  }, delay);
}

function startSimulation() {
  clearSimulation();
  state.bodies = [...buildBodySet(), ...spawnDecorativeShapes()];
  state.lastTime = performance.now();
  state.time = state.lastTime;
  setStatus(`Simulation live. ${gravityModes[state.gravityMode].label} engaged.`);
  updateModeUI();
  state.frameId = requestAnimationFrame(animate);
}

function restoreLayout(relaunch = true) {
  clearSimulation();
  clearPointer();
  setStatus("Layout restored.");

  if (!relaunch) {
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scheduleLaunch(500);
    });
  });
}

function animate(timestamp) {
  const deltaMs = Math.min(34, timestamp - state.lastTime || 16.67);
  const deltaFactor = deltaMs / 16.67;

  state.lastTime = timestamp;
  state.time = timestamp;
  state.bodies.forEach((body) => body.update(deltaFactor, state));
  state.frameId = requestAnimationFrame(animate);
}

function updatePointer(x, y) {
  state.pointer.active = true;
  state.pointer.position.set(x, y);
  document.body.classList.add("pointer-active");
  updateForceField();
}

function clearPointer() {
  state.pointer.active = false;
  document.body.classList.remove("pointer-active");
  updateForceField();
}

function setGravityMode(mode) {
  state.gravityMode = gravityModes[mode] ? mode : "anti";
  updateModeUI();
  setStatus(`${gravityModes[state.gravityMode].label} selected.`);
  burstBodies(0.9);
}

function togglePointerMode() {
  state.pointerMode = state.pointerMode === "repel" ? "attract" : "repel";
  updateModeUI();
  updateForceField();
  setStatus(
    state.pointerMode === "repel"
      ? "Cursor repulsion enabled."
      : "Black hole mode enabled. The cursor now attracts nearby objects."
  );
}

function handleSearch(event) {
  event.preventDefault();

  const query = dom.searchInput.value.trim();
  burstBodies(1.5);

  if (query) {
    setStatus(`Searching for "${query}" in ${gravityModes[state.gravityMode].label.toLowerCase()}.`);
  } else {
    setStatus("Search pulse launched through the anti-gravity field.");
  }
}

function handleLuckySearch() {
  const luckyQuery = luckyQueries[Math.floor(Math.random() * luckyQueries.length)];
  const modes = Object.keys(gravityModes);
  const nextMode = modes[Math.floor(Math.random() * modes.length)];

  dom.searchInput.value = luckyQuery;
  setGravityMode(nextMode);
  burstBodies(2.2);
  setStatus(`Feeling lucky with "${luckyQuery}".`);
}

function handleResize() {
  clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(() => {
    restoreLayout(true);
  }, 150);
}

function bindEvents() {
  window.addEventListener(
    "pointermove",
    (event) => {
      updatePointer(event.clientX, event.clientY);
    },
    { passive: true }
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      updatePointer(event.clientX, event.clientY);
    },
    { passive: true }
  );

  window.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") {
      clearPointer();
    }
  });

  window.addEventListener("pointercancel", clearPointer);
  window.addEventListener("mouseout", (event) => {
    if (!event.relatedTarget) {
      clearPointer();
    }
  });
  window.addEventListener("blur", clearPointer);
  window.addEventListener("resize", handleResize);

  dom.resetButton.addEventListener("click", () => restoreLayout(true));
  dom.boostButton.addEventListener("click", () => {
    burstBodies(1.8);
    setStatus("Boost pulse applied.");
  });
  dom.pointerModeButton.addEventListener("click", togglePointerMode);
  dom.searchForm.addEventListener("submit", handleSearch);
  dom.luckyButton.addEventListener("click", handleLuckySearch);

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => setGravityMode(button.dataset.mode));
  });

  dom.footerLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      burstBodies(0.75);
      setStatus(`${link.textContent} drifted into orbit.`);
    });
  });
}

async function boot() {
  updateModeUI();
  updateForceField();
  bindEvents();

  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.warn("Font loading check failed:", error);
    }
  }

  scheduleLaunch(900);
}

boot();
