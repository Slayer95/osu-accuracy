"use strict";

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const api = require('./api');

const util = require('./lib/util');
const Profiler = require('./lib/profiler');
const Splitter = require('./lib/stream-splitter');

const CACHE = require('./cache');

const {
	getBeatmapMetaLocalSync,
} = require('./internal/beatmaps');

http.globalAgent.keepAlive = true;
http.globalAgent.maxSockets = 32;
https.globalAgent.keepAlive = true;
https.globalAgent.maxSockets = 32;

async function getBeatmapMetaRemote(mapId) {
	const t = process.hrtime();
	const matches = await api.nodesu.client.beatmaps.getByBeatmapId(mapId);
	Profiler.log('osu_api', t);
	if (!matches.length) return null;
	return matches[0];
}

async function getBeatmapReadableRemote(mapId) {
	const href = `https://osu.ppy.sh/osu/${mapId}`;

	const t = process.hrtime();
	return new Promise((resolve, reject) => {
		https.get(href, res => resolve(res)).on('error', reject).setTimeout(1500);
	}).then(response => {
		Profiler.logSync('osu_network_rtt', t);
		return response.on('end', () => Profiler.log('osu_download', t));
	});
}

async function getBeatmapReadableLocal(mapId, metaData) {
	const {setId, artist, title, creator, version} = metaData;
	const folderName = util.sanitizePathName(`${setId} ${artist} - ${title}`, true);
	const fileName = util.sanitizePathName(`${artist} - ${title} (${creator}) [${version}]`, false) + '.osu';

	const t = process.hrtime();
	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(path.resolve(CACHE.fsSongsPath, folderName, fileName));
		readStream.on('open', () => resolve(readStream)).on('error', reject);
	}).then(readStream => {
		return readStream.on('end', () => Profiler.log('osu_fs_parser', t));
	});
}

async function getBeatmapReadable(mapId) {
	let metaData = null;
	if (CACHE.metadata.has(mapId)) {
		const [setId, artist, title, creator, version] = CACHE.metadata.get(mapId);
		metaData = {setId, artist, title, creator, version};
	} else {
		metaData = await getBeatmapMetaRemote(mapId);
		if (!metaData) {
			throw new Error(`Failed to fetch metadata for ${mapId}`);
		}

		CACHE.metadata.set(mapId, [metaData.setId, metaData.artist, metaData.title, metaData.creator, metaData.version]);
	}

	

	if (!CACHE.local_map_sets.has(metaData.setId)) {
		return getBeatmapReadableRemote(mapId);
	}

	try {
		return await getBeatmapReadableLocal(mapId, metaData);
	} catch (err) {
		// console.log(`MISS ${mapId} at /${folderName}/${fileName}`);
		return getBeatmapReadableRemote(mapId);
	}
}

async function getBeatmap(mapId) {
	const readable = await getBeatmapReadable(mapId);
	return new Promise((resolve, reject) => {
		const parser = new api.ojsama.parser();
		readable.pipe(new Splitter(Buffer.from('\n')))
			.on('data', line => parser.feed_line(line.toString('utf8')))
			.on('finish', () => resolve(parser.map))
			.on('error', reject);
	});
}

async function getModdedBeatmapMaxPP(playData) {
	const {mapId /* number */, mods} = playData;
	const cacheTag = `${mapId},${mods}`;

	if (CACHE.difficulties.has(cacheTag)) {
		return Promise.resolve(CACHE.difficulties.get(cacheTag));
	}

	const map = await getBeatmap(mapId);

	const moddedMap = new api.ojsama.diff().calc({map, mods});
	const ppParameters = api.ojsama.ppv2({stars: moddedMap});
	const maxPP = Math.round(ppParameters.total * 10) / 10;
	CACHE.difficulties.set(cacheTag, maxPP);
	return maxPP;
}

module.exports = {
	getReadable: getBeatmapReadable,
	get: getBeatmap,
	getModdedMaxPP: getModdedBeatmapMaxPP,
};
