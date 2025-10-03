// rendering cards

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function processMDInline(innerText) {
  let text = escapeHtml(innerText);
  text = text.replace(
    /\*\*([^*]+?)\*\*/g,
    (match, p1) => `<strong>${p1.trim()}</strong>`,
  );
  text = text.replace(/_([^_]+?)_/g, (match, p1) => `<em>${p1.trim()}</em>`);
  text = text.replace(
    /\[([^\]]+?)\]\(([^)]+?)\)/g,
    (match, p1, p2) =>
      `<a target="_blank" href="${p2.trim()}">${p1.trim()}</a>`,
  );
  return text;
}

function parseMarkdown(text) {
  let fragments = [];
  if (text.startsWith("[]")) text = text.substring(2);
  text.split("\n").forEach((line) => {
    if (line.match(/^####\s+/)) {
      fragments.push(`<h4>${processMDInline(line.slice(5))}</h4>`);
    } else if (line.match(/^###\s+/)) {
      fragments.push(`<h3>${processMDInline(line.slice(4))}</h3>`);
    } else if (line.match(/^##\s+/)) {
      fragments.push(`<h2>${processMDInline(line.slice(3))}</h2>`);
    } else if (line.match(/^\#\s+/)) {
      fragments.push(`<h1>${processMDInline(line.slice(2))}</h1>`);
    } else if (line.trim() !== "") {
      fragments.push(`<p>${processMDInline(line)}</p>`);
    }
  });

  return fragments.join("");
}

function renderCard(cardDiv, card) {
  cardDiv.style.position = "absolute";
  cardDiv.style.height = card.height + "px";

  cardDiv.classList.add("header-font-family-" + card.headerFontId);
  cardDiv.classList.add("header-font-size-" + card.headerFontSize);

  let text = "";
  const imageUrlRegex =
    /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp)(\?[^ ]*)?(#.*)?$/i;
  let imageUrl = null;
  const lines = card.name.split("\n");
  const filteredLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (!imageUrl && imageUrlRegex.test(trimmed)) {
      imageUrl = trimmed;
    } else {
      filteredLines.push(line);
    }
  }

  if (imageUrl) {
    cardDiv.classList.add("image");
    cardDiv.style.backgroundImage = `url(${imageUrl})`;
    cardDiv.style.backgroundSize = "cover";
    cardDiv.style.width = card.width + "px";
    text = filteredLines.join("\n").trim();
  } else {
    cardDiv.style.width = card.width - 16 + "px"; // removing the connector width
    cardDiv.style.backgroundColor = card.backgroundColor;
    text = card.name;
  }

  if (imageUrl) {
    text = `<div class="text" style="background-color: ${card.backgroundColor}">${parseMarkdown(text)}</div>`;
  } else {
    text = `<div class="text">${parseMarkdown(text)}</div>`;
  }

  cardDiv.innerHTML = text;
}

// box rendering

function makeCards(boxId) {
  const space = window.space;
  const box = space.boxes.find((b) => b.id === boxId);

  const cards = space.cards.filter((card) => {
    return (
      card.x >= box.x &&
      card.x + card.width <= box.x + box.resizeWidth &&
      card.y >= box.y &&
      card.y + card.height <= box.y + box.resizeHeight
    );
  });

  return {
    id: box.id,
    name: box.name,
    x: box.x,
    y: box.y,
    background: box.background,
    backgroundColor: box.color,
    backgroundFill: box.fill,
    backgroundCover: box.backgroundIsStretch,
    width: box.resizeWidth,
    height: box.resizeHeight,
    cards: cards,
  };
}

function renderBox(boxId) {
  const slide = document.getElementById("slide");
  slide.innerHTML = "";
  slide.style.background = "none";

  const cards = makeCards(boxId);

  // render background
  slide.style.width = cards.width + "px";
  slide.style.height = cards.height + "px";
  slide.style.backgroundColor = cards.backgroundColor;
  slide.style.backgroundImage = cards.background || "transparent";
  if (cards.background) {
    slide.style.backgroundImage = `url(${cards.background})`;
    if (cards.backgroundCover) {
      slide.style.backgroundSize = "cover";
    }
  }

  // render cards
  cards.cards.forEach((card) => {
    if (card.name) {
      const cardDiv = document.createElement("div");
      cardDiv.style.transformOrigin = "top right";
      cardDiv.style.transform = `translate(${card.x - cards.x + 8}px, ${card.y - cards.y}px) rotate(${card.tilt}deg)`;
      cardDiv.style.zIndex = card.z;
      renderCard(cardDiv, card);
      slide.appendChild(cardDiv);
    }
  });

  // linear scaling the slide to the screen size
  const scale = Math.min(
    (window.innerWidth - 40) / cards.width,
    (window.innerHeight - 40) / cards.height,
  );
  slide.style.transform = `scale(${scale})`;
}

// ---------------
// running things
// ---------------

const urlParams = new URLSearchParams(window.location.search);
let spaceid = urlParams.get("space") || "";
if (!spaceid) {
  renderBox();
}
spaceid = spaceid.replace(/\/$/, "").slice(-21);

fetch(`https://api.kinopio.club/space/${spaceid}/`, {
  method: "GET",
})
  .then((response) => response.json())
  .then((data) => {
    localStorage.setItem("space", JSON.stringify(data));
  });

async function waitForSpaceAndRender() {
  while (!localStorage.getItem("space")) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  window.space = JSON.parse(localStorage.getItem("space"));

  // prefetch images
  const imageUrlRegex =
    /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp)(\?[^ ]*)?(#.*)?$/i;
  const allRelevantCards = window.space.cards.filter((card) =>
    window.space.boxes.some((box) => {
      return (
        card.x >= box.x &&
        card.x + card.width <= box.x + box.resizeWidth &&
        card.y >= box.y &&
        card.y + card.height <= box.y + box.resizeHeight
      );
    }),
  );
  const urls = new Set([
    ...window.space.boxes.map((b) => b.background).filter(Boolean),
    ...allRelevantCards.flatMap((card) =>
      [
        card.urlPreviewImage,
        ...card.name
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => imageUrlRegex.test(l)),
      ].filter(Boolean),
    ),
  ]);
  const total = urls.size;
  if (total === 0) {
    const indicator = document.getElementById("prefetch-indicator");
    indicator.textContent = "";
  } else {
    let loaded = 0;
    const indicator = document.getElementById("prefetch-indicator");
    indicator.textContent = "0/" + total + " ↧";
    const updateProgress = () => {
      indicator.textContent = loaded + "/" + total + " ↧";
      if (loaded === total) {
        indicator.textContent = "";
      }
    };
    urls.forEach((url) => {
      const img = new Image();
      const onLoadOrError = () => {
        loaded++;
        updateProgress();
      };
      img.onload = onLoadOrError;
      img.onerror = onLoadOrError;
      img.src = url;
    });
  }

  // --- rendering the slides ---

  // sort boxes by y then x
  // top → down, failing that, left → right
  const boxIds = window.space.boxes
    .map((b) => b.id)
    .sort((aId, bId) => {
      const a = window.space.boxes.find((b) => b.id === aId);
      const b = window.space.boxes.find((b) => b.id === bId);
      if (a.y !== b.y) {
        return a.y - b.y;
      } else {
        return a.x - b.x;
      }
    });

  renderBox(boxIds[0]);
  let currentIndex = 0;

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      if (currentIndex < boxIds.length - 1) {
        currentIndex++;
        renderBox(boxIds[currentIndex]);
        updateNavigationButtons();
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      if (currentIndex > 0) {
        currentIndex--;
        renderBox(boxIds[currentIndex]);
        updateNavigationButtons();
      }
      e.preventDefault();
    }
  });

  document.getElementById("previous").addEventListener("click", () => {
    if (currentIndex > 0) {
      currentIndex--;
      renderBox(boxIds[currentIndex]);
      updateNavigationButtons();
    }
  });

  document.getElementById("next").addEventListener("click", () => {
    if (currentIndex < boxIds.length - 1) {
      currentIndex++;
      renderBox(boxIds[currentIndex]);
      updateNavigationButtons();
    }
  });

  function updateNavigationButtons() {
    const prevBtn = document.getElementById("previous");
    const nextBtn = document.getElementById("next");
    prevBtn.textContent = currentIndex > 0 ? "↑" : "";
    prevBtn.style.cursor = currentIndex > 0 ? "pointer" : "default";
    nextBtn.textContent = currentIndex < boxIds.length - 1 ? "↓" : "";
    nextBtn.style.cursor =
      currentIndex < boxIds.length - 1 ? "pointer" : "default";
  }

  updateNavigationButtons();
}

waitForSpaceAndRender();
