var addons = require("stremio-addons");
var http = require("http");
var _ = require("underscore");
var moment = require("moment");
var url = require("url");

/* Basic glue
 */
var find = require("./lib/find");
var tracks = require("./lib/tracks");
var hash = require("./lib/hash");

var KEY = "subtitles-v4"

var TTL_HOURS_WHEN_SMALL_RESP = 6
var TTL_HOURS_WHEN_MEDIUM_RESP = 24
var TTL_HOURS_WHEN_LARGE_RESP = 14 * 24

var cacheGet, cacheSet;

// In memory, allow this to be overridden
cacheGet = function (domain, key, cb) { cb(null, null) }
cacheSet = function(domain, key, value, ttl) { }

const PROXY_URL = 'https://subs5.strem.io'

function rewriteUrl(url) {
	const fileId = url.replace('.gz', '').split('/').pop()
	if (isNaN(fileId)) throw 'unable to get file id from '+url
	// subencoding-stremio-utf8 forces our proxy to always reencode
	return PROXY_URL+'/en/download/subencoding-stremio-utf8/src-api/file/'+fileId
}

function subsFindCached(args, cb) {
	if (! args) return cb({ code: 14, message: "args required" });
	if (! (args.query || args.hash)) return cb({ code: 13, message: "query/hash required" });

	var id = args.hash ? args.hash : (args.query.videoHash || args.query.itemHash || args.query.item_hash); // item_hash is the obsolete property

	function prep(subtitles) {
		// This is a legacy property that is no longer needed
		// we do not return zip results anymore
		//if (!args.supportsZip) subtitles.all = subtitles.all.filter(function(sub) { return sub.url && !sub.url.match("zip$") });
		subtitles.all = subtitles.all.map(function(s) {
			s.url = rewriteUrl(s.url)
			return s
		})
		return subtitles;
	}

	cacheGet(KEY, id, function(err, subs, upToDate) {
		if (err) console.error(err);

		if (subs && upToDate) return cb(null, prep(subs));

		find(args, function(err, res) {
			if (err || !res) {
				return cb(err, subs ? prep(subs) : res);
			}

			// Do not serve .zip subtitles unless we explicitly allow it
			var count = res.all.length;

			if (!count && subs && subs.all.length) {
				cb(null, prep(subs))
				return
			}

			var mostByMeta = (res.all.filter(function(x) { return x.m === "i" }).length / res.all.length) > 0.9;
			var ttlHours = (count < 10 || mostByMeta) ? TTL_HOURS_WHEN_SMALL_RESP : (count < 50 ? TTL_HOURS_WHEN_MEDIUM_RESP : TTL_HOURS_WHEN_LARGE_RESP )
			cacheSet(KEY, id, res, ttlHours * 60 * 60 * 1000, function(err) {
				if (err) console.error(err)
			})

			cb(err, prep(res));
		});
	});
}

function subsGet(args, cb) {
	subsFindCached(args, function(err, res) {
		if (err) return cb(err)

		res.item_hash = args.item_hash
		res.subtitles = _.groupBy(res.all, "lang")
		delete res.all
		cb(null, res)
	})
}

var manifest = {
	"name": "OpenSubtitles",
	"id": "org.stremio.opensubtitles", 
	"description": "The official add-on for subtitles from OpenSubtitles",
	"version": require("./package").version,
	"types": ["series","movie", "other"],
	"endpoint": "http://opensubtitles.strem.io/stremioget/stremio/v1",
	"logo": "http://www.strem.io/images/addons/opensubtitles-logo.png"
};

var service = new addons.Server({
	"subtitles.get": subsGet,
	"subtitles.find": subsFindCached,
	//"subtitles.tracks": tracks,
	//"subtitles.hash": hash, // don't expose this, as stremio will send links to localhost:11470, which are not accessible when this add-on is hosted remotely
	"stats.get": function(args, cb, user) {

		var pkg = require("./package"); 
		cb(null, { name: pkg.name, version: pkg.version, stats: [{name: "subtitles", colour:"green"}], statsNum: "~ 3000000 subtitle files" });
	}
},  { stremioget: true, allow: ["http://api9.strem.io"] }, manifest);

service.proxySrtOrVtt = function(req, res) {
	// req.params.delay
	var isVtt = req.url.match('^/subtitles.vtt'); // we can set it to false for srt
	var query = url.parse(req.url, true).query;
	var offset = query.offset ? parseInt(query.offset) : null;
	service.request("subtitles.tracks", [{ stremioget: true }, { url: query.from }], function(err, handle) {
		if (err) {
			console.error(err);
			res.writeHead(500);
			res.end();
			return;
		}
		if (isVtt) res.write("WEBVTT\n\n");
		var format = function(d) {
			return isVtt ? moment(d).utcOffset(0).format("HH:mm:ss.SSS") : moment(d).utcOffset(0).format("HH:mm:ss,SSS")
		};
		var applOffset = offset ? function(d) { return new Date(new Date(d).getTime() + offset) } : function(d) { return new Date(d); };
		handle.tracks.forEach(function(track, i) {
			res.write(i.toString()+"\n");
			res.write(format(applOffset(track.startTime)) + " --> " + format(applOffset(track.endTime)) +"\n");
			res.write(track.text.replace(/&/g, "&amp;")+"\n\n"); // TODO: sanitize?
		});
		res.end();
	});
}
service.subtitlesHash = hash;
module.exports = service;

module.exports.setCaching = function(get, set) {
	cacheGet = get;
	cacheSet = set;
}

/* Init server
 */
if (require.main !== module) { module.exports = service; } else {
	var server = http.createServer(function (req, res) {
          if (req.url.match("^/subtitles.vtt") || req.url.match("^/subtitles.srt")) return service.proxySrtOrVtt(req, res);
	  service.middleware(req, res, function() { res.end() });
	}).listen(process.env.PORT || 3011).on("listening", function()
	{
		console.log("Subtitles listening on "+server.address().port);
	});	
	server.on("error", function(e) { console.error(e) });
}
