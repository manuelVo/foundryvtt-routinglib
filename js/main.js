import {initializeBackground, createAsyncPathfinder, cancelJob} from "./background.js";
import {cache, GriddedCache, initializeCaches, wipeCaches} from "./cache.js";
import {GriddedPathfinder, GridlessPathfinder} from "./pathfinder.js";

import initGridlessPathfinding from "../wasm/gridless_pathfinding.js";
import {getAltOrientationFlagForToken, getHexTokenSize, isModuleActive} from "./util.js";

let foundryReady = false;
let wasmReady = false;

function initializePathfinder(from, to, options) {
	const token = options.token;

	let elevation = options.elevation;
	let tokenData;

	if (token) {
		tokenData = {width: token.document.width, height: token.document.height};
		if (!elevation) {
			elevation =
				isModuleActive("wall-height") && WallHeight._blockSightMovement
					? token.losHeight
					: token.document.elevation;
		}
		if (canvas.grid.isHex) {
			tokenData.size = getHexTokenSize(token);
			tokenData.altOrientation = getAltOrientationFlagForToken(token, tokenData.size);
		}
	} else {
		tokenData = {width: 1, height: 1};
		elevation = elevation ?? 0;
		if (canvas.grid.isHex) {
			tokenData.size = 1;
			tokenData.altOrientation = false;
		}
	}

	tokenData.elevation = elevation;

	const levelIndex = cache.getLevelIndexForElevation(elevation);
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		const tokenSize = Math.max(tokenData.width, tokenData.height);
		const graph = cache.getGraphFor(tokenSize, levelIndex, elevation);
		return new GridlessPathfinder(graph, from, to, options);
	} else {
		const sizeIndex = GriddedCache.getSnapPointIndexForTokenData(tokenData);
		return new GriddedPathfinder(sizeIndex, levelIndex, from, to, token, tokenData, options);
	}
}

function calculatePath(from, to, options = {}) {
	const pathfinder = initializePathfinder(from, to, options);
	return createAsyncPathfinder(pathfinder);
}

function calculatePathBlocking(from, to, options = {}) {
	if (!options.maxDistance) {
		throw "A maximum distance (options.maxDistance) must be specified when calling `calculatePathBlocking`. To calculte long paths, please use the ";
	}
	const pathfinder = initializePathfinder(from, to, options);

	let path = undefined;
	while (path === undefined) {
		path = pathfinder.step();
	}

	if (path === null) {
		return null;
	}

	return pathfinder.postProcessResult(path);
}

Hooks.once("init", async () => {
	game.settings.register("routinglib", "gridlessTokenSizeRatio", {
		scope: "world",
		config: false,
		type: Number,
		default: 0.9,
		onChange: () => {
			if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
				cache.reset();
			}
		},
	});
});

Hooks.once("ready", async () => {
	foundryReady = true;
	initializeIfReady();
});

initGridlessPathfinding().then(() => {
	wasmReady = true;
	initializeIfReady();
});

function initializeIfReady() {
	if (!foundryReady || !wasmReady) return;
	initializeCaches();
	initializeBackground();
	window.routinglib = {calculatePath, calculatePathBlocking, cancelPathfinding};

	Hooks.on("canvasInit", wipeCaches);
	// TODO There's no point in re-running jobs when switching scenes. Better cancel them all in that case
	Hooks.on("canvasReady", initializeCaches);
	Hooks.on("createWall", wipeCaches);
	Hooks.on("updateWall", wipeCaches);
	Hooks.on("deleteWall", wipeCaches);

	Hooks.callAll("routinglib.ready");
}

function cancelPathfinding(promise) {
	return cancelJob(promise);
}
