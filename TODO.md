Things to do
============

* Basic rendering
	* Better handling of name labels in row-per-position mode
	* Colours
* Options
	* Toggle horizontal vs vertical
* Interaction
	* On line hover
		* Highlight line, player Name
		* Tooltip with basic stats?
	* On graph hover
		* Show line marker to align innings (as with ODI stats)
* Behind the scenes
	* Include data source in repo
	* Transpile ES6
* Optimisations
	* Ensure year labels don't overlap
	* Don't generate a gradient if captain/keeper colour is 100% of player's innings
	* Row-per-position mode:
		* Ensure player gap lines don't overlap in
		* Make year marker lines cover all player gap lines
		* Re-order DOM nodes so all gap lines are below others
		* Re-order DOM nodes so captain/keeper lines are above others
	* Row-per-player mode:
		* Fix position of year/name axis labels so they're always visible after scrolling
* Nice to have
	* New vis: Runs per position (toggle: as total runs or as % of team score)
