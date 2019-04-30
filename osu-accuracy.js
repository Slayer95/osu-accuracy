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

function getAverageAccuracy(scoresList) {
	if (!scoresList.length) return NaN;
	let sum = 0;
	for (const playData of scoresList) {
		sum += playData.accuracy;
	}

	return sum / scoresList.length;
}

function getMedianAccuracy(scoresList) {
	if (!scoresList.length) return NaN;

	const modulus = scoresList.length % 2;
	const halfLength = (scoresList.length - modulus) / 2;

	if (modulus) {
		return scoresList[halfLength].accuracy;
	}

	return (scoresList[halfLength - 1].accuracy + scoresList[halfLength].accuracy) / 2;
}

function getIQRAccuracy(scoresList) {
	if (!scoresList.length) return [];

	const modulus = scoresList.length % 2;
	const halfLength = (scoresList.length - modulus) / 2;

	const sets = [scoresList.slice(0, halfLength), scoresList.slice(-halfLength)];
	return sets.map(getMedianAccuracy);
}

function getIQMAccuracy(scoresList) {
	const modulus = scoresList.length % 4;
	const outerSize = (scoresList.length - modulus) / 4;

	scoresList = scoresList.slice(outerSize, scoresList.length - outerSize);
	if (!modulus) {
		return getAverageAccuracy(scoresList);
	}

	const limitPlays = [scoresList.pop(), scoresList.shift()];
	const innerPlays = scoresList;

	const limitWeight = 1 - modulus / 4;
	const totalWeight = innerPlays.length +  2 - modulus / 2;

	let sum = 0;
	for (const playData of innerPlays) {
		sum += playData.accuracy;
	}
	sum += limitPlays[0].accuracy * limitWeight;
	sum += limitPlays[1].accuracy * limitWeight;
	return sum / totalWeight;
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

	const minPP = Math.min(...playerPerformance.topPlays.map(x => x.maxpp));
	const maxPP = Math.max(...playerPerformance.topPlays.map(x => x.maxpp));

	playerPerformance.topPlays.sort(Collator.accuracy);
	const minAccuracy = Math.min(...playerPerformance.topPlays.map(x => x.accuracy));
	const maxAccuracy = Math.max(...playerPerformance.topPlays.map(x => x.accuracy));
	const medianAccuracy = getMedianAccuracy(playerPerformance.topPlays);
	const iqrAccuracy = getIQRAccuracy(playerPerformance.topPlays);

	const meanAccuracy = getAverageAccuracy(playerPerformance.topPlays);
	const iqmAccuracy = getIQMAccuracy(playerPerformance.topPlays);

	playerPerformance.topPlays.sort(Collator.difficulty);

	const easyPlays = playerPerformance.topPlays.splice(Math.ceil(playerPerformance.topPlays.length / 2)).sort(Collator.accuracy);
	const hardPlays = playerPerformance.topPlays.sort(Collator.accuracy);

	const stableAccuracy = playerPerformance.accuracy;
	const splitMedianAccuracy = [easyPlays, hardPlays].map(getMedianAccuracy);
	const splitIQMAccuracy = [easyPlays, hardPlays].map(getIQMAccuracy);

	Profiler.log('accuracy_calc', t);

	return {
		pp: playerPerformance.pp,
		ppRange: [minPP, maxPP].map(x => Math.round(x)),
		accuracy: {
			min: minAccuracy,
			max: maxAccuracy,
			stable: stableAccuracy,
			mean: meanAccuracy,
			median: medianAccuracy,
			iqm: iqmAccuracy,
			splitMedian: splitMedianAccuracy,
			splitIQM: splitIQMAccuracy,
			iqr: iqrAccuracy,
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

	const Widths = {
		NAME: 18,
		PP: 19,
		SINGLE: 8,
		DOUBLE: 19,
	};

	const columnHeaders = [`osu! username`, `pp, diff. range`, `W. Mean`, `Mean`, `Median`, `IQM`, `Split median`, `Split IQM`, `IQR`];
	const columnTypes = [`name`, `pp`, `single`, `single`, `single`, `single`, `double`, `double`, `double`];
	const CELL_SIZES = columnTypes.map(type => Widths[type.toUpperCase()]);
	const formatCell = (cell, index) => util.padString(` ${cell}`, CELL_SIZES[index]);
	const formatRow = row => row.map(formatCell).join(`|`);

	console.log(formatRow(columnHeaders));
	console.log(Array.from({length: 9}, (_, index) => '-'.repeat(CELL_SIZES[index])).join(`|`));

	for (const userName of userList) {
		const result = await getPlayerPerformanceMetrics(userName);
		const cells = [userName, `N/A`, `N/A`, `N/A`, `N/A`, `N/A`, `N/A`, `N/A`, `N/A`];
		if (!result) {
			console.log(formatRow(cells));
			continue;
		}
		const {stable, mean, median, iqm, splitMedian, splitIQM, iqr} = result.accuracy;
		cells[1] = `${result.pp} [${result.ppRange.join(', ')}]`;
		cells[2] = util.toPercent(stable);
		cells[3] = util.toPercent(mean);
		cells[4] = util.toPercent(median);
		cells[5] = util.toPercent(iqm);
		cells[6] = splitMedian.map(util.toPercent).join(' -> ');
		cells[7] = splitIQM.map(util.toPercent).join(' -> ');
		cells[8] = iqr.reverse().map(util.toPercent).join(' -> ');

		console.log(formatRow(cells));
	}

	Profiler.log('app_total', t);

	console.log(`\n${Profiler}`);
}

process.on('unhandledRejection', function (err) {
	throw err;
});

runCli();
