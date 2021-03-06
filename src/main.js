// Config

var dims = {
	widthPerInnings: 10,
	heightPerPlayer: 10,
	padding: 5,
	axisXHeight: 20,
	axisYWidth: 100,
};
var colours = {
	playerDefault: '#333',
	captain: 'hsl(120, 50%, 50%)',
	captainKeeper: 'hsl(75, 50%, 50%)',
	keeper: 'hsl(30, 50%, 50%)',
};


// Data holders

var allData;
var dom = {};
var helpers = {};
var h = helpers; // Shorthand for convenience
var options = {};


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
	data.inningsIds = data.matches.reduce((memo, match) => memo.concat(match.innings_ids), []);

	// Build a list of the first innings for each year, by index
	data.yearIndexes = [];
	let prevYear;
	data.matches.forEach(match => {
		let [year] = match.start_date.split('-');
		if (year !== prevYear) {
			let inningsId = match.innings_ids[0];
			let inningsIndex = data.inningsIds.indexOf(inningsId);
			data.yearIndexes.push({ year, inningsId, inningsIndex });
		}
		prevYear = year;
	});

	// Build a list of blocks of consecutive innings per player, based on total innings index
	data.players.forEach(player => {
		player.inningsById = mapByField(player.innings, 'innings_id');
		player.inningsBlocks = [];
		let curBlock = {};
		player.innings.forEach(inn => {
			let id = inn.innings_id;
			let index = data.inningsIds.indexOf(id);
			inn.total_index = index;
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
			curBlock.idList.push(data.inningsIds[index]);
			curBlock.end = index;
		});
		player.inningsBlocks.push(curBlock);
	});

	allData = data;
	console.log(data);
	setupControls();
	setupChart();
}

function setupChart() {
	var totalInningsWidth = dims.widthPerInnings * (allData.inningsIds.length - 1);
	var graphStartX = dims.padding + dims.axisYWidth;
	var graphStartY = dims.padding + dims.axisXHeight;

	helpers.x = d3.scaleLinear()
		.domain([0, allData.inningsIds.length - 1])
		.range([0, totalInningsWidth]);
	helpers.y = d3.scaleLinear()
		.domain([0, 11])
		.range([0, dims.heightPerPlayer * 11]);

	function append(selection, tagName = 'g', className = '', x = 0, y = 0) {
		var ret = selection.append(tagName)
			.attr('class', className);
		if (x || y) {
			ret.attr('transform', `translate(${x}, ${y})`);
		}
		return ret;
	}

	function dataChildren(selection, tagName = 'g', className = 'set-the-class-you-fool', data = [], dataKey) {
		return selection.selectAll(`.${className}`)
			.data(data, dataKey)
			.enter().append(tagName)
				.attr('class', className);
	}

	dom.root = d3.select('#shiny').append('svg')
		.attr('width', graphStartX + totalInningsWidth + dims.padding * 2) // TODO: Make this padding * 1, there's a bug
		.attr('height', graphStartY + dims.heightPerPlayer * allData.players.length + dims.padding);
	dom.defs = dom.root.append('defs');

	dom.axisX = append(dom.root, 'g', 'axis axis-x', graphStartX, dims.padding);
	dom.axisY = append(dom.root, 'g', 'axis axis-y', dims.padding, graphStartY);
	dom.gridX = append(dom.root, 'g', 'grid grid-x', graphStartX, graphStartY);
	dom.gridXLines = dataChildren(dom.gridX, 'line', 'grid-line', allData.yearIndexes, d => d.year);

	dom.main = append(dom.root, 'g', 'graph-main', graphStartX, graphStartY);
	// A 100% width/height rect behind all the graph lines ensures consistent mouse events for a <g> element
	dom.mouseFallback = append(dom.main, 'rect', 'hover-fallback')
		.attr('width', totalInningsWidth)
		.attr('height', '100%');
	dom.lines = dataChildren(dom.main, 'g', 'player-line', allData.players, d => d.info.id);
	dom.linesGap = append(dom.lines, 'path', 'player-line-gap');
	dom.linesPlaying = append(dom.lines, 'path', 'player-line-playing');

	dom.hovers = append(dom.root, 'g', 'graph-hovers', graphStartX, graphStartY);
	dom.hoverInnings = append(dom.hovers, 'line', 'hover-innings-mark')
		.attr('y1', '0')
		.attr('y2', '100%');

	dom.main.on('mousemove', graphHover);
	renderLines();
}


