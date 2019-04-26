"use strict";

const fs = require('fs');
const path = require('path');

const SAVE_MAP_STATUS = {
	IDLE: 0,
	ACTIVE: 1,
	QUEUED: 2,
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
			break;
		case SAVE_MAP_STATUS.ACTIVE:
			this.status = SAVE_MAP_STATUS.QUEUED;
			break;
		case SAVE_MAP_STATUS.IDLE:
			// this.status = SAVE_MAP_STATUS.ACTIVE;
			this.doSave();
		}
	}

	doSave() {
		this.status = SAVE_MAP_STATUS.ACTIVE;
		fs.writeFile(`${this.path}.0`, JSON.stringify(this), err => {
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

const CACHE = {
	start: startCache,
	fsSongsPath: '',
	files: new Set(),
	difficulties: new Map(),
};

function startCache() {
	if (process.env.OSU_PATH) {
		const songsPath = path.resolve(process.env.OSU_PATH, 'Songs');
		const fileList = fs.readdirSync(songsPath).filter(folderName => (
			/^\d$/.test(folderName.charAt(0)) &&
			!/ \(\d+\)$/.test(folderName)
		));

		CACHE.fsSongsPath = songsPath;
		CACHE.files = new Set(fileList.map(folderName => Number(folderName.split(' ', 1)[0])));
	}

	const difficultyCachePath = path.resolve(__dirname, '.osu-diffs.json');

	let difficultyJSON;
	try {
		difficultyJSON = JSON.parse(fs.readFileSync(difficultyCachePath, 'utf8'));
	} catch (err) {
		difficultyJSON = [];
	}

	CACHE.difficulties = new AutoSaveMap(difficultyJSON, difficultyCachePath);
}

module.exports = CACHE;
