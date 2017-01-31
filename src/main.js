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
		.enter().append('path')
			.attr('class', 'player-line');

	renderLines();
}


// Rendering

function playerPathGenerator(options) {
	var opts = Object.assign({}, options || {});
	var withPositions = !!opts.withPositions;

	return (player) => {
		let path = [];
		player.inningsBlocks.forEach(block => {
			let start = block.start * widthPerInnings;
			if (!withPositions) {
				let width = block.idList.length * widthPerInnings;
				path.push(`M${start},0`, `l${width},0`);
				return;
			}

			block.idList.forEach((innId, index) => {
				let inn = player.inningsById.get(innId);
				let pos = inn.batting_position * heightPerPlayer;
				let x = start + index * widthPerInnings;
				let command = index === 0 ? 'M' : 'L';
				path.push(`${command}${x},${pos}`);
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
		.attr('d', playerPathGenerator({ withPositions }))
}

d3.json('/cricinfo-scripts/project-players-over-time/data/player-data.json', parseData);
