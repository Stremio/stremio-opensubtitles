var async = require("async"),
	_ = require("underscore"),
	xmlrpc = require("xmlrpc");

//var OS = require("opensubtitles-api");
//var OpenSubtitles = new OS("NodeOpensubtitles v0.0.1");

var LANG_MAP = {
	"albanian":"sqi","arabic":"ara","bengali":"ben","bulgarian":"bul","bosnian":"bos","chinese":"zho","croatian":"hrv","czech":"cze",
	"danish":"dan","dutch":"nld","english":"eng","estonian":"est","farsi-persian":"per","finnish":"fin","french":"fre","german":"ger",
	"greek":"gre","hebrew":"heb","hungarian":"hun","indonesian":"ind","italian":"ita","japanese":"jpn","korean":"kor","lithuanian":"lit",
	"macedonian":"mkd","malay":"msa","norwegian":"nor","polish":"pol","portuguese":"por","romanian":"rum","russian":"rus","serbian":"srp",
	"slovenian":"slv","spanish":"spa","swedish":"swe","thai":"tha","turkish":"tur","urdu":"urd","ukrainian":"ukr","vietnamese":"vie", "brazilian-portuguese": "por"
};

// Internal functions - interacting with OpenSubtitles
var client = xmlrpc.createClient("http://api.opensubtitles.org/xml-rpc");

client.options.headers['User-Agent'] = 'Stremio-addon-fetch'


var MAX_RETRIES = 3;
var RETRY_PERIOD = 200; // ms
function opensubRequest(method, args, cb, retries) 
{
	retries = retries || 0;

	client.methodCall(method, args, function(err, res) {
		var retry = err || (method=="SearchSubtitles" && !(res && res.data));
		if (retry && retries>=MAX_RETRIES) return cb(err); // Give up

		if (retry) return setTimeout(function() { opensubRequest(method, args, cb, ++retries) }, RETRY_PERIOD);

		cb(err, res);
	});
};


var token = null;
function opensubToken(cb)
{
	if (token) return cb(null, token);

	debugLog("subtitles-crawler: getting opensubtitles token");
	// TODO: maybe implement token caching here
	opensubRequest("LogIn", ["", "", "en", "NodeOpensubtitles v0.0.1"], function(err, res) {
		if (err || !(res && res.token)) console.error("err, res:", err, res);

		if (err) return cb(err);
		if (! (res && res.token)) return cb(new Error("opensubToken: blank result returned from opensubtitles"));
		
		token = res.token;
		setTimeout(function() { token = null }, 30*60*1000);

		cb(err, res.token);
	});
};

/* Internal functions - subtitles related
 *  pickSubtitles(query, results from opensubtitles, results from yifi, instance of Subtitles, callback(err, instance of Subtitles))
 */
function pickSubtitles(query, res, subtitles) 
{
	if (! Array.isArray(res)) {
		subtitles.all = Array.isArray(subtitles.all) ? subtitles.all : []
		return subtitles
	}
	/* We don't support other subtitle formats; may be permanent if we have enough subtitles 
	 * TODO: sort by user rank, this might help
	 * also, filtering by parsing the subtitle file name and moviename might help if needed
	 * also, comparing moviefps can be +1 factor
	 * !! sub.MovieTimeMS - would be great but isn't used 
	 */

	res = res.filter(function(subtitle) { return subtitle.SubFormat == "srt" });

	// Remove subtitles with cd1/cd2 tags
	res = res.filter(function(subtitle) { 
		return !subtitle.SubFileName.match(/cd(.| )1|cd(.| )2/i);
	});

	res = res.filter(function(sub) {
		if (query.meta && ((parseInt(sub.SeriesIMDBParent, 10) || parseInt(sub.IDMovieImdb, 10)) != parseInt(query.meta.imdb_id.slice(2), 10))) return false;

		if (sub.SeriesIMDBParent!="0" && sub.hasOwnProperty("SeriesSeason") 
			&& (query.meta && (sub.SeriesSeason!=query.meta.season || sub.SeriesEpisode!=query.meta.episode))
		) return false;
		return true;
	});
	debugLog("subtitles-crawler: "+res.length+" subtitles remained after filtering");

	/* Filter all the results that were matched in the metadata-based query; 
	 * that way we exclude matches by hash that are wrong
	 */
	//var matchedIds = _.indexBy(resQuery.data, "IDSubtitleFile");
	//res = res.filter(function(x) { return matchedIds[x.IDSubtitleFile] });


	/*
	 * First, apply a sort - moviehash / download count
	 * Then convert langs into a map of language->[subtitles for this language by priority]
	 * 
	 * After this implement a function getSubtitlesBuffer() and re-use if it needed in the async.each loop
	 */
	var dominantGroup = null;
	var groups = _.chain(res).countBy("SubTSGroupHash").pairs().sort(function(x) { return x[1] }).value();
	var group = groups[groups.length - 1];
	if (group && group[1] > res.length * 0.7) dominantGroup = group[0];
	res.sort(function(b, a) {
		return 
			((a.SubTSGroupHash == dominantGroup) - (b.SubTSGroupHash == dominantGroup))
			|| ((a.MatchedBy == "moviehash") - (b.MatchedBy == "moviehash"))
			|| parseInt(a.SubDownloadsCnt) - parseInt(b.SubDownloadsCnt)
		// also use MovieReleaseName
	});
	//console.log(res)
	res = _.uniq(res, false, function(x) { return x.IDSubtitle }); // de-duplication after the sorting

    subtitles.all = res.map(function(x) { 
    	return { 
			id: x.IDSubtitle, 
			url: x.SubDownloadLink && x.SubDownloadLink.replace("download/","download/subencoding-utf8/"),
			lang: x.SubLanguageID,
			m: x.MatchedBy == "moviehash" ? "h" : "i",
			g: x.SubTSGroup,
		}
    });

    debugLog("subtitles-crawler: found from opensubtitles "+subtitles.all.length+" subtitles, dominant group: "+dominantGroup);

	return subtitles;
};

