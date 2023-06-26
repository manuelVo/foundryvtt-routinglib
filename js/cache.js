import {resetJobs} from "./background.js";
import {getPixelsFromGridPositionObj} from "./foundry_fixes.js";
import {getSnapPointForTokenDataObj, isModuleActive} from "./util.js";

import * as GridlessPathfinding from "../wasm/gridless_pathfinding.js";

export let cache;

export function initializeCaches() {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		cache = new GridlessCache();
	} else {
		cache = new GriddedCache();
	}
}

export function wipeCaches() {
	cache.reset();
	resetJobs();
}

class Cache {
	constructor() {
		this.reset();
	}

	reset() {
		this.levelIndexes = detectLevels();
		this.graphs = [];
	}

	getLevelIndexForElevation(elevation) {
		let start = 0;
		let end = this.levelIndexes.length;
		// Bisect levelindexes to find the correct index for the current elevation
		while (start !== end) {
			const center = (start + end) >> 1; // Integer division by 2
			const border = this.levelIndexes[center];
			if (elevation == border.elevation) {
				if (border.isTop) {
					start = center - 1;
					end = center - 1;
				} else {
					start = center;
					end = center;
				}
			} else if (elevation < border.elevation) {
				end = center;
			} else {
				start = center + 1;
			}
		}
		return start;
	}
}

export class GriddedCache extends Cache {
	reset() {
		super.reset();
		if (canvas.grid.isHex && canvas.grid.grid.columnar) {
			this.gridWidth = Math.ceil(canvas.dimensions.width / ((3 / 4) * canvas.grid.w));
		} else {
			this.gridWidth = Math.ceil(canvas.dimensions.width / canvas.grid.w);
		}
		if (canvas.grid.isHex && !canvas.grid.grid.columnar) {
			this.gridHeight = Math.ceil(canvas.dimensions.height / ((3 / 4) * canvas.grid.h));
		} else {
			this.gridHeight = Math.ceil(canvas.dimensions.height / canvas.grid.h);
		}
	}

	static getSnapPointIndexForTokenData(tokenData) {
		if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) return 0;
		if (canvas.grid.isHex) {
			if (tokenData.hexSizeSupport?.altSnappingFlag) {
				return tokenData.hexSizeSupport.borderSize % 2;
			} else {
				return 0;
			}
		}
		return tokenData.width % 2 | (tokenData.height % 2 << 1);
	}

	getInitializedNode(pos, sizeIndex, levelIndex, tokenData) {
		let sizeGraphs = this.graphs[sizeIndex];
		if (!sizeGraphs) {
			sizeGraphs = [];
			this.graphs[sizeIndex] = sizeGraphs;
		}
		let graph = sizeGraphs[levelIndex];
		if (!graph) {
			graph = this.makeEmptyGraph();
			sizeGraphs[levelIndex] = graph;
		}
		let node = graph[pos.y][pos.x];
		if (!node) {
			const neighbors = [];
			for (const neighborPos of canvas.grid.grid.getNeighbors(pos.y, pos.x).map(([y, x]) => {
				return {x, y};
			})) {
				if (
					neighborPos.x < 0 ||
					neighborPos.y < 0 ||
					neighborPos.x >= this.gridWidth ||
					neighborPos.y >= this.gridHeight
				) {
					continue;
				}
				if (!stepCollidesWithWall(pos, neighborPos, tokenData, true)) {
					const isDiagonal =
						pos.x !== neighborPos.x &&
						pos.y !== neighborPos.y &&
						canvas.grid.type === CONST.GRID_TYPES.SQUARE;
					neighbors.push({...neighborPos, isDiagonal});
				}
			}
			node = {...pos, neighbors};

			graph[pos.y][pos.x] = node;
		}
		return node;
	}

	makeEmptyGraph() {
		const graph = new Array(this.gridHeight);
		for (let y = 0; y < this.gridHeight; y++) {
			graph[y] = new Array(this.gridWidth);
		}
		return graph;
	}
}

class GridlessCache extends Cache {
	getGraphFor(tokenSize, levelIndex, elevation) {
		let levelGraphs = this.graphs[levelIndex];
		if (!levelGraphs) {
			levelGraphs = new Map();
			this.graphs[levelIndex] = levelGraphs;
		}
		let graph = levelGraphs[tokenSize];
		if (!graph) {
			const tokenCalcSize =
				tokenSize * canvas.grid.size * game.settings.get("routinglib", "gridlessTokenSizeRatio");
			const walls = canvas.walls.placeables;
			const wallHeightEnabled = isModuleActive("wall-height");
			graph = GridlessPathfinding.initializeGraph(
				walls,
				tokenCalcSize,
				elevation,
				wallHeightEnabled,
			);
			levelGraphs[tokenSize] = graph;
		}
		return graph;
	}
}

class LevelBorder {
	constructor(elevation, isTop) {
		this.elevation = elevation;
		this.isTop = isTop;
	}
}

function detectLevels() {
	const levelBorders = new Map();
	levelBorders[-Infinity] = {hasTop: false, hasBottom: true};
	levelBorders[Infinity] = {hasTop: true, hasBottom: false};
	const levelBorderElevations = [-Infinity, Infinity];
	if (isModuleActive("wall-height")) {
		for (const wall of canvas.walls.placeables) {
			const wallHeight = wall.document.flags["wall-height"];
			const top = wallHeight?.top ?? Infinity;
			const topBorder = levelBorders[top];
			if (!topBorder) {
				levelBorders[top] = {hasTop: true, hasBottom: false};
				levelBorderElevations.push(top);
			} else {
				topBorder.hasTop = true;
			}
			const bottom = wallHeight?.bottom ?? -Infinity;
			const bottomBorder = levelBorders[bottom];
			if (!bottomBorder) {
				levelBorders[bottom] = {hasTop: false, hasBottom: true};
				levelBorderElevations.push(bottom);
			} else {
				bottomBorder.hasBottom = true;
			}
		}
	}
	// Levels must be sorted because it will be bisected later
	levelBorderElevations.sort();
	const levels = [];
	for (const elevation of levelBorderElevations) {
		const border = levelBorders[elevation];
		if (border.hasBottom) {
			levels.push(new LevelBorder(elevation, false));
		}
		if (border.hasTop) {
			levels.push(new LevelBorder(elevation, true));
		}
	}
	return levels;
}

export function stepCollidesWithWall(from, to, tokenData, adjustPos = false) {
	const stepStart = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(from), tokenData);
	const stepEnd = getSnapPointForTokenDataObj(getPixelsFromGridPositionObj(to), tokenData);
	let adjustedStart;
	if (adjustPos) {
		// Using an adjusted position 1 pixel away from the center of the grid prevents the path from leaving
		// that square if a wall is dead-center. This prevents bugs where a token is allowed to move through walls
		// if it starts pathfinding on such a square.
		adjustedStart = {
			x: stepStart.x + Math.sign(stepStart.x - stepEnd.x),
			y: stepStart.y + Math.sign(stepStart.y - stepEnd.y),
		};
	} else {
		adjustedStart = stepStart;
	}
	adjustedStart.t = adjustedStart.b = tokenData.elevation;
	const source = new VisionSource({});
	return CONFIG.Canvas.polygonBackends.move.testCollision(adjustedStart, stepEnd, {
		mode: "any",
		type: "move",
		source,
	});
}
