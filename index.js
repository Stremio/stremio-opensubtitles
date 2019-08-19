var addons = require("stremio-addons");
var http = require("http");
var _ = require("underscore");

/* Basic glue
 */
var find = require("./lib/find");

var KEY = "subtitles-v4"

var TTL_HOURS_WHEN_SMALL_RESP = 8
var TTL_HOURS_WHEN_MEDIUM_RESP = 30
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
				if (subs) {
					if (err) console.log(err, err.body)
					return cb(null, prep(subs))
				} else {
					return cb(err, null);
				}
			}

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
	"stats.get": function(args, cb, user) {
		var pkg = require("./package"); 
		cb(null, { name: pkg.name, version: pkg.version, stats: [{name: "subtitles", colour:"green"}], statsNum: "~ 3000000 subtitle files" });
	}
},  { stremioget: true, allow: ["http://api9.strem.io"] }, manifest);

var server = http.createServer(function (req, res) {
  service.middleware(req, res, function() { res.end() });
}).listen(process.env.PORT || 3011).on("listening", function()
{
	console.log("Subtitles listening on "+server.address().port);
});
server.on("error", function(e) { console.error(e) });

module.exports = service
