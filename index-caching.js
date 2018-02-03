var service = require("./index")
var http = require("http")

// Caching for stremio-opensubtitles
if (process.env.META_DB_REDIS || process.env.REDIS) {
	// In redis
	console.log("Using redis caching for OpenSubtitles");

	var redis = require("redis");
	red = redis.createClient(process.env.META_DB_REDIS || process.env.REDIS);
	red.on("error", function(err) { console.error("redis err",err) });

	var cacheGet, cacheSet;
	cacheGet = function (domain, key, cb) { 
		red.get(domain+":"+key, function(err, res) { 
			if (err) return cb(err);
			if (process.env.CACHING_LOG) console.log("cache on "+domain+":"+key+": "+(res ? "HIT" : "MISS"));
			if (!res) return cb(null, null);
			try { cb(null, JSON.parse(res)) } catch(e) { cb(e) }
		});
	};
	cacheSet = function (domain, key, value, ttl) {
		var k = domain+":"+key
		if (ttl) red.setex(k, ttl/1000, JSON.stringify(value), function(e) { if (e) console.error(e) });
		else red.set(k, JSON.stringify(value), function(e) { if (e) console.error(e) });
	}

	service.setCaching(cacheGet, cacheSet);
}


var server = http.createServer(function (req, res) {
	if (req.url.match("^/subtitles.vtt") || req.url.match("^/subtitles.srt")) return service.proxySrtOrVtt(req, res);
	service.middleware(req, res, function() { res.end() });
}).listen(process.env.PORT || 3011).on("listening", function()
{
	console.log("OpenSubtitles (with redis caching) listening on "+server.address().port);
});	
server.on("error", function(e) { console.error(e) });
