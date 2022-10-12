use std::{
	cell::RefCell,
	hash::{Hash, Hasher},
	ops::Deref,
	rc::Rc,
};

pub struct Reference<T>(Rc<RefCell<T>>);

pub trait ReferenceTraits<T> {
	fn take_ownership(inner: T) -> Self;
}

impl<T> Deref for Reference<T> {
	type Target = Rc<RefCell<T>>;

	fn deref(&self) -> &Self::Target {
		&self.0
	}
}

impl<T> Clone for Reference<T> {
	fn clone(&self) -> Self {
		Self(self.0.clone())
	}
}

impl<T> From<T> for Reference<T> {
	fn from(inner: T) -> Self {
		Self(Rc::new(RefCell::new(inner)))
	}
}

impl<T> Hash for Reference<T> {
	fn hash<H: Hasher>(&self, state: &mut H) {
		Rc::as_ptr(&self).hash(state)
	}
}

impl<T> PartialEq for Reference<T> {
	fn eq(&self, other: &Self) -> bool {
		Rc::ptr_eq(&self, &other)
	}
}

impl<T> Eq for Reference<T> {}
