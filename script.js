import {
  buildScene,
  connectionPath,
  itemHeight,
  itemWidth,
} from "./scene-model.js";

const API_HOST = "https://api.kinopio.club";
const DEFAULT_SPACE = "https://kinopio.club/kn-vitrine-ZNXXsP5cFZ5712kFb1vON";
const SVG_NS = "http://www.w3.org/2000/svg";
const IMAGE_RE = /\.(gif|jpe?g|jif|jfif|png|svg|webp|avif|heic)(?:$|[?&#])/i;
const VIDEO_RE = /\.(mp4|webm|mov)(?:$|[?&#])/i;
const AUDIO_RE = /\.(mp3|m4a|ogg|wav)(?:$|[?&#])/i;
const URL_RE = /https?:\/\/[^\s<]+/gi;
const FRAME_ASSETS = {
  1: [
    ["garden-leaves", "leaves", "leaves.webp"],
    ["garden-leaves", "ivy", "ivy.webp"],
    ["garden-leaves", "flower", "flower.webp"],
  ],
  2: [
    ["magical-helper", "cat", "cat.webp"],
    ["magical-helper", "hat", "hat.webp"],
    ["magical-helper", "moon", "moon.webp"],
  ],
  3: [
    ["morning-brew", "cloud", "cloud.webp", "tea-time"],
    ["morning-brew", "pot", "pot.webp", "tea-time"],
    ["morning-brew", "ichigotchi", "ichigotchi.webp", "tea-time"],
  ],
  4: [
    ["dead-to-me", "spooky-witch", "spooky-witch.webp"],
    ["dead-to-me", "tombstone", "tombstone.webp"],
    ["dead-to-me", "spooky-eyes", "spooky-eyes.webp"],
    ["dead-to-me", "ghost", "ghost.webp"],
  ],
  5: [
    ["lil-guys", "pot-sitting", "pot-sitting.webp"],
    ["lil-guys", "pot-standing-side", "pot-standing-side.webp"],
    ["lil-guys", "flowers-02", "flowers-02.webp"],
    ["lil-guys", "pot-hanging", "pot-hanging.webp"],
    ["lil-guys", "flowers-01", "flowers-01.webp"],
  ],
  6: [
    ["pen-pals", "dog-1 s-width", "dog-1.webp"],
    ["pen-pals", "dog-2 m-width", "dog-2.webp"],
    ["pen-pals", "dog-3 l-width", "dog-3.webp"],
  ],
  7: [
    ["book-worm", "worm-top", "worm-top.webp"],
    ["book-worm", "worm-left m-height", "worm-left.webp"],
    ["book-worm", "worm-right m-height", "worm-right.webp"],
  ],
};

// Kinopio uses Noto Sans on Linux because Helvetica's fallback metrics differ.
if (/Linux/i.test(navigator.platform)) {
  document.documentElement.style.setProperty(
    "--sans-serif-font",
    '"Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
  );
}

const elements = {
  controls: document.querySelector("#controls"),
  previous: document.querySelector("#previous"),
  next: document.querySelector("#next"),
  status: document.querySelector("#status"),
  title: document.querySelector("#slide-title"),
  wrapper: document.querySelector("#slide-wrapper"),
  slide: document.querySelector("#slide"),
};

const state = {
  scene: null,
  currentIndex: 0,
  highlightTimer: null,
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const svgEl = (tag, attributes = {}) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) node.setAttribute(name, value);
  }
  return node;
};

function spaceIdFromLocation() {
  const value =
    new URLSearchParams(window.location.search).get("space") || DEFAULT_SPACE;
  const withoutQuery = value.replace(/[?#].*$/, "").replace(/\/$/, "");
  const match = withoutQuery.match(/([A-Za-z0-9_-]{21})$/);
  return match?.[1] || value;
}

async function loadSpace(spaceId) {
  elements.status.textContent = "Loading space…";
  const response = await fetch(
    `${API_HOST}/space/${encodeURIComponent(spaceId)}/`,
  );
  if (!response.ok) throw new Error(`Kinopio returned ${response.status}`);
  return response.json();
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function stopPropagation(event) {
  event.stopPropagation();
}

function appendInlineMarkdown(parent, source) {
  const pattern =
    /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|_([^_]+)_|~~([^~]+)~~|`([^`]+)`|https?:\/\/[^\s<]+)/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    parent.append(document.createTextNode(source.slice(cursor, match.index)));
    let child;
    if (match[2]) {
      const href = safeUrl(match[3]);
      child = href ? el("a", "", match[2]) : document.createTextNode(match[2]);
      if (href) {
        child.href = href;
        child.target = "_blank";
        child.rel = "noopener noreferrer";
      }
    } else if (match[4]) {
      child = el("strong", "", match[4]);
    } else if (match[5]) {
      child = el("em", "", match[5]);
    } else if (match[6]) {
      child = el("del", "", match[6]);
    } else if (match[7]) {
      child = el("code", "", match[7]);
    } else {
      const href = safeUrl(match[0]);
      child = href ? el("a", "", match[0]) : document.createTextNode(match[0]);
      if (href) {
        child.href = href;
        child.target = "_blank";
        child.rel = "noopener noreferrer";
      }
    }
    if (child instanceof Element) {
      child.addEventListener("click", stopPropagation);
    }
    parent.append(child);
    cursor = match.index + match[0].length;
  }
  parent.append(document.createTextNode(source.slice(cursor)));
}

function renderMarkdown(source) {
  const fragment = document.createDocumentFragment();
  let inCodeBlock = false;
  let code = [];
  for (const line of source.split("\n")) {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        fragment.append(el("pre", "", code.join("\n")));
        code = [];
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const blockquote = line.match(/^>\s?(.+)$/);
    const node = heading
      ? el(`h${heading[1].length}`)
      : blockquote
        ? el("blockquote")
        : el("span", "text-line");
    appendInlineMarkdown(node, heading?.[2] || blockquote?.[1] || line);
    fragment.append(node);
  }
  if (code.length) fragment.append(el("pre", "", code.join("\n")));
  return fragment;
}

function urlsFromName(name = "") {
  return [...name.matchAll(URL_RE)].map((match) =>
    match[0].replace(/[),.;]+$/, ""),
  );
}

function mediaFromCard(card) {
  const urls = urlsFromName(card.name);
  return {
    image: urls.find((url) => IMAGE_RE.test(url)),
    video: urls.find((url) => VIDEO_RE.test(url)),
    audio: urls.find((url) => AUDIO_RE.test(url)),
  };
}

function cardText(card, media) {
  let text = card.name || "";
  for (const url of [media.image, media.video, media.audio].filter(Boolean)) {
    text = text.replace(url, "").trim();
  }
  if (card.isTodo) text = text.replace(/^\[\]\s*/, "");
  return text;
}

function cardHasDarkBackground(color) {
  if (!/^#[0-9a-f]{6}$/i.test(color || "")) return false;
  const [r, g, b] = [1, 3, 5].map((index) =>
    parseInt(color.slice(index, index + 2), 16),
  );
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 <= 0.4;
}

function renderFrame(card) {
  const assets = FRAME_ASSETS[card.frameId];
  if (!assets) return null;
  const frame = el("aside", "frames");
  const group = el("div", assets[0][0]);
  for (const [, className, filename, directory] of assets) {
    const image = el("img", className);
    image.src = `assets/frames/${directory || assets[0][0]}/${filename}`;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    group.append(image);
  }
  frame.append(group);
  return frame;
}

function renderPreview(card) {
  if (!card.urlPreviewIsVisible || !card.urlPreviewUrl) return null;
  const preview = el("a", "url-preview");
  preview.href = safeUrl(card.urlPreviewUrl) || "#";
  preview.target = "_blank";
  preview.rel = "noopener noreferrer";
  preview.addEventListener("click", stopPropagation);
  if (card.urlPreviewImage && !card.shouldHideUrlPreviewImage) {
    const image = el("img");
    image.src = card.urlPreviewImage;
    image.alt = "";
    image.loading = "lazy";
    preview.append(image);
  }
  if (!card.shouldHideUrlPreviewInfo) {
    const info = el("span", "url-preview-info");
    if (card.urlPreviewTitle) info.append(el("strong", "", card.urlPreviewTitle));
    if (card.urlPreviewDescription) {
      info.append(el("span", "", card.urlPreviewDescription));
    }
    preview.append(info);
  }
  return preview.childNodes.length ? preview : null;
}

function navigateToTarget(target) {
  if (Number.isInteger(target.boxIndex)) {
    goToSlide(target.boxIndex, target.cardId);
  }
}

function renderCard(card, scene) {
  const wrap = el("article", "card-wrap");
  const media = mediaFromCard(card);
  wrap.dataset.cardId = card.id;
  wrap.style.setProperty("--x", `${card.x - scene.box.x}px`);
  wrap.style.setProperty("--y", `${card.y - scene.box.y}px`);
  wrap.style.setProperty("--width", `${itemWidth(card) || 200}px`);
  wrap.style.setProperty("--height", `${itemHeight(card) || 32}px`);
  wrap.style.setProperty("--z", card.z || 1);
  wrap.style.setProperty("--tilt", `${card.tilt || 0}deg`);

  const cardElement = el("div", "card");
  const background = card.backgroundColor || "#fff";
  cardElement.style.setProperty("--card-background", background);
  cardElement.classList.toggle("is-dark", cardHasDarkBackground(background));
  cardElement.classList.toggle("is-comment", Boolean(card.isComment));
  cardElement.classList.toggle("is-checked", Boolean(card.isChecked));
  const width = itemWidth(card);
  const height = itemHeight(card);
  cardElement.classList.add(
    width < 100 ? "s-width" : width <= 150 ? "m-width" : "l-width",
    height < 100 ? "s-height" : height <= 150 ? "m-height" : "l-height",
  );
  cardElement.classList.add(
    `header-font-family-${card.headerFontId ?? 0}`,
    `header-font-size-${card.headerFontSize || "s"}`,
  );

  const frame = renderFrame(card);
  if (frame) cardElement.append(frame);

  if (media.image || media.video) {
    cardElement.classList.add("media-card");
    const mediaNode = media.video ? el("video") : el("img");
    mediaNode.src = media.video || media.image;
    mediaNode.loading = "lazy";
    if (media.video) {
      mediaNode.controls = true;
      mediaNode.loop = true;
      mediaNode.muted = true;
      mediaNode.playsInline = true;
      mediaNode.autoplay = !card.videoIsPaused;
    } else {
      mediaNode.alt = cardText(card, media);
    }
    mediaNode.addEventListener("click", stopPropagation);
    cardElement.append(mediaNode);
  }

  const contentWrap = el("span", "card-content-wrap");
  const content = el("div", "card-content");
  const displayText = cardText(card, media);
  if (card.isTodo) {
    const checkbox = el("span", "todo-checkbox", card.isChecked ? "✓" : "");
    checkbox.setAttribute("aria-hidden", "true");
    content.append(checkbox);
  }
  if (displayText) {
    const nameWrap = el("div", "name-wrap");
    const name = el("div", "name");
    name.append(renderMarkdown(displayText));
    nameWrap.append(name);
    content.append(nameWrap);
  }
  if (media.audio) {
    const audio = el("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.src = media.audio;
    audio.addEventListener("click", stopPropagation);
    content.prepend(audio);
  }
  if (card.counterIsVisible) {
    content.append(el("span", "counter badge", String(card.counterValue || 0)));
  }
  if (content.childNodes.length) {
    contentWrap.append(content);
    contentWrap.append(el("span", "connector-spacer"));
    cardElement.append(contentWrap);
  }

  const preview = renderPreview(card);
  if (preview) cardElement.append(preview);

  const targets = scene.navigationTargetsByCardId.get(card.id) || [];
  if (targets.length === 1) {
    const [target] = targets;
    const navigate = () => navigateToTarget(target);
    wrap.classList.add("has-navigation");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "link");
    wrap.setAttribute("aria-label", target.label || "Go to connected box");
    wrap.addEventListener("click", navigate);
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      navigate();
    });
  } else if (targets.length > 1) {
    wrap.classList.add("has-navigation");
    const links = el("span", "box-links");
    links.setAttribute("aria-label", "Connected boxes");
    targets.forEach((target, index) => {
      const link = el("button", "box-link", targets.length > 1 ? `→${index + 1}` : "→");
      link.type = "button";
      link.title = target.label || `Go to connected box ${index + 1}`;
      link.addEventListener("click", (event) => {
        event.stopPropagation();
        navigateToTarget(target);
      });
      links.append(link);
    });
    cardElement.append(links);
  } else if (card.linkToSpaceId) {
    const link = el("a", "box-link", "↗");
    link.href = `https://kinopio.club/-${card.linkToSpaceId}${card.linkToCardId ? `?card=${card.linkToCardId}` : ""}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.addEventListener("click", stopPropagation);
    cardElement.append(link);
  }

  wrap.append(cardElement);
  return wrap;
}

function renderConnections(scene) {
  const svg = svgEl("svg", {
    class: "connection-layer",
    viewBox: `0 0 ${itemWidth(scene.box)} ${itemHeight(scene.box)}`,
    "aria-hidden": "true",
  });
  const group = svgEl("g", {
    transform: `translate(${-scene.box.x} ${-scene.box.y})`,
  });
  svg.append(group);

  for (const connection of scene.connections) {
    const pathData = connectionPath(connection, state.scene.cardsById);
    if (!pathData) continue;
    const pathId = `connection-${connection.id.replace(/[^a-z0-9_-]/gi, "")}`;
    group.append(
      svgEl("path", {
        id: pathId,
        class: "connection-path",
        d: pathData,
        fill: "none",
        stroke: connection.color || "#999",
        "stroke-linecap": "round",
        "stroke-width": "5",
      }),
    );
    if (connection.directionIsVisible) {
      const dot = svgEl("circle", {
        class: "connection-direction",
        r: "7",
        fill: connection.color || "#999",
      });
      dot.append(
        svgEl("animateMotion", {
          dur: "3s",
          repeatCount: "indefinite",
          path: pathData,
        }),
      );
      group.append(dot);
    }
    if (connection.labelIsVisible && connection.name) {
      const label = svgEl("text", { class: "connection-label" });
      const textPath = svgEl("textPath", {
        href: `#${pathId}`,
        startOffset: `${(connection.labelRelativePositionX ?? 0.5) * 100}%`,
      });
      textPath.textContent = connection.name;
      label.append(textPath);
      group.append(label);
    }
  }
  return svg;
}

function renderHorizontalLines(scene) {
  const layer = el("div", "horizontal-lines");
  for (const line of scene.horizontalLines) {
    const node = el("div", "horizontal-line");
    node.style.top = `${line.y - scene.box.y}px`;
    node.style.backgroundColor = line.color || "#999";
    layer.append(node);
  }
  return layer;
}

function fitSlide() {
  const scene = state.scene?.scenes[state.currentIndex];
  if (!scene) return;
  const padding = 48;
  const scale = Math.min(
    (elements.wrapper.clientWidth - padding) / itemWidth(scene.box),
    (elements.wrapper.clientHeight - padding) / itemHeight(scene.box),
  );
  elements.slide.style.setProperty("--slide-scale", Math.max(0.05, scale));
}

function updateNavigation() {
  const count = state.scene.scenes.length;
  const previousEnabled = state.currentIndex > 0;
  const nextEnabled = state.currentIndex < count - 1;
  elements.previous.textContent = previousEnabled ? "↑" : "";
  elements.previous.disabled = !previousEnabled;
  elements.next.textContent = nextEnabled ? "↓" : "";
  elements.next.disabled = !nextEnabled;
  elements.controls.hidden = count < 2;
}

function renderBox(index, highlightCardId = null) {
  const scene = state.scene.scenes[index];
  if (!scene) return;
  const { box } = scene;
  elements.slide.replaceChildren();
  elements.slide.style.width = `${itemWidth(box)}px`;
  elements.slide.style.height = `${itemHeight(box)}px`;
  elements.slide.style.backgroundColor = box.color || "#fff";
  elements.slide.style.backgroundImage = box.background
    ? `url("${box.background.replaceAll('"', '\\"')}")`
    : "none";
  elements.slide.style.backgroundSize = box.backgroundIsStretch ? "cover" : "auto";
  elements.title.textContent = /^Box \d+$/.test(box.name || "")
    ? ""
    : box.name || "";
  elements.title.hidden = !elements.title.textContent;

  elements.slide.append(renderHorizontalLines(scene), renderConnections(scene));
  const cards = el("div", "cards");
  for (const card of scene.cards) cards.append(renderCard(card, scene));
  elements.slide.append(cards);
  updateNavigation();
  fitSlide();

  clearTimeout(state.highlightTimer);
  if (highlightCardId) {
    requestAnimationFrame(() => {
      const card = [...elements.slide.querySelectorAll("[data-card-id]")].find(
        (node) => node.dataset.cardId === highlightCardId,
      );
      if (!card) return;
      card.classList.add("shiny");
      state.highlightTimer = setTimeout(
        () => card.classList.remove("shiny"),
        5000,
      );
    });
  }
}

function goToSlide(index, highlightCardId = null) {
  if (!state.scene?.scenes[index]) return;
  state.currentIndex = index;
  renderBox(index, highlightCardId);
}

function isInteractiveTarget(target) {
  return Boolean(
    target.closest(
      "a, button, input, textarea, select, audio, video, [contenteditable]",
    ),
  );
}

async function start() {
  try {
    state.scene = buildScene(await loadSpace(spaceIdFromLocation()));
    if (!state.scene.scenes.length) throw new Error("This space has no boxes");
    elements.status.textContent = "";
    goToSlide(0);
  } catch (error) {
    console.error(error);
    elements.status.textContent = `Couldn’t load this space. ${error.message}`;
    elements.status.classList.add("error");
  }
}

elements.previous.addEventListener("click", () =>
  goToSlide(state.currentIndex - 1),
);
elements.next.addEventListener("click", () =>
  goToSlide(state.currentIndex + 1),
);
document.addEventListener("keydown", (event) => {
  if (isInteractiveTarget(event.target)) return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    goToSlide(state.currentIndex + 1);
    event.preventDefault();
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    goToSlide(state.currentIndex - 1);
    event.preventDefault();
  }
});

new ResizeObserver(fitSlide).observe(elements.wrapper);
start();
