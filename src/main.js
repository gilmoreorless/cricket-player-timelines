var allData;
var chartBits = {};

// Config

var widthPerInnings = 2;
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
		player.inningsBlocks = [];
		let curBlock = {};
		player.innings.forEach(inn => {
			let id = inn.innings_id;
			let index = data.innings.indexOf(id);
			if (curBlock.end) {
				// If there's a gap between innings, start a new block
				if (index > curBlock.end + 1) {
					player.inningsBlocks.push(curBlock);
					curBlock = {};
				}
			}

			if (!curBlock.start) {
				curBlock.start = index;
				curBlock.list = [];
			}
			curBlock.list.push(index);
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
		.enter().append('path')
			.attr('class', 'player-line');

	renderLines();
}


// Rendering

function playerPathGenerator(player) {
	var path = [];
	player.inningsBlocks.forEach(block => {
		let start = block.start * widthPerInnings;
		let width = block.list.length * widthPerInnings;
		path.push(`M ${start},0`, `l ${width},0`);
	});
	return path.join(' ');
}

function renderLines() {
	// TODO: Switch display modes
	chartBits.lines
		.attr('transform', (d, i) => `translate(0, ${i * heightPerPlayer + heightPerPlayer / 2})`)
		.attr('d', playerPathGenerator)
}

d3.json('/cricinfo-scripts/project-players-over-time/data/player-data.json', parseData);
