'use strict';

// Minimal stand-in for the slice of the `obsidian` module that main.js touches
// outside of onload() — just enough to load the plugin class under Node and
// exercise run()/backup() without a running Obsidian app.

class Plugin {}

class PluginSettingTab {
	constructor(app, plugin) {
		this.app = app;
		this.plugin = plugin;
	}
}

class Setting {
	setName() { return this; }
	setDesc() { return this; }
	addText() { return this; }
	addToggle() { return this; }
}

class Notice {
	constructor(message) {
		this.message = message;
		Notice.sent.push(message);
	}
}
Notice.sent = [];

function normalizePath(p) {
	return p;
}

module.exports = { Plugin, PluginSettingTab, Setting, Notice, normalizePath };
