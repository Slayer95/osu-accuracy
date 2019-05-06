"use strict";

const api = require('./api');
const parser = require('./difficulty-parser');
const util = require('./lib/util');

const CACHE = require('./cache');

async function getMaxPP(playData, algo) {
	const {mapId /* number */, mods /* number */} = playData; // eslint-disable-line object-curly-spacing
	const cacheTag = `${mapId},${mods}`;

	// Final result cache
	if (CACHE.difficulties.has(cacheTag)) {
		return CACHE.difficulties.get(cacheTag);
	}

	// Metadata cache
	let metaData = CACHE.getMetaData(mapId);
	if (!metaData) {
		metaData = await api.getBeatmapMeta(mapId);
		CACHE.setMetaData(mapId, metaData);
	}

	const result = api.ojsama.ppv2(util.nodesu2ojsamaBeatMap2Params(metaData, mods, algo));
	const maxPP = Math.round(result.total * 10) / 10;

	CACHE.difficulties.set(cacheTag, maxPP);
	return maxPP;
}

module.exports = {
	getMaxPP,
	parser,
};
