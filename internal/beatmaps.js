"use strict";

const fs = require('fs');
const Scrapper = {
	buffer: Buffer.alloc(512),
	MARKERS: {
		cr: Buffer.from(`\r`),
		lf: Buffer.from(`\n`),
		section_metadata: Buffer.from(`\n[Metadata]`),
		value_title: Buffer.from(`\nTitle:`),
		value_artist: Buffer.from(`\nArtist:`),
		value_creator: Buffer.from(`\nCreator:`),
		value_version: Buffer.from(`\nVersion:`),
		value_setId: Buffer.from(`\nBeatmapSetID:`),
	},
};

function getBeatmapMetaLocalSync(filePath) {
	const metaData = [0, '', '', '', '']; /* [setId, artist, title, creator, version] */
	const markers = Scrapper.MARKERS;
	const buffer = Scrapper.buffer;
	const CR = markers.cr[0];

	let fd, bytesRead;
	try {
		fd = fs.openSync(filePath, 'r');
		bytesRead = fs.readSync(fd, buffer, 0, 512, 256);
	} finally {
		if (fd) {
			fs.closeSync(fd);
			fd = null;
		}
	}

	// console.log(buffer.slice(0, bytesRead).toString('utf8'));

	// Find [Metadata]
	let marker = markers.section_metadata;
	let index = buffer.indexOf(marker);
	if (index < 0 || index >= bytesRead) return null;
	let nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || index >= bytesRead) return null;

	// console.log(`Found [Metadata]`);

	// Title:
	marker = markers.value_title;
	index = buffer.indexOf(marker, nlIndex);
	if (index < 0 || index >= bytesRead) return null;
	nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || nlIndex >= bytesRead) return null;
	metaData[2] = buffer.slice(index + marker.length, nlIndex - ~~(buffer[nlIndex - 1] === CR)).toString('utf8');

	// console.log(`Found Title:`);

	// Artist:
	marker = markers.value_artist;
	index = buffer.indexOf(marker, nlIndex);
	if (index < 0 || index >= bytesRead) return null;
	nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || nlIndex >= bytesRead) return null;
	metaData[1] = buffer.slice(index + marker.length, nlIndex - ~~(buffer[nlIndex - 1] === CR)).toString('utf8');

	// console.log(`Found Artist:`);

	// Creator:
	marker = markers.value_creator;
	index = buffer.indexOf(marker, nlIndex);
	if (index < 0 || index >= bytesRead) return null;
	nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || nlIndex >= bytesRead) return null;
	metaData[3] = buffer.slice(index + marker.length, nlIndex - ~~(buffer[nlIndex - 1] === CR)).toString('utf8');

	// console.log(`Found Creator:`);

	// Version:
	marker = markers.value_version;
	index = buffer.indexOf(marker, nlIndex);
	if (index < 0 || index >= bytesRead) return null;
	nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || nlIndex >= bytesRead) return null;
	metaData[4] = buffer.slice(index + marker.length, nlIndex - ~~(buffer[nlIndex - 1] === CR)).toString('utf8');

	// console.log(`Found Version:`);

	// BeatmapSetId:
	marker = markers.value_setId;
	index = buffer.indexOf(marker, nlIndex);
	if (index < 0 || index >= bytesRead) return null;
	nlIndex = buffer.indexOf(markers.lf, index + marker.length);
	if (nlIndex < 0 || nlIndex >= bytesRead) return null;
	metaData[0] = +buffer.slice(index + marker.length, nlIndex - ~~(buffer[nlIndex - 1] === CR)).toString('utf8');

	// console.log(`Found BeatmapSetId:`);

	return metaData;
}

module.exports = {
	getBeatmapMetaLocalSync,
};
