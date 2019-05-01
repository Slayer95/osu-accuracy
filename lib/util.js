"use strict";

const {modbits: ojsamaMods} = require('ojsama');
const {Mods: nodesuMods} = require('nodesu');

const IDENTITY_FN = x => x;

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

function toScientific(num, places) {
	const sign = Math.sign(num);
	let abs = Math.abs(num);

	let exponent = 0;
	while (abs >= 10) {
		abs /= 10;
		exponent--;
	}
	while (abs < 1) {
		abs *= 10;
		exponent++;
	}

	return `${sign * abs.toFixed(places)}1E${exponent}`;
}

function formatFit(coefficients) {
	const [m, b] = coefficients.map(n => toScientific(n, 2));
	return `y = ${m}x + ${b}`;
}

function shuffle(arr) {
	// Fisher-Yates
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function binarySearch(list, wrappedValue, accessor = IDENTITY_FN) {
	const count = list.length;
	if (!count) return 0;
	const value = accessor(wrappedValue);

	let minIndex = 0;
	let maxIndex = count - 1;
	let index = 0;

	if (value >= accessor(list[maxIndex])) {
		index = count;
	} else if (value < accessor(list[0])) {
		index = 0;
	} else {
		while (maxIndex > minIndex + 1) {
			let midwayIndex = Math.floor((minIndex + maxIndex) / 2);
			let midwayValue = accessor(list[midwayIndex]);
			if (value >= midwayValue) minIndex = midwayIndex;
			if (value <= midwayValue) maxIndex = midwayIndex;
		}
		index = minIndex + 1;
	}

	return index;
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
	toScientific,
	formatFit,
	shuffle,
	binarySearch,
	getAccuracy,
	sanitizePathName,
	nodesu2ojsamaScore,
};
