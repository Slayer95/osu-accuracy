"use strict";

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

module.exports = {
	arithmetic_mean,
	min,
	max,
	sorted: {
		min: min_sorted,
		max: max_sorted,
		median: median_sorted,
		iqr: iqr_sorted,
		iqm: iqm_sorted,
	},
};
