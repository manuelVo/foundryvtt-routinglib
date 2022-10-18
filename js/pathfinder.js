import {cache, stepCollidesWithWall} from "./cache.js";
import {PriorityQueueSet} from "./data_structures.js";
import {getCenterFromGridPositionObj} from "./foundry_fixes.js";
import {
	applyOffset,
	buildOffset,
	getAreaFromPositionAndShape,
	getTokenShapeForTokenData,
	nodeId,
} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";

export class GriddedPathfinder {
	constructor(sizeIndex, levelIndex, from, to, token, tokenData, options) {
		this.sizeIndex = sizeIndex;
		this.levelIndex = levelIndex;
		this.targetPos = to;
		this.startPos = from;
		this.token = token;
		this.tokenData = tokenData;
		this.tokenShape = getTokenShapeForTokenData(tokenData);
		this.startCost = 0; // TODO Allow specifying a start cost
		this.interpolate = options.interpolate ?? true;
		this.maxDistance = options.maxDistance ?? Infinity;
		this.maxDistance = Math.round(this.maxDistance / canvas.scene.dimensions.distance);
		this.ignoreTerrain = options.ignoreTerrain ?? false;
		this.reset();
	}

	reset() {
		this.use5105 = game.system.id === "pf2e" || canvas.grid.diagonalRule === "5105";
		this.nextNodes = new PriorityQueueSet(
			(node1, node2) => node1.node === node2.node,
			node => node.estimated,
		);
		this.previousNodes = new Set();
		this.gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
		this.gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
		this.startNode = cache.getInitializedNode(
			this.startPos,
			this.sizeIndex,
			this.levelIndex,
			this.tokenData,
		);
		this.nextNodes.pushWithPriority({
			node: this.startNode,
			cost: this.startCost,
			estimated: this.startCost + this.estimateCost(this.startPos, this.targetPos),
			previous: null,
		});
	}

	step() {
		const currentNode = this.nextNodes.pop();
		if (!currentNode) {
			return null;
		}
		if (currentNode.cost > this.maxDistance) {
			return null;
		}
		if (currentNode.node.x === this.targetPos.x && currentNode.node.y === this.targetPos.y) {
			return currentNode;
		}
		this.previousNodes.add(nodeId(currentNode.node));
		const tokenArea = getAreaFromPositionAndShape(currentNode.node, this.tokenShape);
		for (const neighbor of currentNode.node.neighbors) {
			const neighborNode = cache.getInitializedNode(
				neighbor,
				this.sizeIndex,
				this.levelIndex,
				this.tokenData,
			);
			if (this.previousNodes.has(nodeId(neighborNode))) {
				continue;
			}
			let cost;
			if (window.terrainRuler && !this.ignoreTerrain) {
				const offset = buildOffset(currentNode.node, neighbor);
				cost = this.terrainCostForStep(tokenArea, offset, currentNode.cost);
			} else {
				// Count 5-10-5 diagonals as 1.5 (so two add up to 3) and 5-5-5 diagonals as 1.0001 (to discourage unnecessary diagonals)
				cost = neighbor.isDiagonal ? (this.use5105 ? 1.5 : 1.0001) : 1;
			}

			cost += currentNode.cost;
			this.nextNodes.pushWithPriority({
				node: neighborNode,
				cost: cost,
				estimated: cost + this.estimateCost(neighborNode, this.targetPos),
				previous: currentNode,
			});
		}
		return undefined;
	}

	terrainCostForStep(tokenArea, offset, previousDistance = 0) {
		let distance = 0;
		for (const srcCell of tokenArea) {
			const dstCell = applyOffset(srcCell, offset);
			// TODO Cache the result of source->destination measurements to speed up the pathfinding for large tokens
			const ray = new Ray(
				getCenterFromGridPositionObj(srcCell),
				getCenterFromGridPositionObj(dstCell),
			);
			const options = {};
			let halfStep = previousDistance % 1;
			if (halfStep > 0.25 && halfStep < 0.75) {
				options.terrainRulerInitialState = {noDiagonals: 1};
			}
			let measured = terrainRuler.measureDistances([{ray}], {token: this.token})[0];
			// TODO Maybe terrain ruler could just return the distance in cells in the first place
			measured = Math.round(measured / canvas.dimensions.distance);
			if (ray.terrainRulerFinalState?.noDiagonals === 1) {
				measured += 0.5;
			}
			distance = Math.max(distance, measured);
		}
		return distance;
	}

	postProcessResult(firstNode) {
		const path = [];
		const cost = Math.floor(firstNode.cost) * canvas.dimensions.distance;
		let currentNode = firstNode;
		while (currentNode) {
			if (this.interpolate) {
				if (
					path.length >= 2 &&
					!stepCollidesWithWall(path[path.length - 2], currentNode.node, this.tokenData)
				) {
					// Replace last waypoint if the current waypoint leads to a valid path that isn't longer than the old path
					if (window.terrainRuler) {
						const startNode = path[path.length - 2];
						const middleNode = path[path.length - 1];
						const endNode = currentNode.node;

						const startArea = getAreaFromPositionAndShape(startNode, this.tokenShape);
						const startMiddleOffset = {
							x: middleNode.x - startNode.x,
							y: middleNode.y - startNode.y,
						};
						const startEndOffset = buildOffset(startNode, endNode);
						const middleArea = getAreaFromPositionAndShape(middleNode, this.tokenShape);
						const middleEndOffset = buildOffset(middleNode, endNode);

						// TODO Cache the measurement for use in the next loop to improve performance - this can possibly be done withing terrainCostForStep
						const middleDistance = this.terrainCostForStep(startArea, startMiddleOffset);
						const oldDistance =
							middleDistance + this.terrainCostForStep(middleArea, middleEndOffset, middleDistance);
						const newDistance = this.terrainCostForStep(startArea, startEndOffset);

						if (newDistance <= oldDistance) {
							path.pop();
						}
					} else {
						path.pop();
					}
				}
			}

			path.push({x: currentNode.node.x, y: currentNode.node.y});
			currentNode = currentNode.previous;
		}
		path.reverse();
		return {path, cost};
	}

	/**
	 * Estimate the travel distance between two points, as the crow flies. Most of the time, this is 1
	 * per space, but for a square grid using 5-10-5 diagonals, count each diagonal as an extra 0.5
	 */
	estimateCost(pos, target) {
		const distX = Math.abs(pos.x - target.x);
		const distY = Math.abs(pos.y - target.y);
		return Math.max(distX, distY) + (this.use5105 ? Math.min(distX, distY) * 0.5 : 0);
	}

	free() {
		// The gridded pathfinder is 100% Javascript, so we don't need to do anything
	}
}

export class GridlessPathfinder {
	constructor(graph, from, to, options) {
		const maxDistance = options.maxDistance ?? Infinity;
		this.pathfinder = GridlessPathfinding.initializePathfinder(from, to, graph, maxDistance);
	}

	reset() {
		GridlessPathfinding.resetPathfinder();
	}

	step() {
		return GridlessPathfinding.step(this.pathfinder);
	}

	postProcessResult(result) {
		// The rust code already does everything that's necessary, so just return the result
		return result;
	}

	free() {
		GridlessPathfinding.dropPathfinder(this.pathfinder);
	}
}
