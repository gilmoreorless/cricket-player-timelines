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

function flatten(arr) {
	return (arr || []).reduce((memo, val) => memo.concat(val), []);
}

function first(arr) {
	return arr[0];
}

function last(arr) {
	return arr[arr.length - 1];
}

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

var gapPlayersPerX = new CounterMap();

var pathGenerators = {

	rowPerPlayer(player) {
		return flatten(player.inningsBlocks.map(block => {
			const start = block.start * widthPerInnings;
			const width = block.idList.length * widthPerInnings;
			return [`M${start},0`, `l${width},0`];
		}));
	},

	rowPerPlayerGaps(player) {
		const start = player.inningsBlocks[0].start * widthPerInnings;
		const end = player.inningsBlocks[player.inningsBlocks.length - 1].end * widthPerInnings;
		return [`M${start},0`, `L${end},0`];
	},

	rowPerPosition(player) {
		return flatten(player.inningsBlocks.map((block, blockIndex) => {
			const start = block.start * widthPerInnings;
			return block.idList.map((innId, index) => {
				const inn = player.inningsById.get(innId);
				const y = inn.batting_position * heightPerPlayer;
				const x = start + index * widthPerInnings;
				let command = index === 0 ? 'M' : 'L';
				return `${command}${x},${y}`;
			});
		}));
	},

	rowPerPositionGaps(player) {
		if (player.inningsBlocks.length < 2) {
			return [];
		}
		const gaps = player.inningsBlocks.slice(0, -1).map((block, index) => {
			const nextBlock = player.inningsBlocks[index + 1];
			return {
				fromIndex: block.end,
				fromPos: player.inningsById.get(last(block.idList)).batting_position,
				toIndex: nextBlock.start,
				toPos: player.inningsById.get(first(nextBlock.idList)).batting_position,
			};
		});
		return flatten(gaps.map(gap => {
			const startX = gap.fromIndex * widthPerInnings;
			const startY = gap.fromPos * heightPerPlayer;
			const endX = gap.toIndex * widthPerInnings;
			const endY = gap.toPos * heightPerPlayer;
			const gapPlayers = gapPlayersPerX.get(startX + widthPerInnings);
			const gapY = heightPerPlayer * (gapPlayers + 14);
			for (let gx of d3.range(startX + widthPerInnings, endX - widthPerInnings, widthPerInnings)) {
				gapPlayersPerX.increment(gx);
			}
			return [
				`M${startX},${startY}`,
				`L${startX + widthPerInnings},${gapY}`,
				`L${endX - widthPerInnings},${gapY}`,
				`L${endX},${endY}`
			]
		}));
	}

};

function playerPathGenerator(options) {
	const opts = Object.assign({}, options || {});
	const withPositions = !!opts.withPositions;
	const skipGaps = !!opts.skipGaps;

	return (player) => {
		let fnName = withPositions ? 'rowPerPosition' : 'rowPerPlayer';
		if (!skipGaps) {
			fnName += 'Gaps';
		}
		if (pathGenerators[fnName]) {
			return pathGenerators[fnName](player).join(' ');
		}
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
