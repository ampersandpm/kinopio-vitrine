const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const itemWidth = (item) =>
  number(item.resizeWidth) || number(item.width) || number(item.infoWidth);

export const itemHeight = (item) =>
  number(item.resizeHeight) || number(item.height) || number(item.infoHeight);

export function isContained(item, box) {
  return (
    number(item.x) >= number(box.x) &&
    number(item.y) >= number(box.y) &&
    number(item.x) + itemWidth(item) <= number(box.x) + itemWidth(box) &&
    number(item.y) + itemHeight(item) <= number(box.y) + itemHeight(box)
  );
}

const sortByPosition = (a, b) =>
  number(a.y) - number(b.y) ||
  number(a.x) - number(b.x) ||
  String(a.id).localeCompare(String(b.id));

const first = (set) => set?.values().next().value;

export function buildScene(space) {
  const boxes = [...(space.boxes || [])]
    .filter((box) => !box.isRemoved)
    .sort(sortByPosition);
  const cards = (space.cards || []).filter((card) => !card.isRemoved);
  const connections = (space.connections || []).filter(Boolean);
  const boxesById = new Map(boxes.map((box) => [box.id, box]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const boxIndexById = new Map(boxes.map((box, index) => [box.id, index]));
  const cardIdsByBoxId = new Map(boxes.map((box) => [box.id, new Set()]));
  const boxIdsByCardId = new Map(cards.map((card) => [card.id, new Set()]));

  for (const box of boxes) {
    for (const card of cards) {
      if (!isContained(card, box)) continue;
      cardIdsByBoxId.get(box.id).add(card.id);
      boxIdsByCardId.get(card.id).add(box.id);
    }
  }

  const internalConnectionsByBoxId = new Map(
    boxes.map((box) => [box.id, []]),
  );
  const navigationTargetsByBoxAndCard = new Map(
    boxes.map((box) => [box.id, new Map()]),
  );

  const addNavigation = (boxId, cardId, target) => {
    const byCard = navigationTargetsByBoxAndCard.get(boxId);
    if (!byCard) return;
    const targets = byCard.get(cardId) || [];
    if (
      !targets.some(
        (item) =>
          item.boxId === target.boxId && item.cardId === target.cardId,
      )
    ) {
      targets.push(target);
      byCard.set(cardId, targets);
    }
  };

  for (const connection of connections) {
    const startCard = cardsById.get(connection.startItemId);
    const endCard = cardsById.get(connection.endItemId);
    const startBoxIds = startCard
      ? boxIdsByCardId.get(startCard.id)
      : new Set();
    const endBoxIds = endCard ? boxIdsByCardId.get(endCard.id) : new Set();

    for (const box of boxes) {
      const isInternal =
        startCard &&
        endCard &&
        startBoxIds.has(box.id) &&
        endBoxIds.has(box.id);
      if (isInternal) {
        internalConnectionsByBoxId.get(box.id).push(connection);
        continue;
      }
      if (!startCard || !startBoxIds.has(box.id)) continue;

      const endBoxId = boxesById.has(connection.endItemId)
        ? connection.endItemId
        : first(endBoxIds);
      if (!endBoxId || endBoxId === box.id) continue;
      addNavigation(box.id, startCard.id, {
        boxId: endBoxId,
        boxIndex: boxIndexById.get(endBoxId),
        cardId: endCard?.id || null,
        connectionId: connection.id,
        label: connection.name || "",
      });
    }
  }

  const scenes = boxes.map((box) => {
    const cardIds = cardIdsByBoxId.get(box.id);
    const boxCards = cards.filter((card) => cardIds.has(card.id)).sort(sortByPosition);
    const horizontalLines = (space.lines || []).filter(
      (line) =>
        !line.isRemoved &&
        number(line.y) >= number(box.y) &&
        number(line.y) <= number(box.y) + itemHeight(box),
    );
    return {
      box,
      cards: boxCards,
      connections: internalConnectionsByBoxId.get(box.id),
      horizontalLines,
      navigationTargetsByCardId:
        navigationTargetsByBoxAndCard.get(box.id),
    };
  });

  return {
    ...space,
    boxes,
    cards,
    connections,
    scenes,
    boxesById,
    cardsById,
    boxIndexById,
    cardIdsByBoxId,
    boxIdsByCardId,
  };
}

export function connectionPath(connection, cardsById) {
  if (connection.path) return connection.path;
  const start = cardsById.get(connection.startItemId);
  const end = cardsById.get(connection.endItemId);
  if (!start || !end) return "";
  const connector = (card) => ({
    x: Math.round(number(card.x) + itemWidth(card) - 15),
    y: Math.round(number(card.y) + 15),
  });
  const from = connector(start);
  const to = connector(end);
  const curve = connection.controlPoint || "q90,40";
  return `m${from.x},${from.y} ${curve} ${to.x - from.x},${to.y - from.y}`;
}

