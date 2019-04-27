"use strict";

const util = require('./util');

function sumdt(dt1, dt2) {
	return [dt1[0] + dt2[0], dt1[1] + dt2[1]];
}

function getdt(t1, t2) {
	return [t2[0] - t1[0], t2[1] - t1[1]];
}

const LIMITED_EVENTS = new Map([
	['osu_network_rtt', 4],
]);

class ActionLog {
	constructor() {
		this.counters = new Map();
		this.times = new Map();

		this.parallelQueued = null;
	}

	setParallel(value) {
		const queued = this.parallelQueued;
		if (queued && !value) {
			for (const [key, {count, startTime, endTime}] of queued) {
				try {
					if (!this.counters.has(key)) {
						this.counters.set(key, count);
						this.times.set(key, getdt(startTime, endTime));
					} else {
						const prevCount = this.counters.get(key);
						this.counters.set(key, prevCount + count);
						if (!LIMITED_EVENTS.has(key) || prevCount + count <= LIMITED_EVENTS.get(key)) {
							this.times.set(key, sumdt(this.times.get(key), getdt(startTime, endTime)));
						} else if (prevCount <= LIMITED_EVENTS.get(key)) {
							LIMITED_EVENTS.set(key, prevCount);
						}
					}
				} catch (err) {
					console.error(`Bad key: ${key}`);
					console.error(err.stack);
				}
			}
		}
		this.parallelQueued = value ? new Map() : null;
	}

	logN(key, nEvents, t0, forceSync) {
		nEvents = ~~nEvents;
		if (nEvents <= 0) return;

		if (this.parallelQueued && !forceSync) {
			const t1 = process.hrtime();

			key = `${key}_parallel`;
			if (!this.parallelQueued.has(key)) {
				this.parallelQueued.set(key, {count: 0, startTime: t0, endTime: null});
			}
			const entry = this.parallelQueued.get(key);
			entry.count += nEvents;
			entry.endTime = t1;
		} else {
			const dt = t0 ? process.hrtime(t0) : null;

			if (!this.counters.has(key)) {
				this.counters.set(key, nEvents);
				this.times.set(key, dt);
				return this;
			}

			const prevCount = this.counters.get(key);
			this.counters.set(key, prevCount + nEvents);
			if (!LIMITED_EVENTS.has(key) || prevCount + nEvents <= LIMITED_EVENTS.get(key)) {
				this.times.set(key, dt ? sumdt(this.times.get(key), dt) : null);
			} else if (prevCount <= LIMITED_EVENTS.get(key)) {
				LIMITED_EVENTS.set(key, prevCount);
			}
		}
	}

	log(key, t0) {
		if (!t0 && this.parallelQueued) {
			throw new Error(`Profiler in parallel mode: Use logSync() if not timing`);
		}
		return this.logN(key, 1, t0, false);
	}

	logSync(key, t0) {
		return this.logN(key, 1, t0, true);
	}

	logTime(key, dt) {
		this.times.set(key, dt);
	}

	getTime(key) {
		if (!this.times.has(key)) {
			throw new Error(`key ${key} not found`);
		}

		const dt = this.times.get(key);
		if (!dt || LIMITED_EVENTS.has(key)) return null;

		return (dt[0] * 1E3 + dt[1] / 1E6); // ms
	}

	getAverageTime(key) {
		if (!this.counters.has(key) || !this.times.has(key)) {
			throw new Error(`key ${key} not found`);
		}

		const count = this.counters.get(key);
		const dt = this.times.get(key);
		if (!dt) return null;

		return (dt[0] * 1E3 + dt[1] / 1E6) / (LIMITED_EVENTS.has(key) ? Math.min(count, LIMITED_EVENTS.get(key)) : count); // ms
	}

	toString() {
		const cellWidths = [25, 6, 10, 10];
		const contents = [];
		for (const key of this.counters.keys()) {
			const timesRaw = [this.getTime(key), this.getAverageTime(key)];
			const timesFormatted = timesRaw.map(x => x === null ? `N/A` : `${x.toFixed(2)}ms`);
			if (key.length > cellWidths[0]) cellWidths[0] = key.length;
			if (timesFormatted[0].length > cellWidths[2]) cellWidths[2] = timesFormatted[0].length;
			if (timesFormatted[1].length > cellWidths[3]) cellWidths[3] = timesFormatted[1].length;
			contents.push([key, this.counters.get(key), ...timesFormatted]);
		}

		const formatCell = (cell, index) => util.padString(` ${cell}`, cellWidths[index] + 1); // +1 to compensate left padding
		const formatRow = row => row.map(formatCell).join(`|`);
		const headers = [`Action`, `Count`, `Time`, `Average`];

		const output = [];
		output.push(formatRow(headers));
		output.push(Array.from({length: 4}, (_, index) => '-'.repeat(cellWidths[index] + 1)).join(`|`));
		for (const row of contents) {
			output.push(formatRow(row));
		}
		return output.join(`\n`);
	}
}

const Profiler = new ActionLog();

module.exports = Profiler;
