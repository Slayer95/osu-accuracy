"use strict";

const {Transform} = require('stream');

class Splitter extends Transform {
	constructor(separator, options = {}) {
		super(options);

		this.offset      = 0;
		this.bodyOffset  = 0;

		this.bufferSize  = options.bufferSize  || 1024 * 1024 * 1; //1Mb
		this.bufferFlush = options.bufferFlush || Math.floor(this.bufferSize * 0.1); //10% buffer size

		this.buffer      = Buffer.alloc(this.bufferSize);
		this.separator   = separator;

		this.lastIndex = -1;
		this.range = options.range || [0, Infinity];
		this.trailerSeparator = !!options.join;
	}

	_transform(chunk, encoding, next) {
		if (this.offset + chunk.length > this.bufferSize - this.bufferFlush) {
			const minimalLength = this.bufferSize - this.bodyOffset + chunk.length;
			if (this.bufferSize < minimalLength) {
				//console.warn("Increasing buffer size to ", minimalLength);
				this.bufferSize = minimalLength;
			}

			const tmp = Buffer.alloc(this.bufferSize);
			this.buffer.copy(tmp, 0, this.bodyOffset);
			this.buffer = tmp;
			this.offset = this.offset - this.bodyOffset;
			this.bodyOffset = 0;
		}

		chunk.copy(this.buffer, this.offset);

		let i, start, stop = this.offset + chunk.length;
		do {
			start = Math.max(this.bodyOffset ? this.bodyOffset : 0, this.offset - this.separator.length);
			i = this.buffer.slice(start, stop).indexOf(this.separator);

			let curIndex = this.lastIndex + 1;
			if (i === -1 || this.range[1] <= curIndex + 1) {
				break;
			}

			i += start;

			if (curIndex >= this.range[0]) {
				const img = this.buffer.slice(this.bodyOffset, i + (this.trailerSeparator ? this.separator.length : 0));
				this.push(img);
			}
			this.bodyOffset = i + this.separator.length;
			this.lastIndex = curIndex;
		} while (true);

		this.offset += chunk.length;
		next();
	}

	_flush(done) {
		if (this.offset === this.bodyOffset) {
			return done();
		}

		let curIndex = this.lastIndex + 1;
		if (curIndex >= this.range[0]) {
			const img = this.buffer.slice(this.bodyOffset, this.offset);
			this.push(img);
		}
		this.bodyOffset = this.offset;
		this.lastIndex = curIndex;

		done();
	}
}

module.exports = Splitter;
