"use strict";

const util = require('./lib/util');
const Profiler = require('./lib/profiler');

const api = require('./api');
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

async function fillPlayerPerformance(scoresList, sequential) {
	if (sequential) {
		for (const playData of scoresList) {
			playData.accuracy = util.getAccuracy(playData);
			try {
				playData.maxpp = await BeatMaps.getModdedMaxPP(util.nodesu2ojsamaScore(playData));
			} catch (err) {
				Profiler.log('score_failure');
			}
		}
	} else {
		Profiler.setParallel(true);
		const queries = [];
		util.shuffle(scoresList); // So that failures average out
		for (const playData of scoresList) {
			playData.accuracy = util.getAccuracy(playData);
			// eslint-disable-next-line no-sequences
			queries.push(BeatMaps.getModdedMaxPP(util.nodesu2ojsamaScore(playData)).catch(err => (Profiler.logSync('score_failure'), null)));
		}
		const maxPPs = await Promise.all(queries);
		Profiler.setParallel(false);

		for (let i = 0; i < maxPPs.length; i++) {
			scoresList[i].maxpp = maxPPs[i];
		}
	}
}

async function fetchPlayerPerformanceData(userId) {
	const {client, constants} = api.nodesu;

	let t = process.hrtime();
	const [userData, topPlays] = await Promise.all([
		client.user.get(userId, constants.MODE.osu, 0, constants.LOOKUP_TYPE.string),
		client.user.getBest(userId, constants.MODE.osu, 100, constants.LOOKUP_TYPE.string),
	]);
	Profiler.logN('osu_api', 2, t);

	if (!userData || !topPlays || !topPlays.length) {
		return null;
	}

	await fillPlayerPerformance(topPlays, false); // false = parallel, true = sequential

	return {
		pp: Math.round(userData.ppRaw),
		accuracy: userData.accuracy / 100,
		level: userData.level,
		topPlays: topPlays.filter(playData => playData.maxpp && playData.accuracy),
	};
}

async function getPlayerPerformanceMetrics(userId) {
	const playerPerformance = await fetchPlayerPerformanceData(userId);
	if (!playerPerformance) return null;

	const t = process.hrtime();

	playerPerformance.topPlays.sort(Collator.accuracy);
	const medianAccuracy = getMedianAccuracy(playerPerformance.topPlays)

	playerPerformance.topPlays.sort(Collator.difficulty);

	const easyPlays = playerPerformance.topPlays.splice(Math.ceil(playerPerformance.topPlays.length / 2)).sort(Collator.accuracy);
	const hardPlays = playerPerformance.topPlays.sort(Collator.accuracy);

	const stableAccuracy = playerPerformance.accuracy;
	const rangeAccuracy = [easyPlays, hardPlays].map(getMedianAccuracy);
	const rangeMultiAccuracy = await ({
		offset: 0,
		list: [0, 0],
	}, 0);

	Profiler.log('accuracy_calc', t);

	return {
		pp: playerPerformance.pp,
		accuracy: {
			stable: stableAccuracy,
			median: medianAccuracy,
			range: rangeAccuracy,
			rangeMulti: rangeMultiAccuracy,
		},
		level: playerPerformance.level,
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

	const t = process.hrtime();
	CACHE.start();

	const CELL_SIZES = [25, 6, 13, 13, 17/*, 4*/];
	const formatCell = (cell, index) => util.padString(` ${cell}`, CELL_SIZES[index]);
	const formatRow = row => row.map(formatCell).join(`|`);

	const headers = [`osu! username`, `pp`, `Stable acc.`, `Median acc.`, `Range acc.`/*, `?`*/];
	console.log(formatRow(headers));
	console.log(Array.from({length: /*6*/5}, (_, index) => '-'.repeat(CELL_SIZES[index])).join(`|`));

	for (const userName of userList) {
		const result = await getPlayerPerformanceMetrics(userName);
		const cells = [userName, `N/A`, `N/A`, `N/A`, `N/A`/*, `N/A`*/];
		if (!result) {
			console.log(formatRow(cells));
			continue;
		}
		cells[1] = `${result.pp}`;
		cells[2] = util.toPercent(result.accuracy.stable);
		cells[3] = util.toPercent(result.accuracy.median);
		cells[4] = result.accuracy.range.map(util.toPercent).join(' -> ');

		/*
		if (result.rangeMulti) {
			cells[5] = `(${result.accuracy.rangeMulti.offset})${result.rangeMulti.map(util.toPercent).join(', ')}`;
		}
		//*/

		console.log(formatRow(cells));
	}

	Profiler.log('app_total', t);

	console.log(`\n${Profiler}`);
}

process.on('unhandledRejection', function (err) {
	throw err;
});

runCli();
