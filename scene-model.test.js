import assert from "node:assert/strict";
import test from "node:test";

import { buildScene, connectionPath, isContained } from "./scene-model.js";

const box = (id, x) => ({
  id,
  x,
  y: 0,
  resizeWidth: 100,
  resizeHeight: 100,
});
const card = (id, x) => ({ id, x, y: 10, width: 20, height: 20 });

test("containment includes cards touching a box border", () => {
  assert.equal(isContained(card("card", 80), box("box", 0)), true);
  assert.equal(isContained(card("card", 81), box("box", 0)), false);
});

test("same-box connections render while cross-box connections navigate", () => {
  const space = {
    boxes: [box("one", 0), box("two", 200)],
    cards: [card("a", 10), card("b", 50), card("c", 210)],
    connections: [
      { id: "internal", startItemId: "a", endItemId: "b" },
      { id: "cross", startItemId: "a", endItemId: "c" },
    ],
  };
  const scene = buildScene(space);

  assert.deepEqual(
    scene.scenes[0].connections.map(({ id }) => id),
    ["internal"],
  );
  assert.deepEqual(scene.scenes[1].connections, []);
  assert.equal(
    scene.scenes[0].navigationTargetsByCardId.get("a")[0].boxId,
    "two",
  );
});

test("connections to boxes remain navigation-only", () => {
  const space = {
    boxes: [box("one", 0), box("two", 200)],
    cards: [card("a", 10)],
    connections: [{ id: "to-box", startItemId: "a", endItemId: "two" }],
  };
  const scene = buildScene(space);

  assert.deepEqual(scene.scenes[0].connections, []);
  assert.equal(
    scene.scenes[0].navigationTargetsByCardId.get("a")[0].boxIndex,
    1,
  );
});

test("all outgoing links are retained", () => {
  const space = {
    boxes: [box("one", 0), box("two", 200), box("three", 400)],
    cards: [card("a", 10), card("b", 210), card("c", 410)],
    connections: [
      { id: "ab", startItemId: "a", endItemId: "b" },
      { id: "ac", startItemId: "a", endItemId: "c" },
    ],
  };
  const scene = buildScene(space);
  assert.deepEqual(
    scene.scenes[0].navigationTargetsByCardId
      .get("a")
      .map(({ boxId }) => boxId),
    ["two", "three"],
  );
});

test("missing paths use Kinopio connector geometry", () => {
  const cards = new Map([
    ["a", card("a", 10)],
    ["b", card("b", 50)],
  ]);
  assert.equal(
    connectionPath({ startItemId: "a", endItemId: "b" }, cards),
    "m15,25 q90,40 40,0",
  );
});
