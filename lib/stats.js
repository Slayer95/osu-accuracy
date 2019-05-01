"use strict";

const util = require('./util');

function get_count(values) {
	return values.length;
}

function get_sum(values) {
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		sum += values[i];
	}
	return sum;
}

function min(values) {
	return Math.min(...values);
}

function max(values) {
	return Math.max(...values);
}

function arithmetic_mean(values) {
	return get_sum(values) / get_count(values);
}

function variance(values) {
	const mean = arithmetic_mean(values);
	let sum = 0;
	for (let i = 0; i < values.length; i++) {
		sum += (values[i] - mean) ** 2;
	}
	return sum;
}

function stdev(values) {
	return Math.sqrt(variance(values));
}

function covariance(values) {
	const count = get_count(values);
	const [x_mean, y_mean] = [
		arithmetic_mean(values.map(t => t[0])),
		arithmetic_mean(values.map(t => t[1])),
	];

	let sum = 0;
	for (let i = 0; i < count; i++) {
		sum += (values[i][0] - x_mean) * (values[i][1] - y_mean);
	}
	return sum / count;
}

function pearson_r(values) {
	const cov = covariance(values);
	const [x_values, y_values] = [
		values.map(t => t[0]),
		values.map(t => t[1]),
	];
	return cov / (stdev(x_values) * stdev(y_values));
}

function lsq_regression(values) {
	const [x_values, y_values] = [
		values.map(t => t[0]),
		values.map(t => t[1]),
	];

	const [x_mean, y_mean] = [x_values, y_values].map(arithmetic_mean);
	const [x_stdev, y_stdev] = [x_values, y_values].map(stdev);
	const r = pearson_r(values);

	const fit_slope = r * (y_stdev / x_stdev);
	return [r, fit_slope, y_mean - fit_slope * x_mean];
}

/**
 * Optimized for sorted data
 */

function min_sorted(values) {
	return values[0];
}

function max_sorted(values) {
	return values[1];
}

function median_sorted(values) {
	const count = get_count(values);
	const modulus = count % 2;
	const halfCount = (count - modulus) / 2;

	if (modulus) {
		return values[halfCount];
	}

	return (values[halfCount - 1] + values[halfCount]) / 2;
}

function weighted_median_sorted(values) {
	let leftWeight = 0;
	let rightWeight = 0;

	for (let i = 0; i < values.length; i++) {
		rightWeight += values[i][1];
	}

	const halfWeight = rightWeight / 2;

	for (let i = 0; i < values.length; i++) {
		if (i > 0) leftWeight += values[i - 1][1];
		rightWeight -= values[i][1];

		if (leftWeight > halfWeight || rightWeight > halfWeight) {
			continue;
		}

		if (leftWeight === rightWeight) {
			// Ideal case: both partitions have the same weight.
			return values[i][0];
		}

		if (rightWeight === halfWeight && leftWeight + values[i][1] === halfWeight) {
			// There are two weighted medians: i=lower w.m., i+1=upper w.m.
			return (values[i][0] + values[i + 1][0]) / 2;
		}

		return values[i][0];
	}
}

function iqr_sorted(values) {
	const count = get_count(values);
	if (count === 1) {
		return [values[0], values[0]];
	}

	const modulus = count % 2;
	const halfCount = (count - modulus) / 2;

	const sets = [values.slice(0, halfCount), values.slice(-halfCount)];
	return sets.map(median_sorted);
}

function iqm_sorted(values) {
	const count = get_count(values);
	if (count === 1) {
		return values[0];
	}

	const modulus = count % 4;
	const outerSize = (count - modulus) / 4;

	values = values.slice(outerSize, count - outerSize);
	if (!modulus) {
		return arithmetic_mean(values);
	}

	const limitValues = [values.pop(), values.shift()];
	const innerValues = values;

	const limitWeight = 1 - modulus / 4;
	const totalWeight = count - (2 * outerSize + modulus / 2);

	let sum = 0;
	for (const playData of innerValues) {
		sum += playData;
	}
	sum += limitValues[0] * limitWeight;
	sum += limitValues[1] * limitWeight;
	return sum / totalWeight;
}

/**
 * Theil-Sen estimator
 */
function theil_sen_sorted_next(collection, a, b, useWeights = false) {
	const x_delta = b[0] - a[0];
	const y_delta = b[1] - a[1];
	const slope = y_delta / x_delta;
	if (Number.isNaN(slope) || !Number.isFinite(slope)) return;
	const tuple = [slope, useWeights ? Math.abs(x_delta) : 1];
	const index = util.binarySearch(collection, tuple, tuple => tuple[0]);
	collection.splice(index, 0, tuple);
}

function theil_sen_sorted_intercept(values, fit_slope) {
	const collection = [];
	for (const [x, y] of values) {
		const intercept = y - fit_slope * x;
		const index = util.binarySearch(collection, intercept);
		collection.splice(index, 0, intercept);
	}
	return median_sorted(collection);
}

function theil_sen_sorted(values) {
	const collection = [];
	for (const a of values) {
		for (const b of values) {
			theil_sen_sorted_next(collection, a, b, false);
		}
	}

	const fit_slope = median_sorted(collection.map(t => t[0]));
	const fit_intercept = theil_sen_sorted_intercept(values, fit_slope);
	return [fit_slope, fit_intercept];
}

function theil_sen_weighted_sorted(values) {
	const collection = [];
	for (const a of values) {
		for (const b of values) {
			theil_sen_sorted_next(collection, a, b, true);
		}
	}

	const fit_slope = weighted_median_sorted(collection);
	const fit_intercept = theil_sen_sorted_intercept(values, fit_slope);
	return [fit_slope, fit_intercept];
}

module.exports = {
	arithmetic_mean,
	min,
	max,
	variance,
	covariance,
	stdev,
	pearson_r,
	lsq_regression,
	sorted: {
		min: min_sorted,
		max: max_sorted,
		median: median_sorted,
		iqr: iqr_sorted,
		iqm: iqm_sorted,
		theil_sen: theil_sen_sorted,
		theil_sen_weighted: theil_sen_weighted_sorted,
	},
};
