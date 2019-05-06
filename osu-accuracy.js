"use strict";

const minimist = require('minimist');

const stats = require('./lib/stats');
const util = require('./lib/util');
const Profiler = require('./lib/profiler');

const api = require('./api');
const CACHE = require('./cache');
const Difficulty = require('./difficulty');

const Collator = {
	difficulty: (a, b) => b.maxpp - a.maxpp, // Descendent
	accuracy: (a, b) => a.accuracy - b.accuracy, // Ascendent
};

function getAverageAccuracy(scoresList) {
	if (!scoresList.length) return NaN;
	return stats.arithmetic_mean(scoresList.map(x => x.accuracy));
}

function getMedianAccuracy(scoresList) {
	if (!scoresList.length) return NaN;
	return stats.sorted.median(scoresList.map(x => x.accuracy));
}

function getIQRAccuracy(scoresList) {
	if (!scoresList.length) return [];
	return stats.sorted.iqr(scoresList.map(x => x.accuracy));
}

function getIQMAccuracy(scoresList) {
	if (!scoresList.length) return NaN;
	return stats.sorted.iqm(scoresList.map(x => x.accuracy));
}

async function fillPlayerPerformance(scoresList, sequential) {
	if (sequential) {
		for (const playData of scoresList) {
			playData.accuracy = util.getAccuracy(playData);
			try {
				playData.maxpp = await Difficulty.parser.getMaxPP(util.nodesu2ojsamaScore(playData));
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
			queries.push(Difficulty.parser.getMaxPP(util.nodesu2ojsamaScore(playData)).catch(err => (console.error(err.stack), Profiler.logSync('score_failure'), null)));
		}
		const maxPPs = await Promise.all(queries);
		Profiler.setParallel(false);

		for (let i = 0; i < maxPPs.length; i++) {
			scoresList[i].maxpp = maxPPs[i];
		}
	}
}

async function fetchPlayerPerformanceData(userName) {
	const [userData, topPlays] = await Promise.all([
		api.getUser(userName),
		api.getUserBest(userName),
	]);

	if (!userData || !topPlays || !topPlays.length) {
		return null;
	}

	return {
		pp: Math.round(userData.ppRaw),
		accuracy: userData.accuracy / 100,
		level: userData.level,
		topPlays: topPlays,
	};
}

async function getPlayerPerformanceMetrics(perfData) {
	await fillPlayerPerformance(perfData.topPlays, false);
	const topPlays = perfData.topPlays.filter(playData => playData.maxpp && playData.accuracy);
	if (!topPlays.length) return null;

	const t = process.hrtime();

	const minPP = stats.min(topPlays.map(x => x.maxpp));
	const maxPP = stats.max(topPlays.map(x => x.maxpp));

	topPlays.sort(Collator.accuracy);
	const minAccuracy = stats.min(topPlays.map(x => x.accuracy));
	const maxAccuracy = stats.max(topPlays.map(x => x.accuracy));
	const medianAccuracy = getMedianAccuracy(topPlays);
	const iqrAccuracy = getIQRAccuracy(topPlays);

	const meanAccuracy = getAverageAccuracy(topPlays);
	const iqmAccuracy = getIQMAccuracy(topPlays);

	topPlays.sort(Collator.difficulty);
	const accuracyVsPPDataset = topPlays.map(x => [x.maxpp, x.accuracy]);
	const linearRegression = stats.lsq_regression(accuracyVsPPDataset);
	const theilSen = stats.sorted.theil_sen(accuracyVsPPDataset);
	const theilSenWeighted = stats.sorted.theil_sen_weighted(accuracyVsPPDataset);

	const easyPlays = topPlays.splice(Math.ceil(topPlays.length / 2)).sort(Collator.accuracy);
	const hardPlays = topPlays.sort(Collator.accuracy);

	const stableAccuracy = perfData.accuracy;
	const splitMedianAccuracy = [easyPlays, hardPlays].map(getMedianAccuracy);
	const splitIQMAccuracy = [easyPlays, hardPlays].map(getIQMAccuracy);

	Profiler.log('accuracy_calc', t);

	return {
		pp: perfData.pp,
		ppRange: [minPP, maxPP].map(x => Math.round(x)),
		accuracy: {
			min: minAccuracy,
			max: maxAccuracy,
			stable: stableAccuracy,
			mean: meanAccuracy,
			median: medianAccuracy,
			iqm: iqmAccuracy,
			iqr: iqrAccuracy,
		},
		accuracyVsPP: {
			dataset: accuracyVsPPDataset.map(([x, y]) => [util.round(x, 1), util.round(util.scalePercent(y), 2)]),
			splitMedian: splitMedianAccuracy,
			splitIQM: splitIQMAccuracy,
			linearRegression,
			theilSen,
			theilSenWeighted,
		},
		level: perfData.level,
	};
}

async function runCli() {
	const argv = minimist(process.argv.slice(2));
	if (!argv._.length) {
		console.log(argv);
		throw new Error(`Specify the user names as a command line argument (comma-separated list)`);
	}

	const userList = argv._[0].split(',').map(name => name.trim());
	if (userList.some(userName => /[^a-z0-9_\s-[\]]/i.test(userName))) {
		throw new Error(`Specify the user names as a command line argument (comma-separated list)`);
	}

	if (argv.debug) {
		Profiler.setDebug(true);
	}

	const t = process.hrtime();
	CACHE.start();

	const Widths = {
		NAME: 18,
		PP: 6,
		PP_DOUBLE: 12,
		SINGLE: 8,
		DOUBLE: 19,
		FIT: 50,
		DATA: 1500,
	};

	const columnHeaders = [`osu! username`, `pp`, `Diff. range`, `W. Mean`, `Mean`, `Median`, `IQM`, `IQR`, `Split median`, `Split IQM`, `LSQ`, `Theil-Sen`, `W. Theil-Sen`, `Data`];
	const columnTypes = [`name`, `pp`, `pp_double`, `single`, `single`, `single`, `single`, `double`, `double`, `double`, `fit`, `fit`, `fit`, `data`];
	const NULL_VALUES = columnHeaders.map(() => `N/A`);
	const ERR_VALUES = columnHeaders.map(() => `ERR`);

	const CELL_SIZES = columnTypes.map(type => Widths[type.toUpperCase()]);
	const formatMarkdownCell = (cell, index) => util.padString(` ${cell}`, CELL_SIZES[index]);
	const formatCSVCell = cell => {
		cell = cell.replace(/"/g, `""`);
		if (/[,\n"]/.test(cell)) return `"${cell}"`;
		return cell;
	};

	const formatMarkdownValues = values => values.map(formatMarkdownCell).join(`|`);
	const formatCSVValues = values => values.map(formatCSVCell).join(`,`);
	const formatDefaultValues = values => values.map((val, index) => `${columnHeaders[index]}: ${val}`).join(`\n`);

	const formatValues = (() => {
		switch (argv.format) {
		case 'markdown': return formatMarkdownValues;
		case 'csv': return formatCSVValues;
		default: return formatDefaultValues;
		}
	})();

	if (argv.format === 'markdown' || argv.format === 'csv') {
		console.log(formatValues(columnHeaders));
	}
	if (argv.format === 'markdown') {
		console.log(columnHeaders.map((_, index) => '-'.repeat(CELL_SIZES[index])).join(`|`));
	}

	const apiT = process.hrtime();
	const perfPromises = userList.map(fetchPlayerPerformanceData);
	Promise.all(perfPromises).catch(err => null).then(() => {
		Profiler.logN('osu_api_parallel', 2 * userList.length, apiT, true);
	});

	for (const [userName, perfPromise] of util.getTuples(userList, perfPromises)) {
		const perfData = await perfPromise;
		if (!perfData) {
			const values = NULL_VALUES.slice().fill(userName, 0, 1);
			console.log(formatValues(values));
			continue;
		}
		const result = await getPlayerPerformanceMetrics(perfData);
		if (!result) {
			const values = ERR_VALUES.slice().fill(userName, 0, 1);
			console.log(formatValues(values));
			continue;
		}
		const {stable, mean, median, iqm, iqr} = result.accuracy;
		const {splitMedian, splitIQM, linearRegression, theilSen, theilSenWeighted, dataset} = result.accuracyVsPP;
		const values = [
			userName,
			`${result.pp}`,
			`[${result.ppRange.join(', ')}]`,
			util.toPercent(stable),
			util.toPercent(mean),
			util.toPercent(median),
			util.toPercent(iqm),
			iqr.reverse().map(util.toPercent).join(' -> '),
			splitMedian.map(util.toPercent).join(' -> '),
			splitIQM.map(util.toPercent).join(' -> '),
			util.formatFit(linearRegression.equation, linearRegression, argv['fit-style']),
			util.formatFit(theilSen.equation, theilSen, argv['fit-style']),
			util.formatFit(theilSenWeighted.equation, theilSenWeighted, argv['fit-style']),
			(() => {
				switch (argv['dataset-format']) {
				case 'json': return JSON.stringify(dataset);
				case 'wolfram': return '{' + dataset.map(tuple => '{' + tuple.join(', ') + '}').join(`, `) + '}';
				default: return dataset.map(([x, y]) => `${x} ${y}%`).join(';');
				}
			})(dataset),
		];

		console.log(formatValues(values));
		if (argv.format !== 'markdown' && argv.format !== 'csv') {
			console.log('');
		}
	}

	Profiler.log('app_total', t);

	if (argv.debug) {
		console.error(`\n${Profiler}`);
	}
}

process.on('unhandledRejection', function (err) {
	throw err;
});

runCli();
