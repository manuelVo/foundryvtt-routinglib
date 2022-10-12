use crate::geometry::Point;

#[derive(Debug, Clone, Copy)]
pub struct DiscoveredNode {
	pub point: Point,
	pub cost: f64,
	pub estimated: f64,
	pub previous: Option<Point>,
}

pub struct NextNodeQueue {
	// TODO Using a RED-BLACK tree plus a hash map (one for nodes-by-distance, one for nodes-by-id) might be faster than going over the entire list every time
	nodes: Vec<DiscoveredNode>,
}

impl NextNodeQueue {
	pub fn new() -> Self {
		Self { nodes: vec![] }
	}

	pub fn is_empty(&self) -> bool {
		self.nodes.is_empty()
	}

	pub fn pop(&mut self) -> Option<DiscoveredNode> {
		let node = self.nodes.pop();
		node
	}

	pub fn insert(&mut self, node: DiscoveredNode) {
		let mut insert_location = None;
		for i in 0..self.nodes.len() {
			if self.nodes[i].point == node.point {
				if node.cost < self.nodes[i].cost {
					self.nodes[i] = node;
					let start = i;
					let end = self.nodes[(start + 1)..]
						.iter()
						.position(|entry| entry.estimated <= node.estimated)
						.map_or_else(|| self.nodes.len(), |pos| pos + start + 1);
					self.nodes[start..end].rotate_left(1);
				}
				return;
			}
			if node.estimated > self.nodes[i].estimated {
				if insert_location.is_none() {
					insert_location = Some(i);
				}
			}
		}
		let insert_location = insert_location.unwrap_or(self.nodes.len());
		self.nodes.insert(insert_location, node.into());
	}

	pub fn clear(&mut self) {
		self.nodes.clear();
	}
}
