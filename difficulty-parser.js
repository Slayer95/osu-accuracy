"use strict";

const fs = require('fs');
const https = require('https');
const path = require('path');

const api = require('./api');
const util = require('./lib/util');

const CACHE = require('./cache');
const Profiler = require('./lib/profiler');
const Splitter = require('./lib/stream-splitter');

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
	if (!CACHE.fsSongsPath) {
		return getBeatmapReadableRemote(mapId);
	}

	let metaData = CACHE.getMetaData(mapId);
	if (!metaData) {
		metaData = await api.getBeatmapMeta(mapId);
		if (!metaData) {
			throw new Error(`Failed to fetch metadata for ${mapId}`);
		}
		CACHE.setMetaData(mapId, metaData);
	}

	if (!CACHE.local_map_sets.has(metaData.setId)) {
		return getBeatmapReadableRemote(mapId);
	}

	try {
		return await getBeatmapReadableLocal(mapId, metaData);
	} catch (err) {
		Profiler.logSync('osu_fs_parser_miss');
		return getBeatmapReadableRemote(mapId);
	}
}

async function getBeatmap(mapId, metaData, forceLocal) {
	let readable;
	if (forceLocal) {
		readable = await getBeatmapReadableLocal(mapId, metaData);
	} else {
		readable = await getBeatmapReadable(mapId);
	}
	return new Promise((resolve, reject) => {
		const parser = new api.ojsama.parser();
		readable.pipe(new Splitter(Buffer.from('\n')))
			.on('data', line => parser.feed_line(line.toString('utf8')))
			.on('finish', () => resolve(parser.map))
			.on('error', reject);
	});
}

async function getMaxPPInner(playData, algo) {
	const {mapId /* number */, mods /* number */} = playData; // eslint-disable-line object-curly-spacing
	const map = await getBeatmap(mapId);
	const diff = new api.ojsama.diff().calc({map, mods});
	const params = util.ojsamaDiff2Params(diff, algo);
	//const result_diff = api.ojsama.ppv2({stars: diff, score_version: algo || 1});
	const result_params = api.ojsama.ppv2(params);
	//assert.deepStrictEqual(result_diff, result_params, `Bad ojsamaDiff2Params: ${result_diff} !== ${result_params} (${JSON.stringify(diff)} !== ${JSON.stringify(params)})`);
	return Math.round(result_params.total * 10) / 10;
}

async function getMaxPP(playData, algo, ignoreCache = true) {
	const {mapId /* number */, mods /* number */} = playData; // eslint-disable-line object-curly-spacing
	const cacheTag = `${mapId},${mods}`;

	if (!ignoreCache && CACHE.difficulties.has(cacheTag)) {
		return CACHE.difficulties.get(cacheTag);
	}

	const maxPP = await getMaxPPInner(playData, algo);
	if (!ignoreCache) {
		CACHE.difficulties.set(cacheTag, maxPP);
	}
	return maxPP;
}

getBeatmapReadable.local = getBeatmapReadableLocal;
getBeatmapReadable.remote = getBeatmapReadableRemote;

module.exports = {
	getBeatmap,
	getBeatmapReadable,
	getMaxPP,
	getMaxPPInner,
};
