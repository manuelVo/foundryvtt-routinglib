use std::{cell::RefCell, rc::Rc};

use js_sys::{Array, Object, Reflect};
use wasm_bindgen::prelude::*;

use crate::{
	geometry::Point,
	graph::Graph,
	pathfinder::{Pathfinder, PathfindingResult},
};

#[allow(unused)]
macro_rules! log {
	( $( $t:tt )* ) => {
		log(&format!( $( $t )* ));
	};
}

#[wasm_bindgen]
extern "C" {
	#[wasm_bindgen(js_namespace = console, js_name=warn)]
	pub fn log(s: &str);
}

#[wasm_bindgen]
extern "C" {
	pub type JsWall;
	pub type JsWallDocument;
	pub type JsWallFlags;
	pub type JsWallHeight;

	#[wasm_bindgen(method, getter)]
	fn document(this: &JsWall) -> JsWallDocument;

	#[wasm_bindgen(method, getter)]
	fn c(this: &JsWallDocument) -> Vec<f64>;

	#[wasm_bindgen(method, getter, js_name = "door")]
	fn door_type(this: &JsWallDocument) -> DoorType;

	#[wasm_bindgen(method, getter, js_name = "ds")]
	fn door_state(this: &JsWallDocument) -> DoorState;

	#[wasm_bindgen(method, getter, js_name = "move")]
	fn move_type(this: &JsWallDocument) -> WallSenseType;

	#[wasm_bindgen(method, getter)]
	fn flags(this: &JsWallDocument) -> JsWallFlags;

	#[wasm_bindgen(method, getter, js_name = "wall-height")]
	fn wall_height(this: &JsWallFlags) -> Option<JsWallHeight>;

	#[wasm_bindgen(method, getter, js_name = "top")]
	fn top(this: &JsWallHeight) -> Option<f64>;

	#[wasm_bindgen(method, getter, js_name = "bottom")]
	fn bottom(this: &JsWallHeight) -> Option<f64>;
}

#[wasm_bindgen]
extern "C" {
	pub type JsPoint;

	#[wasm_bindgen(method, getter)]
	fn x(this: &JsPoint) -> f64;

	#[wasm_bindgen(method, getter)]
	fn y(this: &JsPoint) -> f64;
}

impl From<JsPoint> for Point {
	fn from(point: JsPoint) -> Self {
		Point {
			x: point.x(),
			y: point.y(),
		}
	}
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum DoorState {
	CLOSED = 0,
	OPEN = 1,
	LOCKED = 2,
}

impl TryFrom<usize> for DoorState {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::CLOSED as usize => Ok(Self::CLOSED),
			x if x == Self::OPEN as usize => Ok(Self::OPEN),
			x if x == Self::LOCKED as usize => Ok(Self::LOCKED),
			_ => Err(()),
		}
	}
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum DoorType {
	NONE = 0,
	DOOR = 1,
	SECRET = 2,
}

impl TryFrom<usize> for DoorType {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::NONE as usize => Ok(Self::NONE),
			x if x == Self::DOOR as usize => Ok(Self::DOOR),
			x if x == Self::SECRET as usize => Ok(Self::SECRET),
			_ => Err(()),
		}
	}
}

#[wasm_bindgen]
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum WallSenseType {
	NONE = 0,
	LIMITED = 10,
	NORMAL = 20,
}

impl TryFrom<usize> for WallSenseType {
	type Error = ();
	fn try_from(value: usize) -> Result<Self, Self::Error> {
		match value {
			x if x == Self::NONE as usize => Ok(Self::NONE),
			x if x == Self::LIMITED as usize => Ok(Self::LIMITED),
			x if x == Self::NORMAL as usize => Ok(Self::NORMAL),
			_ => Err(()),
		}
	}
}

#[derive(Debug, Copy, Clone)]
pub struct WallHeight {
	pub top: f64,
	pub bottom: f64,
}

impl Default for WallHeight {
	fn default() -> Self {
		Self {
			top: f64::INFINITY,
			bottom: f64::NEG_INFINITY,
		}
	}
}

impl From<Option<JsWallHeight>> for WallHeight {
	fn from(height: Option<JsWallHeight>) -> Self {
		let height = height
			.map(|height| (height.top(), height.bottom()))
			.unwrap_or((None, None));
		let top = height.0.unwrap_or(WallHeight::default().top);
		let bottom = height.1.unwrap_or(WallHeight::default().bottom);
		Self { top, bottom }
	}
}

