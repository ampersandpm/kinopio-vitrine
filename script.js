// ---------------------------------------------------------------------
// fetch the data and format into slides object
// ---------------------------------------------------------------------

const urlParams = new URLSearchParams(window.location.search);
let spaceid =
  urlParams.get("space") ||
  "https://kinopio.club/kn-vitrine-ZNXXsP5cFZ5712kFb1vON";
spaceid = spaceid.replace(/\/$/, "").slice(-21);

fetch(`https://api.kinopio.club/space/${spaceid}/`, {
  method: "GET",
})
  .then((response) => response.json())
  .then((data) => {
    const sortByPosition = (a, b) => a.y - b.y || a.x - b.x;
    const sortedBoxes = data.boxes.sort(sortByPosition);

    function isContained(item, container) {
      return (
        item.x >= container.x &&
        item.x + item.width <= container.x + container.resizeWidth &&
        item.y >= container.y &&
        item.y + item.height <= container.y + container.resizeHeight
      );
    }

    function findConnectionTarget(card, connections, sortedBoxes, allCards) {
      const connection = connections.find(
        (conn) => conn.startItemId === card.id,
      );
      if (!connection) return { connectedToCard: null, connectedToBox: null };

      const endId = connection.endItemId;
      const boxIndexMap = new Map(sortedBoxes.map((b, idx) => [b.id, idx]));
      const targetBoxIndex = boxIndexMap.get(endId);
      if (targetBoxIndex !== undefined) {
        return { connectedToCard: null, connectedToBox: targetBoxIndex };
      }

      const targetCard = allCards.find((c) => c.id === endId);
      if (!targetCard) return { connectedToCard: null, connectedToBox: null };

      const containingBoxIdx = sortedBoxes.findIndex((b) =>
        isContained(targetCard, b),
      );
      if (containingBoxIdx === -1)
        return { connectedToCard: null, connectedToBox: null };

      const targetBoxCards = allCards
        .filter((c) => isContained(c, sortedBoxes[containingBoxIdx]))
        .sort(sortByPosition);
      const cardIdx = targetBoxCards.findIndex((c) => c.id === targetCard.id);
      return { connectedToCard: cardIdx, connectedToBox: containingBoxIdx };
    }

    window.slides = {
      boxes: sortedBoxes.map((box) => {
        const boxCards = data.cards
          .filter((card) => isContained(card, box))
          .sort(sortByPosition);
        return {
          ...box,
          cards: boxCards.map((card) => ({
            ...card,
            ...findConnectionTarget(
              card,
              data.connections,
              sortedBoxes,
              data.cards,
            ),
          })),
        };
      }),
    };
  });

// ---------------------------------------------------------------------
// rendering time !
// ---------------------------------------------------------------------

