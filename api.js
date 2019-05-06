"use strict";

const fs = require('fs');
const https = require('https');
const path = require('path');
const nodesu = require('nodesu');
const ojsama = require('ojsama');

const Profiler = require('./lib/profiler');
const util = require('./lib/util');

https.globalAgent.keepAlive = true;
https.globalAgent.maxSockets = 8;

const API_KEY = (() => {
	try {
		return fs.readFileSync(path.resolve(__dirname, '.osu-api-key.txt'), 'utf8').trim();
	} catch (err) {
		throw new Error(`API key not found (.osu-api-key.txt)`);
	}
})();

const client = new nodesu.Client(API_KEY, {
	parseData: false,
});

const constants = {
	MODE: nodesu.Mode,
	LOOKUP_TYPE: nodesu.LookupType,
	MODS: nodesu.Mods,
};

async function getBeatmapMeta(mapId) {
	const t = process.hrtime();
	const matches = await client.beatmaps.getByBeatmapId(mapId);
	Profiler.log('osu_api', t);
	if (!matches.length) return null;
	const entry = matches[0];

	return {
		beatmapId: util.safeNumber(entry.beatmap_id),
		setId: util.safeNumber(entry.beatmapset_id),
		artist: util.safeString(entry.artist),
		title: util.safeString(entry.title),
		creator: util.safeString(entry.creator),
		version: util.safeString(entry.version),

		maxCombo: util.safeNumber(entry.max_combo),
		diffApproach: util.safeNumber(entry.diff_approach),
		diffOverall: util.safeNumber(entry.diff_overall),
		diffAim: util.round(util.safeNumber(entry.diff_aim), 2),
		diffSpeed: util.round(util.safeNumber(entry.diff_speed), 2),
		diffStrain: util.safeNumber(entry.diff_strain),
		diffRating: util.safeNumber(entry.difficultyrating),
	};
}

async function getUser(userName) {
	const user = await client.user.get(userName, constants.MODE.osu, 0, constants.LOOKUP_TYPE.string);
	return {
		ppRaw: util.safeNumber(user.pp_raw),
		accuracy: util.safeNumber(user.accuracy),
		level: util.safeNumber(user.level),
	};
}

async function getUserBest(userName) {
	const topScores = await client.user.getBest(userName, constants.MODE.osu, 100, constants.LOOKUP_TYPE.string);
	return topScores.map(data => ({
		beatmapId: util.safeNumber(data.beatmap_id),
		count300: util.safeNumber(data.count300),
		count100: util.safeNumber(data.count100),
		count50: util.safeNumber(data.count50),
		countMiss: util.safeNumber(data.countmiss),
	}));
}

module.exports = {
	nodesu: {client, constants},
	ojsama: ojsama,

	getBeatmapMeta,
	getUser,
	getUserBest,
};
