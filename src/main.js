var allData;
var chartBits = {};

// Config

var widthPerInnings = 10;
var heightPerPlayer = 5;


// Helpers

function mapByField(arr, field = 'id') {
	let map = new Map();
	arr.forEach(value => {
		let id = value[field];
		map.set(id, value);
	});
	return map;
}


// Setup

function parseData(data) {
	data.matchesById = mapByField(data.matches);
	data.innings = data.matches.reduce((memo, match) => memo.concat(match.innings_ids), []);

	// Build a list of blocks of consecutive innings per player, based on total innings index
	data.players.forEach(player => {
		player.inningsById = mapByField(player.innings, 'innings_id');
		player.inningsBlocks = [];
		let curBlock = {};
		player.innings.forEach(inn => {
			let id = inn.innings_id;
			let index = data.innings.indexOf(id);
			if (curBlock.end !== undefined) {
				// If there's a gap between innings, start a new block
				if (index > curBlock.end + 1) {
					player.inningsBlocks.push(curBlock);
					curBlock = {};
				}
			}

			if (curBlock.start === undefined) {
				curBlock.start = index;
				curBlock.idList = [];
			}
			curBlock.idList.push(data.innings[index]);
			curBlock.end = index;
		});
		player.inningsBlocks.push(curBlock);
	});

	allData = data;
	console.log(data);
	setupChart();
}

function setupChart() {
	chartBits.root = d3.select('#shiny').append('svg')
		.attr('width', widthPerInnings * (allData.innings.length + 2))
		.attr('height', heightPerPlayer * allData.players.length);
	chartBits.main = chartBits.root.append('g').attr('class', 'graph-main')
		.attr('translate', `transform(${widthPerInnings}, 0)`);
	chartBits.lines = chartBits.main.selectAll('.player-line')
		.data(allData.players, d => d.info.id)
		.enter().append('g')
			.attr('class', 'player-line');
	chartBits.linesGap = chartBits.lines.append('path')
		.attr('class', 'player-line-gap');
	chartBits.linesPlaying = chartBits.lines.append('path')
		.attr('class', 'player-line-playing');

	renderLines();
}


// Rendering

class CounterMap {
	constructor() {
		this.map = new Map();
	}

	set(k, v) {
		this.map.set(k, +v);
		return this;
	}

	get(k) {
		return this.map.get(k) || 0;
	}

	increment(k, amount=1) {
		let value = this.get(k) + (+amount);
		return this.set(k, value);
	}
}

var gapPlayersPerX = new CounterMap();

function playerPathGenerator(options) {
	var opts = Object.assign({}, options || {});
	var withPositions = !!opts.withPositions;
	var skipGaps = !!opts.skipGaps;

	return (player) => {
		if (!withPositions && !skipGaps) {
			let start = player.inningsBlocks[0].start * widthPerInnings;
			let end = player.inningsBlocks[player.inningsBlocks.length - 1].end * widthPerInnings;
			return `M${start},0 L${end},0`;
		}

		let path = [];
		let lastX;
		player.inningsBlocks.forEach((block, blockIndex) => {
			let start = block.start * widthPerInnings;
			if (!withPositions) {
				let width = block.idList.length * widthPerInnings;
				path.push(`M${start},0`, `l${width},0`);
				return;
			}

			block.idList.forEach((innId, index) => {
				let inn = player.inningsById.get(innId);
				let y = inn.batting_position * heightPerPlayer;
				let x = start + index * widthPerInnings;
				// let command = x === start || (index === 0 && skipGaps) ? 'M' : 'L';
				let command = 'L';
				if (index === 0) {
					if (skipGaps || blockIndex === 0) {
						command = 'M';
					} else if (!skipGaps) {
						let gapPlayers = gapPlayersPerX.get(lastX + widthPerInnings);
						let gapY = heightPerPlayer * (gapPlayers + 14);
						for (let gx of d3.range(lastX + widthPerInnings, x - widthPerInnings, widthPerInnings)) {
							gapPlayersPerX.increment(gx);
						}
						// Add extra points to move the line outside the playing 11 positions
						path.push(`L${lastX + widthPerInnings},${gapY},${x - widthPerInnings},${gapY}`);
					}
				}
				path.push(`${command}${x},${y}`);
				lastX = x;
			});
		});
		return path.join(' ');
	}
}

function renderLines() {
	// TODO: Switch display modes
	var withPositions = 1;
	chartBits.lines
		.attr('transform', (d, i) => withPositions ? '' : `translate(0, ${i * heightPerPlayer + heightPerPlayer / 2})`)
	chartBits.linesGap
		.attr('d', playerPathGenerator({ withPositions, skipGaps: false }))
	chartBits.linesPlaying
		.attr('d', playerPathGenerator({ withPositions, skipGaps: true }))
}

d3.json('/cricinfo-scripts/project-players-over-time/data/player-data.json', parseData);
