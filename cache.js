"use strict";

const fs = require('fs');
const path = require('path');

const AutoSaveMap = require('./lib/autosave-map');
const Profiler = require('./lib/profiler');

const CACHE = {
	start: startCache,
	fsSongsPath: '',
	dbPath: '',

	local_map_sets: new Set(),
	metadata: new Map(),
	difficulties: new Map(),
};

const CACHE_PATHS = {
	metadata: path.resolve(__dirname, '.osu-map-metadata.json'),
	difficulties: path.resolve(__dirname, '.osu-map-diffs.json'),
	mtime: path.resolve(__dirname, '.osu-db-mtime.txt'),
};

const {
	getBeatmapMetaLocalSync,
} = require('./internal/beatmaps');

function initPaths() {
	let songFolders;
	if (process.env.OSU_PATH) {
		const songsPath = path.resolve(process.env.OSU_PATH, 'Songs');
		songFolders = fs.readdirSync(songsPath).filter(folderName => (
			/^\d$/.test(folderName.charAt(0)) &&
			!/ \(\d+\)$/.test(folderName)
		));

		CACHE.local_map_sets = new Set(songFolders.map(folderName => Number(folderName.split(' ', 1)[0])));
		CACHE.fsSongsPath = songsPath;
		CACHE.dbPath = path.resolve(process.env.OSU_PATH, 'osu!.db');
	} else {
		console.error(`WARNING: %OSU_PATH% not set, performance will drop`);
	}
	return songFolders;
}

function initDifficulties() {
	let difficultyJSON;
	try {
		difficultyJSON = JSON.parse(fs.readFileSync(CACHE_PATHS.difficulties, 'utf8'));
	} catch (err) {
		difficultyJSON = [];
	}

	CACHE.difficulties = new AutoSaveMap(difficultyJSON, CACHE_PATHS.difficulties);
}

function initMetadata() {
	let metadataJSON;
	try {
		metadataJSON = JSON.parse(fs.readFileSync(CACHE_PATHS.metadata, 'utf8'));
	} catch (err) {
		metadataJSON = [];
	}

	CACHE.metadata = new AutoSaveMap(metadataJSON, CACHE_PATHS.metadata);
}

function checkPopulateMetadata() {
	const prevMTime = (() => {
		try {
			return +fs.readFileSync(CACHE_PATHS.mtime, 'utf8');
		} catch (err) {
			return 0;
		}
	})();
	const mtime = (() => {
		try {
			return fs.statSync(CACHE.dbPath).mtimeMs;
		} catch (err) {
			return -1;
		}
	})();

	if (mtime > prevMTime) {
		return mtime;
	}

	return 0;
}

function populateMetadata(songFolders) {
	for (const folderName of songFolders) {
		const setId = Number(folderName.split(' ', 1)[0]);
		if (setId < 60000) continue; // TODO: Figure out a better estimate for release of osu file format v10

		for (const fileName of fs.readdirSync(path.resolve(CACHE.fsSongsPath, folderName))) {
			if (!fileName.endsWith('.osu')) continue;

			const metaData = getBeatmapMetaLocalSync(path.resolve(CACHE.fsSongsPath, folderName, fileName));
			if (!metaData) {
				// Non-issue so long as it happens with less than 1% frequency.
				Profiler.log('cache_metadata_failure');
				return;
			}

			const mapId = metaData[0];
			metaData[0] = setId;

			CACHE.metadata.set(mapId, metaData);
		}
	}
}

function startCache() {
	let t = process.hrtime();

	const songFolders = initPaths();
	initDifficulties();
	initMetadata();

	Profiler.log('cache_load', t);

	if (songFolders) {
		const mtime = checkPopulateMetadata();
		if (mtime) {
			t = process.hrtime();
			populateMetadata(songFolders);
			fs.writeFileSync(CACHE_PATHS.mtime, `${mtime}`);
			Profiler.log('cache_populate', t);
		}
	}
}

module.exports = CACHE;
