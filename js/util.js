export function getSnapPointForToken(x, y, token) {
	return getSnapPointForTokenData(x, y, buildSnapPointTokenData(token));
}

export function getSnapPointForTokenDataObj(pos, tokenData) {
	return getSnapPointForTokenData(pos.x, pos.y, tokenData);
}

// A copy of this function lives in the Drag Ruler module
function getSnapPointForTokenData(x, y, tokenData) {
	if (canvas.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return new PIXI.Point(x, y);
	}
	if (canvas.grid.isHex) {
		if (tokenData.hexSizeSupport?.altSnappingFlag) {
			if (tokenData.hexSizeSupport.borderSize % 2 === 0) {
				const snapPoint = findVertexSnapPoint(x, y, tokenData.hexSizeSupport.altOrientationFlag);
				return new PIXI.Point(snapPoint.x, snapPoint.y);
			} else {
				return new PIXI.Point(...canvas.grid.getCenter(x, y));
			}
		} else {
			return new PIXI.Point(...canvas.grid.getCenter(x, y));
		}
	}

	const [topLeftX, topLeftY] = canvas.grid.getTopLeft(x, y);
	let cellX, cellY;
	if (tokenData.width % 2 === 0) cellX = x - canvas.grid.h / 2;
	else cellX = x;
	if (tokenData.height % 2 === 0) cellY = y - canvas.grid.h / 2;
	else cellY = y;
	const [centerX, centerY] = canvas.grid.getCenter(cellX, cellY);
	let snapX, snapY;
	// Tiny tokens can snap to the cells corners
	if (tokenData.width <= 0.5) {
		const offsetX = x - topLeftX;
		const subGridWidth = Math.floor(canvas.grid.w / 2);
		const subGridPosX = Math.floor(offsetX / subGridWidth);
		snapX = topLeftX + (subGridPosX + 0.5) * subGridWidth;
	}
	// Tokens with odd multipliers (1x1, 3x3, ...) and tokens smaller than 1x1 but bigger than 0.5x0.5 snap to the center of the grid cell
	else if (Math.round(tokenData.width) % 2 === 1 || tokenData.width < 1) {
		snapX = centerX;
	}
	// All remaining tokens (those with even or fractional multipliers on square grids) snap to the intersection points of the grid
	else {
		snapX = centerX + canvas.grid.w / 2;
	}
	if (tokenData.height <= 0.5) {
		const offsetY = y - topLeftY;
		const subGridHeight = Math.floor(canvas.grid.h / 2);
		const subGridPosY = Math.floor(offsetY / subGridHeight);
		snapY = topLeftY + (subGridPosY + 0.5) * subGridHeight;
	} else if (Math.round(tokenData.height) % 2 === 1 || tokenData.height < 1) {
		snapY = centerY;
	} else {
		snapY = centerY + canvas.grid.h / 2;
	}
	return new PIXI.Point(snapX, snapY);
}

export function isModuleActive(moduleName) {
	return game.modules.get(moduleName)?.active;
}

export function getTokenShapeForTokenData(tokenData, scene = canvas.scene) {
	if (scene.grid.type === CONST.GRID_TYPES.GRIDLESS) {
		return [{x: 0, y: 0}];
	} else if (scene.grid.type === CONST.GRID_TYPES.SQUARE) {
		const topOffset = -Math.floor(tokenData.height / 2);
		const leftOffset = -Math.floor(tokenData.width / 2);
		const shape = [];
		for (let y = 0; y < tokenData.height; y++) {
			for (let x = 0; x < tokenData.width; x++) {
				shape.push({x: x + leftOffset, y: y + topOffset});
			}
		}
		return shape;
	} else {
		// Hex grids
		if (isModuleActive("hex-size-support") && tokenData.hexSizeSupport.altSnappingFlag) {
			const borderSize = tokenData.hexSizeSupport.borderSize;
			let shape = [{x: 0, y: 0}];
			if (borderSize >= 2)
				shape = shape.concat([
					{x: 0, y: -1},
					{x: -1, y: -1},
				]);
			if (borderSize >= 3)
				shape = shape.concat([
					{x: 0, y: 1},
					{x: -1, y: 1},
					{x: -1, y: 0},
					{x: 1, y: 0},
				]);
			if (borderSize >= 4)
				shape = shape.concat([
					{x: -2, y: -1},
					{x: 1, y: -1},
					{x: -1, y: -2},
					{x: 0, y: -2},
					{x: 1, y: -2},
				]);

			if (Boolean(tokenData.hexSizeSupport.altOrientationFlag) !== canvas.grid.grid.options.columns)
				shape.forEach(space => (space.y *= -1));
			if (canvas.grid.grid.options.columns)
				shape = shape.map(space => {
					return {x: space.y, y: space.x};
				});
			return shape;
		} else {
			return [{x: 0, y: 0}];
		}
	}
}

// We cannot write objects into sets, so we calculate a id from the nodes coordinates instead
export function nodeId(node) {
	// This will work with grids of up to 2^16x2^16, so it should be fine
	return (node.x << 16) | node.y;
}

export function getAreaFromPositionAndShape(position, shape) {
	return shape.map(space => {
		let x = position.x + space.x;
		let y = position.y + space.y;
		if (canvas.grid.isHex) {
			let shiftedRow;
			if (canvas.grid.grid.options.even) shiftedRow = 1;
			else shiftedRow = 0;
			if (canvas.grid.grid.options.columns) {
				if (space.x % 2 !== 0 && position.x % 2 !== shiftedRow) {
					y += 1;
				}
			} else {
				if (space.y % 2 !== 0 && position.y % 2 !== shiftedRow) {
					x += 1;
				}
			}
		}
		return {x, y};
	});
}
