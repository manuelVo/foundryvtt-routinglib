mod geometry;
mod graph;
#[macro_use]
mod js_api;
mod next_node_queue;
mod pathfinder;

use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn main() {
	std::panic::set_hook(Box::new(console_error_panic_hook::hook));
}
