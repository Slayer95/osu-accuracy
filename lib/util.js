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

function term(t) {
	if (t.startsWith('-')) return `- ${t.slice(1)}`;
	return `+ ${t}`;
}

function round(num, places = 0) {
	const factor = 10 ** places;
	return Math.round(num * factor) / factor;
}

function scalePercent(num) {
	return num * 100;
}

function toPercent(num) {
	return `${round(scalePercent(num), 2)}%`;
}

function toScientific(num, places) {
	const sign = Math.sign(num);
	let abs = Math.abs(num);
	if (!abs) return ``;

	let exponent = 0;
	while (abs >= 10) {
		abs /= 10;
		exponent++;
	}
	while (abs < 1) {
		abs *= 10;
		exponent--;
	}

	if (exponent === 0) return `${sign * abs.toFixed(places)}`;
	return `${sign * abs.toFixed(places)}1E${exponent}`;
}

function errorPercents(center, dispersion) {
	return `${center.slice(0, -1)}(${dispersion.slice(0, -1)})%`;
}

function formatFit(c, options, format) {
	const r2 = options.correlation2 ? ` (${options.correlation2[0]}=${options.correlation2[1].toFixed(2)})` : ``;
	const [m, b] = [toScientific(c[0], 2), toPercent(c[1])];
	const [x0, y0] = [options.element[0].toFixed(2), toPercent(options.element[1])];
	const s = toPercent(options.s);

	if (!m) return `y = ${errorPercents(b, s)}${r2}`;
	switch (format) {
	case 'slope-intercept':
		return `y = ${errorPercents(b, s)} ${term(m)}x${r2}`;
	default:
		return `y = ${errorPercents(y0, s)} ${term(m)}(x - ${x0})${r2}`;
	}
}

function shuffle(arr) {
	// Fisher-Yates
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function getTuples(vectorX, vectorY) {
	const count = Math.min(vectorX.length, vectorY.length);
	const tuples = [];
	for (let i = 0; i < count; i++) {
		tuples.push([vectorX[i], vectorY[i]]);
	}
	return tuples;
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

function getTimestamp(date = new Date()) {
	const parts = date.toLocaleString().split(' ');
	return parts[parts.length - 1];
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
	round,
	padString,
	scalePercent,
	toPercent,
	toScientific,
	formatFit,
	shuffle,
	getTuples,
	binarySearch,
	getTimestamp,
	getAccuracy,
	sanitizePathName,
	nodesu2ojsamaScore,
};