async function render() {
  while (!window.slides) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // prefetch all image urls in slides
  const imageUrlRegex =
    /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp)(\?[^ ]*)?(#.*)?$/i;
  const allRelevantCards = window.slides.boxes.flatMap((box) => box.cards);
  const urls = new Set([
    ...window.slides.boxes.map((b) => b.background).filter(Boolean),
    ...allRelevantCards.flatMap((card) =>
      card.name
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => imageUrlRegex.test(l)),
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
      if (loaded === total) indicator.textContent = "";
    };
    urls.forEach((url) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        updateProgress();
      };
      img.src = url;
    });
  }

  function processMDInline(innerText) {
    const div = document.createElement("div");
    div.textContent = innerText;
    let text = div.innerHTML;

    text = text.replace(
      /\*\*([^*]+?)\*\*/g,
      (_, p1) => `<strong>${p1.trim()}</strong>`,
    );
    text = text.replace(/_([^_]+?)_/g, (_, p1) => `<em>${p1.trim()}</em>`);
    text = text.replace(
      /\[([^\]]+?)\]\(([^)]+?)\)/g,
      (_, p1, p2) => `<a target="_blank" href="${p2.trim()}">${p1.trim()}</a>`,
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

  function calculateContrastColor(bgColor) {
    if (!bgColor.startsWith("#")) return "black";
    const r = parseInt(bgColor.slice(1, 3), 16);
    const g = parseInt(bgColor.slice(3, 5), 16);
    const b = parseInt(bgColor.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.4 ? "black" : "white";
  }

  function renderCard(cardDiv, card) {
    const imageUrlRegex =
      /^https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|svg|webp)(\?[^ ]*)?(#.*)?$/i;
    let imageUrl = null;
    let filteredLines = [];
    const lines = card.name.split("\n");

    for (let line of lines) {
      const trimmed = line.trim();
      if (!imageUrl && imageUrlRegex.test(trimmed)) {
        imageUrl = trimmed;
      } else {
        filteredLines.push(line);
      }
    }

    let textContent = imageUrl ? filteredLines.join("\n").trim() : card.name;

    cardDiv.style.position = "absolute";
    cardDiv.style.height = card.height + "px";
    cardDiv.classList.add(
      `header-font-family-${card.headerFontId}`,
      `header-font-size-${card.headerFontSize}`,
    );
    cardDiv.style.color = calculateContrastColor(card.backgroundColor);

    if (imageUrl) {
      cardDiv.classList.add("image");
      cardDiv.style.backgroundImage = `url(${imageUrl})`;
      cardDiv.style.backgroundSize = "cover";
      cardDiv.style.width = card.width + "px";
      textContent = `<div class="text" style="background-color: ${card.backgroundColor}">${parseMarkdown(textContent)}</div>`;
    } else {
      cardDiv.style.width = card.width - 16 + "px"; // removing the connector width
      cardDiv.style.backgroundColor = card.backgroundColor;
      textContent = `<div class="text">${parseMarkdown(textContent)}</div>`;
    }

    // add the onclick event
    if (card.connectedToBox !== null) {
      cardDiv.classList.add("linked");
      cardDiv.onclick = () => {
        goToSlide(card.connectedToBox);
        if (card.connectedToCard !== null) {
          const slide = document.getElementById("slide");
          slide.children[card.connectedToCard].classList.add("shiny");
          setTimeout(() => {
            slide.children[card.connectedToCard].classList.remove("shiny");
          }, 5000);
        }
      };
    }

    // check if the card is a comment card
    if (card.isComment) {
      cardDiv.classList.add("comment");
    }

    cardDiv.innerHTML = textContent;
  }

  function renderBox(boxIndex) {
    const box = window.slides.boxes[boxIndex];
    const slide = document.getElementById("slide");
    const slideTitle = document.getElementById("slide-title");

    slide.innerHTML = "";
    slide.style.background = "none";
    slideTitle.style.display = "none";

    if (!/^Box \d+$/.test(box.name)) {
      slideTitle.style.display = "flex";
      slideTitle.innerHTML = `<p>${box.name}</p>`;
    }

    slide.style.width = box.resizeWidth + "px";
    slide.style.height = box.resizeHeight + "px";
    slide.style.backgroundColor = box.color;
    slide.style.backgroundImage = box.background || "transparent";
    if (box.background) {
      slide.style.backgroundImage = `url(${box.background})`;
      if (box.backgroundIsStretch) {
        slide.style.backgroundSize = "cover";
      }
    }

    box.cards.forEach((card) => {
      if (card.name) {
        const cardDiv = document.createElement("div");
        cardDiv.style.transformOrigin = "top right";
        cardDiv.style.transform = `translate(${card.x - box.x + 8}px, ${card.y - box.y}px) rotate(${card.tilt}deg)`;
        cardDiv.style.zIndex = card.z;
        renderCard(cardDiv, card);
        slide.appendChild(cardDiv);
      }
    });

    const scale = Math.min(
      (window.innerWidth - 50) / box.resizeWidth,
      (window.innerHeight - 50) / box.resizeHeight,
    );
    const halfWidth = (box.resizeWidth * scale) / 2;
    const halfHeight = (box.resizeHeight * scale) / 2;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    if (
      window.innerWidth > box.resizeWidth &&
      window.innerHeight > box.resizeHeight
    ) {
      slide.style.transformOrigin = "center";
      slide.style.marginTop = "0px";
      slide.style.marginLeft = "0px";
    } else if (
      window.innerWidth > box.resizeWidth &&
      window.innerHeight < box.resizeHeight
    ) {
      slide.style.marginTop = "25px";
      slide.style.transformOrigin = "top";
    } else if (
      window.innerWidth < box.resizeWidth &&
      window.innerHeight > box.resizeHeight
    ) {
      slide.style.marginLeft = "5px";
      slide.style.transformOrigin = "left";
    } else {
      slide.style.marginTop = `${centerY - halfHeight}px`;
      slide.style.marginLeft = `${centerX - halfWidth}px`;
      slide.style.transformOrigin = "top left";
    }
    slide.style.transform = `scale(${scale})`;
  }

  let currentIndex = 0;
  renderBox(currentIndex);

  function goToSlide(index) {
    if (index >= 0 && index < window.slides.boxes.length) {
      currentIndex = index;
      renderBox(currentIndex);
      updateNavigationButtons();
    }
  }

  function updateNavigationButtons() {
    const prevBtn = document.getElementById("previous");
    const nextBtn = document.getElementById("next");
    prevBtn.textContent = currentIndex > 0 ? "↑" : "";
    prevBtn.style.cursor = currentIndex > 0 ? "pointer" : "default";
    nextBtn.textContent =
      currentIndex < window.slides.boxes.length - 1 ? "↓" : "";
    nextBtn.style.cursor =
      currentIndex < window.slides.boxes.length - 1 ? "pointer" : "default";
  }

  updateNavigationButtons();

  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      goToSlide(currentIndex + 1);
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      goToSlide(currentIndex - 1);
      e.preventDefault();
    }
  });

  document.getElementById("previous").addEventListener("click", () => {
    goToSlide(currentIndex - 1);
  });

  document.getElementById("next").addEventListener("click", () => {
    goToSlide(currentIndex + 1);
  });
}

render();
