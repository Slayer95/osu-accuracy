"use strict";

const fs = require('fs');
const https = require('https');
const path = require('path');
const url = require('url');

const api = require('./api');
const util = require('./util');

const Splitter = require('./stream-splitter');
const CACHE = require('./cache');

async function getBeatmapReadableRemote(mapId) {
	const href = `https://osu.ppy.sh/osu/${mapId}`;
	return new Promise((resolve, reject) => {
		https.get(href, res => resolve(res)).on('error', reject).setTimeout(1500);
	});
}

async function getBeatmapMetaRemote(mapId) {
	const matches = await api.nodesu.client.beatmaps.getByBeatmapId(mapId);
	if (!matches.length) return null;
	return matches[0];
}

async function getBeatmapReadable(mapId) {
	const {setId, artist, title, creator, version} = await getBeatmapMetaRemote(mapId);
	if (!CACHE.files.has(setId)) {
		return getBeatmapReadableRemote(mapId);
	}

	const parenIndex = title.lastIndexOf('(');
	const folderName = util.sanitizePathName(`${setId} ${artist} - ${title}`, true);
	const fileName = util.sanitizePathName(`${artist} - ${title} (${creator}) [${version}]`, false) + '.osu';
	return new Promise((resolve, reject) => {
		const readStream = fs.createReadStream(path.resolve(CACHE.fsSongsPath, folderName, fileName));
		readStream.on('open', () => resolve(readStream)).on('error', () => {
			// console.log(`MISS ${mapId} at /${folderName}/${fileName}`);
			resolve(getBeatmapReadableRemote(mapId));
		});
	});
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
	const {mapId /* number */, mods /* number */} = playData;
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
