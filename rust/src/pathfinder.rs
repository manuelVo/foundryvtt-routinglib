use std::{cell::RefCell, rc::Rc};

use rustc_hash::{FxHashMap, FxHashSet};

use crate::{
	geometry::{LineSegment, Point},
	graph::{Edge, Graph},
	next_node_queue::{DiscoveredNode, NextNodeQueue},
};

pub enum PathfindingResult {
	Unfinished,
	Path(DiscoveredNode),
	NoPath,
}

pub struct Pathfinder {
	graph: Rc<RefCell<Graph>>,
	edges: FxHashMap<Point, Vec<Edge>>,
	from: Point,
	to: Point,
	max_distance: f64,
	next_nodes: NextNodeQueue,
	previous_nodes: FxHashSet<Point>,
	discovered_nodes: FxHashMap<Point, DiscoveredNode>,
}

impl Pathfinder {
	pub fn initialize(
		from: Point,
		to: Point,
		graph: Rc<RefCell<Graph>>,
		max_distance: f64,
	) -> Self {
		let mut pathfinder = Self {
			graph,
			edges: FxHashMap::default(),
			from,
			to,
			max_distance,
			next_nodes: NextNodeQueue::new(),
			previous_nodes: FxHashSet::default(),
			discovered_nodes: FxHashMap::default(),
		};

		pathfinder.reset();

		pathfinder
	}

	pub fn reset(&mut self) {
		self.edges.clear();
		self.next_nodes.clear();
		self.previous_nodes.clear();
		self.discovered_nodes.clear();

		self.initialize_edges(self.from);
		let from_node = DiscoveredNode {
			point: self.from,
			cost: 0.0,
			estimated: self.from.distance_to(self.to),
			previous: None,
		};
		self.next_nodes.insert(from_node);
	}

	pub fn step(&mut self) -> PathfindingResult {
		if self.next_nodes.is_empty() {
			return PathfindingResult::NoPath;
		}
		// Get node with cheapest estimate
		let current_node = self.next_nodes.pop().unwrap();

		if current_node.cost > self.max_distance {
			return PathfindingResult::NoPath;
		}

		if current_node.point == self.to {
			return PathfindingResult::Path(current_node);
		}

		self.previous_nodes.insert(current_node.point);
		self.discovered_nodes
			.insert(current_node.point, current_node);

		for edge in self.edges.get(&current_node.point).unwrap().to_owned() {
			let neighbor = edge.target;
			if self.previous_nodes.contains(&neighbor) {
				continue;
			}
			self.initialize_edges(neighbor);

			// Add a flat 0.00001 cost per node to discurage creation of unnecessary waypoints
			let cost = current_node.cost + edge.cost + 0.00001;
			let discovered_neighbor = DiscoveredNode {
				point: neighbor,
				cost,
				estimated: cost + neighbor.distance_to(self.to),
				previous: Some(current_node.point),
			};
			self.next_nodes.insert(discovered_neighbor);
		}
		PathfindingResult::Unfinished
	}

	fn initialize_edges(&mut self, node: Point) {
		self.edges.entry(node).or_insert_with(|| {
			let mut graph = self.graph.borrow_mut();
			let mut edges = graph
				.edges
				.get(&node)
				.map(|edges| edges.to_owned())
				.unwrap_or_else(|| {
					let walls = &graph.walls;
					let edges = graph
						.nodes
						.iter()
						.filter(|point| Self::points_connected(node, **point, walls))
						.map(|point| Edge {
							target: *point,
							cost: node.distance_to(*point),
						})
						.collect::<Vec<_>>();
					// If node is 'from', don't insert it into "graph". Otherwise the graph will grow endlessly over time
					if node != self.from {
						graph.edges.insert(node, edges.clone());
					}
					edges
				});
			if Self::points_connected(node, self.to, &graph.walls) {
				edges.push(Edge {
					target: self.to,
					cost: node.distance_to(self.to),
				});
			}
			edges
		});
	}

	// TODO This could be a iterator to reduce the number of copy operations
	pub fn unroll_path(&self, first_node: DiscoveredNode) -> Vec<Point> {
		let mut path = vec![first_node.point];
		let mut current_node = first_node;
		while let Some(node) = current_node.previous {
			current_node = *self.discovered_nodes.get(&node).unwrap();
			path.push(current_node.point);
		}
		path.reverse();
		path
	}

	fn points_connected(p1: Point, p2: Point, walls: &[LineSegment]) -> bool {
		!Self::collides_with_any_wall(&LineSegment::new(p1, p2), walls)
	}

	fn collides_with_any_wall(line: &LineSegment, walls: &[LineSegment]) -> bool {
		// TODO Directional walls
		walls
			.iter()
			.any(|wall| Self::collides_with_wall(line, wall))
	}

	fn collides_with_wall(line: &LineSegment, wall: &LineSegment) -> bool {
		if !line.bounding_rect().intersects(&wall.bounding_rect()) {
			return false;
		}
		line.intersection(wall).is_some()
	}
}
