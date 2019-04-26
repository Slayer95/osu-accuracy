"use strict";

const fs = require('fs');
const path = require('path');

const api = require('./api');
const util = require('./util');
const CACHE = require('./cache');
const BeatMaps = require('./beatmaps');

const Collator = {
	difficulty: (a, b) => b.maxpp - a.maxpp, // Descendent
	accuracy: (a, b) => a.accuracy - b.accuracy, // Ascendent
};

function getMedianAccuracy(scoresList) {
	if (!scoresList.length) return 0;

	const modulus = scoresList.length % 2;
	const halfLength = (scoresList.length - modulus) / 2;

	if (modulus) {
		return scoresList[halfLength].accuracy;
	}

	return (scoresList[halfLength - 1].accuracy + scoresList[halfLength].accuracy) / 2;
}

async function fetchPlayerPerformance(userId) {
	const {client, constants} = api.nodesu;
	const [userData, topPlays] = await Promise.all([
		client.user.get(userId, constants.MODE.osu, 0, constants.LOOKUP_TYPE.string),
		client.user.getBest(userId, constants.MODE.osu, 100, constants.LOOKUP_TYPE.string),
	]);

	if (!userData || !topPlays || !topPlays.length) {
		return null;
	}

	for (const playData of topPlays) {;
		try {
			playData.maxpp = await BeatMaps.getModdedMaxPP(util.nodesu2ojsamaScore(playData));
			playData.accuracy = util.getAccuracy(playData);
		} catch (err) {
			// console.log(err.stack);
			// e.g. HTTP 429: Too many requests
		}
	}

	return {
		pp: Math.round(userData.pp_raw),
		accuracy: userData.accuracy / 100,
		level: userData.level,
		topPlays: topPlays.filter(playData => playData.maxpp && playData.accuracy),
	};
}

async function getPlayerAccuracyVariants(userId) {
	const playerPerformance = await fetchPlayerPerformance(userId);
	if (!playerPerformance) return null;

	playerPerformance.topPlays.sort(Collator.difficulty);

	const easyPlays = playerPerformance.topPlays.splice(Math.ceil(playerPerformance.topPlays.length / 2)).sort(Collator.accuracy);
	const hardPlays = playerPerformance.topPlays.sort(Collator.accuracy);

	const stableAccuracy = playerPerformance.accuracy;
	const rangeAccuracy = [easyPlays, hardPlays].map(getMedianAccuracy);
	const rangeMultiAccuracy = await ({
		offset: 0,
		list: [0, 0],
	}, 0);

	return {
		stable: stableAccuracy,
		range: rangeAccuracy,
		rangeMulti: rangeMultiAccuracy,
	};
}

async function runCli() {
	const [,, userInput] = process.argv;
	if (!userInput) {
		throw new Error(`Specify the user names as a command line argument (comma-separated list)`);
	}

	const userList = userInput.split(',').map(name => name.trim());
	if (userList.some(userName => /[^a-z0-9_\s-]/i.test(userName))) {
		throw new Error(`Specify the user names as a command line argument (comma-separated list)`);
	}

	CACHE.start();

	const CELL_SIZES = [25, 13, 17/*, 4*/];
	const formatCell = (cell, index) => util.padString(` ${cell}`, CELL_SIZES[index]);
	const formatRow = row => row.map(formatCell).join(`|`);

	const headers = [`osu! username`, `Stable acc.`, `Range acc.`/*, `?`*/];
	console.log(formatRow(headers));
	console.log(Array.from({length: /*4*/3}, (_, index) => '-'.repeat(CELL_SIZES[index])).join(`|`));

	for (const userName of userList) {
		const result = await getPlayerAccuracyVariants(userName);
		const cells = [userName, `N/A`, `N/A`/*, `N/A`*/];
		if (!result) {
			console.log(formatRow(cells));
			continue;
		}
		cells[1] = util.toPercent(result.stable);
		cells[2] = result.range.map(util.toPercent).join(' -> ');

		/*
		if (result.rangeMulti) {
			cells[3] = `(${result.rangeMulti.offset})${result.rangeMulti.map(util.toPercent).join(', ')}`;
		}
		//*/

		console.log(formatRow(cells));
	}

}

process.on('unhandledRejection', function (err) {
	throw err;
});

// node osu-accuracy "AngelJuega1,BeowulF97,Ego MS, iRedak-, Jiandae, XinCrin"
runCli();