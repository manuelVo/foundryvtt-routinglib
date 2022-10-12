use std::f64::consts::PI;

use rustc_hash::FxHashMap;

use crate::{
	geometry::{LineSegment, Point},
	js_api::{Wall, WallSenseType},
};

pub struct Graph {
	pub nodes: Vec<Point>,
	pub edges: FxHashMap<Point, Vec<Edge>>,
	pub walls: Vec<LineSegment>,
}

impl Graph {
	pub fn initialize<I>(walls: I, token_size: f64, token_elevation: f64) -> Self
	where
		I: IntoIterator<Item = Wall>,
	{
		let distance_from_walls = token_size / 2.0;
		let mut endpoints = FxHashMap::<Point, Vec<f64>>::default();
		let mut line_segments = Vec::new();
		for wall in walls {
			if wall.move_type == WallSenseType::NONE {
				continue;
			}
			if wall.is_door() && wall.is_open() {
				continue;
			}
			if !wall.height.contains(token_elevation) {
				continue;
			}
			let x_diff = wall.p2.x - wall.p1.x;
			let y_diff = wall.p2.y - wall.p1.y;
			let p1_angle = y_diff.atan2(x_diff).rem_euclid(2.0 * PI);
			let p2_angle = (p1_angle + PI).rem_euclid(2.0 * PI);
			for (point, angle) in [(wall.p1, p1_angle), (wall.p2, p2_angle)] {
				let angles = endpoints.entry(point).or_insert_with(Vec::new);
				angles.push(angle);
			}
			line_segments.push(LineSegment::new(wall.p1, wall.p2));
		}
		endpoints
			.values_mut()
			.for_each(|angles| angles.sort_by(|a, b| a.partial_cmp(b).unwrap()));
		let mut nodes = vec![];
		for (point, angles) in endpoints {
			assert!(!angles.is_empty());
			for i in 1..angles.len() {
				let angle1 = angles[i - 1];
				let angle2 = angles[i];
				if angle1 == angle2 {
					continue;
				}
				let angle_diff = angle2 - angle1;
				if angle_diff <= PI {
					continue;
				}
				let angle_between = angle_diff / 2.0 + angle1;
				nodes.push(calc_pathfinding_node(
					point,
					angle_between,
					distance_from_walls,
					&mut line_segments,
				));
				nodes.push(calc_pathfinding_node(
					point,
					angle1 + 0.5 * PI,
					distance_from_walls,
					&mut line_segments,
				));
				nodes.push(calc_pathfinding_node(
					point,
					angle2 - 0.5 * PI,
					distance_from_walls,
					&mut line_segments,
				));
			}
			let angle1 = angles.last().unwrap();
			let angle2 = angles.first().unwrap() + 2.0 * PI;
			let angle_diff = angle2 - angle1;
			if angle_diff <= PI {
				continue;
			}
			let angle_between = angle_diff / 2.0 + angle1;
			nodes.push(calc_pathfinding_node(
				point,
				angle_between,
				distance_from_walls,
				&mut line_segments,
			));
			nodes.push(calc_pathfinding_node(
				point,
				angle1 + 0.5 * PI,
				distance_from_walls,
				&mut line_segments,
			));
			nodes.push(calc_pathfinding_node(
				point,
				angle2 - 0.5 * PI,
				distance_from_walls,
				&mut line_segments,
			));
		}
		// TODO Eliminating nodes close to each other may improve performance
		Self {
			nodes,
			edges: FxHashMap::default(),
			walls: line_segments,
		}
	}
}

#[derive(Clone, Copy)]
pub struct Edge {
	pub target: Point,
	pub cost: f64,
}

fn calc_pathfinding_node(
	p: Point,
	angle: f64,
	distance_from_walls: f64,
	line_segments: &mut Vec<LineSegment>,
) -> Point {
	let offset_x = angle.cos() * distance_from_walls;
	let offset_y = angle.sin() * distance_from_walls;
	line_segments.push(LineSegment::new(
		p,
		Point {
			x: p.x + offset_x * 0.99,
			y: p.y + offset_y * 0.99,
		},
	));
	Point {
		x: p.x + offset_x,
		y: p.y + offset_y,
	}
}
