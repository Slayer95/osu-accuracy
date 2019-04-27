"use strict";

const {modbits: ojsamaMods} = require('ojsama');
const {Mods: nodesuMods} = require('nodesu');

const modCodeMap_nodesu2ojsama = new Map([
	[nodesuMods.NoFail, ojsamaMods.nf],
	[nodesuMods.Easy, ojsamaMods.ez],
	[nodesuMods.Hidden, ojsamaMods.hd],
	[nodesuMods.HardRock, ojsamaMods.hr],
	[nodesuMods.DoubleTime, ojsamaMods.dt],
	[nodesuMods.HalfTime, ojsamaMods.ht],
	[nodesuMods.Nightcore, ojsamaMods.nc],
	[nodesuMods.Flashlight, ojsamaMods.fl],
	[nodesuMods.SpunOut, ojsamaMods.so],
]);

function padString(str, size) {
	return `${str}${' '.repeat(Math.max(0, size - str.length))}`;
}

function toPercent(num) {
	return `${(num * 100).toFixed(2)}%`;
}

function getAccuracy(playData) {
	const {count300, count100, count50, countMiss} = playData;
	const maxRawScore = 300 * (count300 + count100 + count50 + countMiss);
	return (count300 * 300 + count100 * 100 + count50 * 50) / maxRawScore;
}

function sanitizePathName(pathName, isFolder) {
	if (isFolder) {
		// I don't think osu! is consistent in its sanitization across versions
		pathName = pathName.replace(/[\\?"<>|]+/g, '_');
		pathName = pathName.replace(/[.*:/]+/g, '');
	} else {
		pathName = pathName.replace(/[\\/:*?"<>|]+/g, '');
	}
	return pathName;
}

function nodesu2ojsamaMods(input) {
	let output = 0;
	for (const [nodesuBit, ojsamaBit] of modCodeMap_nodesu2ojsama) {
		if (input & nodesuBit) {
			output |= ojsamaBit;
		}
	}
	return output;
}

function nodesu2ojsamaScore(playData) {
	return {
		mapId: playData.beatmapId,
		mods: nodesu2ojsamaMods(playData.enabledMods),
	};
}

module.exports = {
	padString,
	toPercent,
	getAccuracy,
	sanitizePathName,
	nodesu2ojsamaScore,
};