function debugLog()
{
	//optimist.argv["subtitles-crawler-debug"] && console.log.apply(console, arguments)
	console.log.apply(console, arguments);
};

/* Exported functions
 * alternativeFind - alternative search, Jean's opensubtitles-api module
 */
 /*
function alternativeFind(query, callback, retries) {

	retries = retries || 0;

	OpenSubtitles.login().then( function(token) {
		OpenSubtitles.search({
			sublanguageid: 'all',
			hash: query.movieHash || null,
			filesize: query.movieByteSize || null,
			filename: query.tag || null,
			extensions: ['srt', 'vtt'],
			limit: 'best',
			imdbid: query.meta && query.meta.imdb_id ? query.meta.imdb_id : null,
			season: query.meta && query.meta.season ? query.meta.season : null,
			episode: query.meta && query.meta.episode ? query.meta.episode : null
		}).then( function(subtitles) {

			debugLog("subtitles-crawler: found "+_.size(subtitles)+" subtitle submissions for "+query.hash+" / "+query.tag);

			var langRes = {};
			_.each( subtitles, function(el) {
				var iso6391 = LANG_MAP[el.langName.toLowerCase()];
				langRes[iso6391 || el.langName] = [{
					id: el.id,
					url: el.url.replace('/filead/', '/subencoding-utf8/filead/') + '.gz',
					lang: iso6391 || el.langName
				}];
			});

			callback(null, {
				subtitles: langRes,
				item_hash: query.item_hash,
				id: query.item_hash.split(' ').join('-')
			});

		}).catch(function(err){
			if (retries >= MAX_RETRIES) return callback(err); // Give up
			retries++;
			alternativeFind(query, callback, retries);
		});
	});
}
*/


/* Exported functions
 * findSubtitles - can take anything from 600ms to 3000ms
 */
function findSubtitles(args, callback)
{
	var id = args.hash ? args.hash : (args.query.videoHash || args.query.itemHash || args.query.item_hash);

	var query = args || { }; // for now
	callback = _.once(callback);
	
	// new format 
	if (args.query) {
		// if (! args.query.itemHash) return callback({ code: 12, message: "query.itemHash required" });

		query.hash = args.query.itemHash || args.query.videoHash || args.query.videoName;
		var split = args.query.itemHash ? args.query.itemHash.split(" ") : [];
		query.meta = split.length > 0 ? (split.length > 1 ? { imdb_id: split[0], season: parseInt(split[1]), episode: parseInt(split[2]) } : { imdb_id: split[0] }) : null;
		
		if (args.query.videoHash) query.movieHash = args.query.videoHash;
		if (args.query.videoSize) query.movieByteSize = args.query.videoSize.toString();
		if (args.query.videoName) query.tag = args.query.videoName;
	}

	// old format
	// if (! query.hash) return callback({ code: 10, message: "findSubtitles requires hash" });
	// if (! (query.meta && query.meta.imdb_id)) return callback({ code: 11, message: "findSubtitles requires item metadata (imdb_id, ?season, ?episode)" });

	var subtitles = { id: id };

	debugLog("subtitles-crawler: retrieving subtitles for "+query.hash);

	/*
	if (args.altFind || process.env.ALT_FIND) {
		alternativeFind(query, callback);
		return;
	}
	*/
	
	var hashQuery = query.movieHash ? {
			moviebytesize: parseInt(query.movieByteSize),
			moviehash: query.movieHash,
			sublanguageid: null
	} : null;
	
	var metaQuery = (query.meta && typeof(query.meta.imdb_id) === 'string' && query.meta.imdb_id.indexOf('tt') === 0) ? {
		imdbid: query.meta.imdb_id.slice(2),
		sublanguageid: null
	} : null;

	if (!hashQuery && !metaQuery) {
		subtitles.all = []
		callback(null, subtitles);
		return
	}

	if (metaQuery && query.meta.hasOwnProperty("season")) _.extend(metaQuery, _.pick(query.meta, "season", "episode"));

	async.auto({
		token: function(cb) { opensubToken(cb) },
		retrieve: ["token", function(cb, res) {
			// pass sublanguageid if we want to narrow down to languages

			debugLog("subtitles-crawler: querying opensubtitles for "+query.hash, hashQuery, metaQuery);
			// TODO: two separate requests with 50-60 limit each?
			opensubRequest("SearchSubtitles", [res.token, [hashQuery, metaQuery].filter(function(x) { return x }), { limit: 100 } ], cb);
		}],
		pick: ["retrieve", function(cb, res) {
			if (! (res.retrieve && res.retrieve.data)) return cb(new Error("empty result returned from SearchSubtitles"));

			debugLog("subtitles-crawler: found "+res.retrieve.data.length+" subtitle submissions for "+query.hash+" / "+query.tag);
			pickSubtitles(query, res.retrieve.data, subtitles);
			cb();
		}] 
	}, function(err) { callback(err, subtitles) });
};

module.exports = findSubtitles;
