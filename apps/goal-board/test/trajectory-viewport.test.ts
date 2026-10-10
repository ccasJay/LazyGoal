import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_ZOOM,
  MAX_ZOOM,
  MIN_VIEW_WIDTH,
  MAX_VIEW_WIDTH,
  clampViewport,
  shiftViewport,
  scaleViewport,
} from "../src/trajectory-viewport.js";

test("Timeline zoom constants enforce 0.5x compact view to 25x detailed view", () => {
  assert.equal(MIN_ZOOM, 0.5);
  assert.equal(MAX_ZOOM, 25);
  assert.equal(MIN_VIEW_WIDTH, 0.04);
  assert.equal(MAX_VIEW_WIDTH, 2.0);
});

test("clampViewport keeps viewport bounds contained and prevents negative drift", () => {
  // width <= 1: zoomed in [0, 1 - width]
  assert.deepEqual(clampViewport(0, 0.2), [0, 0.2]);
  assert.deepEqual(clampViewport(-0.1, 0.2), [0, 0.2]);
  assert.deepEqual(clampViewport(0.9, 0.2), [0.8, 1.0]);

  // width > 1: compact view [1 - width, 0]
  assert.deepEqual(clampViewport(-0.5, 2.0), [-0.5, 1.5]);
  assert.deepEqual(clampViewport(-1.5, 2.0), [-1.0, 1.0]);
  assert.deepEqual(clampViewport(0.5, 2.0), [0, 2.0]);
});

test("scaleViewport supports compact zoom out up to 0.5x (width 2.0)", () => {
  const initial: [number, number] = [0, 1];
  // 缩放到 2 倍视口宽度（0.5x 紧凑缩放）
  const compact = scaleViewport(initial, 2.0, 0.5);
  assert.equal(compact[1] - compact[0], 2.0);
  assert.equal(compact[0], -0.5);
  assert.equal(compact[1], 1.5);

  // 尝试进一步缩小，严格限制在 MAX_VIEW_WIDTH (2.0，即 0.5x)
  const furtherOut = scaleViewport(compact, 2.0, 0.5);
  assert.equal(furtherOut[1] - furtherOut[0], 2.0);
  assert.equal(furtherOut[0], -0.5);
});

test("scaleViewport clamps maximum zoom in to 25x (width 0.04), never reaching 1000x", () => {
  const initial: [number, number] = [0, 1];
  // 大幅放大
  const zoomedIn = scaleViewport(initial, 0.0001, 0.5);
  const width = Number((zoomedIn[1] - zoomedIn[0]).toFixed(4));
  assert.equal(width, 0.04); // 25x
  const zoomLevel = Number((1 / width).toFixed(1));
  assert.equal(zoomLevel, 25.0);
});

test("shiftViewport safely pans in both compact and zoomed-in modes", () => {
  // Zoomed in: width = 0.5, left clamped between [0, 0.5]
  assert.deepEqual(shiftViewport([0.1, 0.6], 0.1), [0.2, 0.7]);
  assert.deepEqual(shiftViewport([0.4, 0.9], 0.2), [0.5, 1.0]);
  assert.deepEqual(shiftViewport([0.1, 0.6], -0.3), [0, 0.5]);

  // Compact: width = 2.0, left clamped between [-1.0, 0]
  assert.deepEqual(shiftViewport([-0.5, 1.5], 0.1), [-0.4, 1.6]);
  assert.deepEqual(shiftViewport([-0.1, 1.9], 0.5), [0, 2.0]);
  assert.deepEqual(shiftViewport([-0.9, 1.1], -0.5), [-1.0, 1.0]);
});
