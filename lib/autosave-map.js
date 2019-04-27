"use strict";

const fs = require('fs');
const Profiler = require('./profiler');

const SAVE_MAP_STATUS = {
	IDLE: 0,
	TICK: 1,
	ACTIVE: 2,
	QUEUED: 3,
};

class AutoSaveMap extends Map {
	constructor(iterable, path) {
		super(iterable);
		this.path = path;
		this.status = SAVE_MAP_STATUS.IDLE;
	}

	set(key, value) {
		super.set(key, value);
		this.save();
	}

	save() {
		switch (this.status) {
		case SAVE_MAP_STATUS.QUEUED:
		case SAVE_MAP_STATUS.TICK:
			// no-op
			break;
		case SAVE_MAP_STATUS.ACTIVE:
			this.status = SAVE_MAP_STATUS.QUEUED;
			break;
		case SAVE_MAP_STATUS.IDLE:
			this.status = SAVE_MAP_STATUS.TICK;
			process.nextTick(() => this.doSave());
		}
	}

	doSave() {
		this.status = SAVE_MAP_STATUS.ACTIVE;

		const t = process.hrtime();
		const content = JSON.stringify(this);
		Profiler.logSync('cache_serialization', t);

		fs.writeFile(`${this.path}.0`, content, err => {
			if (err) throw err;
			fs.rename(`${this.path}.0`, this.path, err2 => {
				if (err2) throw err2;
				if (this.status === SAVE_MAP_STATUS.QUEUED) {
					setImmediate(() => this.doSave());
				} else {
					this.status = SAVE_MAP_STATUS.IDLE;
				}
			});
		});
	}

	toJSON() {
		return Array.from(this);
	}
}

module.exports = AutoSaveMap;
