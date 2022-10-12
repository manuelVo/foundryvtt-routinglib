let pathfindingJobs;
let timeout;

export function initializeBackground() {
	// TODO pathfindingJobs would ideally be a ring buffer, but it likely doesn't matter much
	pathfindingJobs = [];
	timeout = null;
}

export function createAsyncPathfinder(pathfinder) {
	const job = {pathfinder};
	const promise = new Promise((resolve, reject) => {
		job.resolve = resolve;
		job.reject = reject;
	});
	job.promise = promise;
	pathfindingJobs.push(job);
	scheduleBackgroundTask();
	return promise;
}

export function cancelJob(promise) {
	for (const [i, job] of pathfindingJobs.entries()) {
		if (job.promise === promise) {
			job.pathfinder.free();
			pathfindingJobs.splice(i, 1);
			return true;
		}
	}
	return false;
}

export function resetJobs() {
	for (const job of pathfindingJobs) {
		job.pathfinder.reset();
	}
}

function scheduleBackgroundTask() {
	if (!timeout) {
		asyncPathfindingTask();
	}
}

// TODO This is currently a first come first serve scheduler - maybe a fair scheduler would be better so modules with long running requests don't block modules with short running requests wouldn't block other modules requests
function asyncPathfindingTask() {
	const NO_STEPS_PER_ITERATION = 20;
	const TIME_PER_TASK = 50;

	timeout = null;

	let currentJob = pathfindingJobs[0];
	let now = Date.now();
	let endTime = now + TIME_PER_TASK; // TODO Make this dependent on selected frame rate
	while (now < endTime && pathfindingJobs.length > 0) {
		let path = undefined;
		for (let i = 0; i < NO_STEPS_PER_ITERATION; i++) {
			try {
				path = currentJob.pathfinder.step();
			} catch (e) {
				currentJob.pathfinder.free();
				currentJob.reject(e);
				pathfindingJobs.shift();
				break;
			}
			if (path !== undefined) {
				break;
			}
		}
		if (path !== undefined) {
			if (path !== null) path = currentJob.pathfinder.postProcessResult(path);
			currentJob.pathfinder.free();
			currentJob.resolve(path);
			pathfindingJobs.shift();
			currentJob = pathfindingJobs[0];
		}
		now = Date.now();
	}
	if (pathfindingJobs.length > 0) {
		timeout = window.setTimeout(asyncPathfindingTask, 0);
	}
}
