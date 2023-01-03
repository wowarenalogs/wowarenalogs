'use strict';
var writeMatchStubHandler = require('./dist/cloud/src/writeMatchStubHandler.js');
var refreshSpellIconsHandler = require('./dist/cloud/src/refreshSpellIconsHandler.js');
var refreshCompetitiveStatsHandler = require('./dist/cloud/src/refreshCompetitiveStatsHandler.js');
module.exports.writeMatchStubHandler = writeMatchStubHandler.handler;
module.exports.refreshSpellIconsHandler = refreshSpellIconsHandler.handler;
module.exports.refreshCompetitiveStatsHandler = refreshCompetitiveStatsHandler.handler;
