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

            if (!res) {
                console.log("cache on "+domain+":"+key+": MISS")
                return cb(null, null);
            }
            try { res = JSON.parse(res) } catch(e) { cb(e) }

            red.hget('expiry:'+domain, key, function(err, expiry) {
                if (err) return cb(err)

                expiry = expiry ? parseInt(expiry) : null

                var upToDate = expiry ? (Date.now()/1000 < expiry) : true

                console.log("cache on "+domain+":"+key+": "+(res ? "HIT" : "MISS")+" upToDate: "+upToDate);

                cb(null, res, upToDate)
            })
        })
    };
    cacheSet = function (domain, key, value, ttl, cb) {
        red.set(domain+":"+key, JSON.stringify(value), function(e)
        {
            if (e) return cb(e)

            if (ttl) red.hset('expiry:'+domain, key, Math.floor((Date.now()+ttl)/1000), cb)
            else cb()
        })
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
