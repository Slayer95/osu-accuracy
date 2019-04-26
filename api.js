"use strict";

const fs = require('fs');
const path = require('path');

const API_KEY = (() => {
	try {
		return fs.readFileSync(path.resolve(__dirname, '.osu-api-key.txt'), 'utf8').trim();
	} catch (err) {
		throw new Error(`API key not found (.osu-api-key.txt)`);
	}
})();

const Nodesu = require('nodesu');
const ojsama = require('ojsama');

const client = new Nodesu.Client(API_KEY, {
	parseData: true,
});

const constants = {
	MODE: Nodesu.Mode,
	LOOKUP_TYPE: Nodesu.LookupType,
	MODS: Nodesu.Mods,
};

module.exports = {
	nodesu: {client, constants},
	ojsama: ojsama,
};