impl WallHeight {
	pub fn contains(&self, height: f64) -> bool {
		self.top >= height && self.bottom <= height
	}
}

#[derive(Debug, Clone, Copy)]
pub struct Wall {
	pub p1: Point,
	pub p2: Point,
	pub door_type: DoorType,
	pub door_state: DoorState,
	pub move_type: WallSenseType,
	pub height: WallHeight,
}

impl Wall {
	pub fn new(
		p1: Point,
		p2: Point,
		door_type: DoorType,
		door_state: DoorState,
		move_type: WallSenseType,
		height: WallHeight,
	) -> Self {
		Self {
			p1,
			p2,
			door_type,
			door_state,
			move_type,
			height,
		}
	}

	pub fn is_door(&self) -> bool {
		self.door_type != DoorType::NONE
	}

	pub fn is_open(&self) -> bool {
		self.door_state == DoorState::OPEN
	}
}

impl Wall {
	fn from_js(wall: &JsWall, enable_height: bool) -> Self {
		let document = wall.document();
		let mut c = document.c();
		c.iter_mut().for_each(|val| *val = val.round());
		let height = if enable_height {
			document.flags().wall_height().into()
		} else {
			WallHeight::default()
		};
		Self::new(
			Point::new(c[0], c[1]),
			Point::new(c[2], c[3]),
			document.door_type(),
			document.door_state(),
			document.move_type(),
			height,
		)
	}
}

#[wasm_bindgen]
pub struct JsGraph {
	#[wasm_bindgen(skip)]
	pub graph: Rc<RefCell<Graph>>,
}

impl From<Graph> for JsGraph {
	fn from(graph: Graph) -> Self {
		JsGraph {
			graph: Rc::new(RefCell::new(graph)),
		}
	}
}

#[wasm_bindgen]
pub struct JsPathfinder {
	#[wasm_bindgen(skip)]
	pub pathfinder: Pathfinder,
}

impl From<Pathfinder> for JsPathfinder {
	fn from(pathfinder: Pathfinder) -> Self {
		JsPathfinder { pathfinder }
	}
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=initializeGraph)]
pub fn initialize_graph(
	js_walls: Vec<JsValue>,
	token_size: f64,
	token_elevation: f64,
	enable_height: bool,
) -> JsGraph {
	let mut walls = Vec::with_capacity(js_walls.len());
	for wall in js_walls {
		let wall = JsWall::from(wall);
		walls.push(Wall::from_js(&wall, enable_height));
	}
	Graph::initialize(walls, token_size, token_elevation).into()
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=freeGraph)]
pub fn free_graph(js_graph: JsGraph) {
	drop(js_graph);
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=initializePathfinder)]
pub fn initialize_pathfinder(
	from: JsPoint,
	to: JsPoint,
	js_graph: &JsGraph,
	max_distance: f64,
) -> JsPathfinder {
	Pathfinder::initialize(from.into(), to.into(), js_graph.graph.clone(), max_distance).into()
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=resetPathfinder)]
pub fn reset_pathfinder(js_pathfinder: &mut JsPathfinder) {
	js_pathfinder.pathfinder.reset();
}

#[allow(dead_code)]
#[wasm_bindgen(js_name=dropPathfinder)]
pub fn free_pathfinder(js_pathfinder: JsPathfinder) {
	drop(js_pathfinder);
}

#[allow(dead_code)]
#[wasm_bindgen]
pub fn step(js_pathfinder: &mut JsPathfinder) -> JsValue {
	let pathfinder = &mut js_pathfinder.pathfinder;
	let result = pathfinder.step();
	let first_node = match result {
		PathfindingResult::Path(first_node) => first_node,
		PathfindingResult::Unfinished => return JsValue::UNDEFINED,
		PathfindingResult::NoPath => return JsValue::NULL,
	};
	let cost = first_node.estimated;
	let path = pathfinder.unroll_path(first_node);
	let path = path.into_iter().map(JsValue::from).collect::<Array>();
	let result = Object::default();
	Reflect::set(&result, &"cost".into(), &cost.into()).unwrap();
	Reflect::set(&result, &"path".into(), &path).unwrap();
	return result.into();
}