// Controls

function setOptionFromControl(input) {
	let value;
	if (input.type === 'checkbox') {
		value = input.checked;
	} else {
		value = input.value;
		if (value === 'true') value = true;
		if (value === 'false') value = false;
	}
	options[input.name] = value;
}

function controlSelected(e) {
	const input = e.target;
	setOptionFromControl(input);
	renderLines();
}

function setupControls() {
	const controls = document.getElementById('controls');
	controls.addEventListener('click', e => {
		if (e.target.nodeName === 'INPUT') {
			controlSelected(e);
		}
	}, false);

	// Find default values
	controls.querySelectorAll('input[checked]').forEach(input => {
		setOptionFromControl(input);
	});
}


// Interaction

let currentHoverX;
function graphHover() {
	const [x, y] = d3.mouse(dom.main.node());
	let nearestIndex = Math.round(h.x.invert(x));
	let newX = h.x(nearestIndex);
	if (newX !== currentHoverX) {
		dom.hoverInnings
			.attr('x1', newX)
			.attr('x2', newX);
		currentHoverX = newX;
	}
}


// Rendering

var gapPlayersPerX = new CounterMap();

var pathGenerators = {

	dot(x, y) {
		return [`M${x - 1},${y - 1}`, `M${x - 1},${y}`, `L${x + 1},${y}`];
	},

	rowPerPlayer(player) {
		return flatten(player.inningsBlocks.map(block => {
			const singleInning = (block.start === block.end);
			const start = h.x(block.start);
			const width = h.x(block.idList.length - 1);
			if (singleInning) {
				return pathGenerators.dot(start, 0);
			}
			return [`M${start},-1`, `M${start},0`, `l${width},0`];
		}));
	},

	rowPerPlayerGaps(player) {
		const start = h.x(player.inningsBlocks[0].start);
		const end = h.x(player.inningsBlocks[player.inningsBlocks.length - 1].end);
		return [`M${start},0`, `L${end},0`];
	},

	rowPerPosition(player) {
		return flatten(player.inningsBlocks.map((block, blockIndex) => {
			const singleInning = (block.start === block.end);
			return flatten(block.idList.map((innId, index) => {
				const inn = player.inningsById.get(innId);
				const x = h.x(block.start + index);
				const y = h.y(inn.batting_position);
				if (singleInning) {
					return pathGenerators.dot(x, y);
				}
				const command = index === 0 ? 'M' : 'L';
				let points = [`${command}${x},${y}`];
				if (index === 0 && blockIndex === 0) {
					// Ensure at least 1 pixel of height to allow gradient bounding boxes to work properly
					points.unshift(`${command}${x},${y - 1}`);
				}
				return points;
			}));
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
			const startX = h.x(gap.fromIndex);
			const startY = h.y(gap.fromPos);
			const endX = h.x(gap.toIndex);
			const endY = h.y(gap.toPos);
			const gapPlayers = gapPlayersPerX.get(gap.fromIndex + 1);
			const gapY = h.y(gapPlayers + 14);
			for (let gx of d3.range(gap.fromIndex + 1, gap.toIndex - 1)) {
				gapPlayersPerX.increment(gx);
			}
			return [
				`M${startX},${startY}`,
				`L${h.x(gap.fromIndex + 1)},${gapY}`,
				`L${h.x(gap.toIndex - 1)},${gapY}`,
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

var playerColourCache = new Map();

function playerColourGenerator(player) {
	let existing = playerColourCache.get(player.info.id);
	if (existing) {
		return existing;
	}

	let stops = [];
	let lastColour = colours.playerDefault;
	player.innings.forEach(inn => {
		let colour = colours.playerDefault;
		if (inn.captain) {
			colour = inn.keeper ? colours.captainKeeper : colours.captain;
		} else if (inn.keeper) {
			colour = colours.keeper;
		}
		if (colour !== lastColour) {
			stops.push({
				pos: inn.total_index,
				col: colour
			});
		}
		lastColour = colour;
	});
	if (stops.length === 0) {
		return colours.playerDefault;
	}

	// Don't bother with a gradient if the player only had one inning
	if (player.innings.length === 1) {
		return stops[0].col;
	}

	const gradId = 'grad-player-' + player.info.id;
	const gradUrl = `url(#${gradId})`;
	const firstIndex = first(player.innings).total_index;
	const indexDiff = last(player.innings).total_index - firstIndex;

	let grad = dom.defs.append('linearGradient')
		.attr('id', gradId);
	const addStop = (pos, col) => {
		const offset = (pos - firstIndex) / indexDiff * 100;
		grad.append('stop')
			.attr('offset', offset + '%')
			.attr('stop-color', col);
	};

	let prevStop;
	stops.forEach(stop => {
		if (!prevStop && (stop.pos - firstIndex) > 0) {
			addStop(stop.pos - 1, colours.playerDefault);
		}
		if (prevStop) {
			addStop(stop.pos - 1, prevStop.col);
		}
		addStop(stop.pos, stop.col);
		prevStop = stop;
	});

	playerColourCache.set(player.info.id, gradUrl);
	return gradUrl;
}

function renderLines() {
	const withPositions = options.display === 'per-position';
	const withGaps = !!options.gapLines;

	// X axis: Year markers
	let axisXTicks = dom.axisX.selectAll('.axis-tick')
		.data(allData.yearIndexes, d => d.year);

	let newTicks = axisXTicks.enter().append('g')
		.attr('class', 'axis-tick');
	newTicks.append('text')
		.attr('class', 'axis-tick-year')
		.attr('dy', '0.35em')
		.attr('text-anchor', 'middle')
		.text(d => d.year);

	axisXTicks.merge(newTicks)
		.attr('transform', d => `translate(${h.x(d.inningsIndex)}, ${dims.axisXHeight / 2})`);

	dom.gridXLines
		.attr('transform', d => `translate(${h.x(d.inningsIndex)}, 0)`)
		.attr('x1', 0).attr('y1', 0)
		.attr('x2', 0).attr('y2', d => h.y(withPositions ? 20 : allData.players.length));

	// Y axis: Player names
	dom.axisY.classed('hidden', withPositions);
	if (!withPositions) {
		let axisYTicks = dom.axisY.selectAll('.axis-tick')
			.data(allData.players, d => d.info.id);

		let newTicks = axisYTicks.enter().append('g')
			.attr('class', 'axis-tick');
		newTicks.append('text')
			.attr('class', 'axis-tick-name')
			.attr('dy', '0.35em')
			.style('font-size', dims.heightPerPlayer + 'px')
			.text(d => d.info.name);

		axisYTicks.merge(newTicks)
			.attr('transform', (d, i) => `translate(0, ${h.y(i + 0.5)})`);
	}

	// Player lines
	dom.lines
		.attr('transform', (d, i) => withPositions ? '' : `translate(0, ${h.y(i + 0.5)})`);
	dom.linesGap.classed('hidden', !withGaps);
	if (withGaps) {
		dom.linesGap.attr('d', playerPathGenerator({ withPositions, skipGaps: false }));
	}
	dom.linesPlaying
		.attr('d', playerPathGenerator({ withPositions, skipGaps: true }))
		.attr('stroke', playerColourGenerator);
}

d3.json('/cricinfo-scripts/project-players-over-time/data/player-data.json', parseData);
