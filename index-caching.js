var service = require("./index")
var http = require("http")

// Caching for stremio-opensubtitles
var redisUrl = process.env.DB_REDIS || process.env.META_DB_REDIS || process.env.REDIS
if (redisUrl) {
	// In redis
	console.log("Using redis caching for OpenSubtitles");

	const db_connections = require("stremio-db-connections")
	red = db_connections.redisClient()
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
