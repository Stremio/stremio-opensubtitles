var subRetriever = require("subtitles-grouping/lib/retriever");
var subParser = require("subtitles-grouping/lib/srt").parseString;

function tracks(args, callback) {
	if (typeof(args.url) !== "string") return callback(new Error("pass .url"));

	subRetriever.retrieveSrt(args.url, function(err, buf) {
		if (err) return callback(err);
		try { 
			var tracks = subParser(buf.toString());
		} catch(e) { callback(e); }

		callback(null, { 
			url: args.url,
			tracks: Object.keys(tracks).map(function(key) { return tracks[key] }).filter(applyBlacklist)
		});
	});
};

/* Used by the next function to clear out "meta-tracks" - tracks such as "best watched using .. player" or "sync & corrections by"
 */
function blacklistTracks(condition)
{
	return function(track, i, tracks)
	{
		//var trackPos = i/tracks.length; // relative pos
		//if (! (trackPos > 0.80 || trackPos < 0.20)) return true; // apply conditions only to start/end tracks
		return typeof(condition) == "function" ?
			condition(track, i, tracks)
			: !track.text.match(condition)
	};
}

function applyBlacklist(track, i, tracks)
{
	return blacklistTracks(/best watched using/i)(track, i, tracks)
		&& blacklistTracks(/subtitle(s?) downloaded/i)(track, i, tracks)
		&& blacklistTracks(/subtitle(s?) by/i)(track, i, tracks)
		&& blacklistTracks(/subtitle(s?) provided by/)(track, i, tracks)
		&& blacklistTracks(/sync by/i)(track, i, tracks)
		&& blacklistTracks(/opensubtitles/i)(track, i, tracks)
		&& blacklistTracks(/unacs team/i)(track, i, tracks)
		&& blacklistTracks(/TVShow Time/)(track, i, tracks)
		&& blacklistTracks(/addic7ed/i)(track, i, tracks)
		&& blacklistTracks(/osdb.link/i)(track, i, tracks)
		&& blacklistTracks(/filebot.net/i)(track, i, tracks)
		&& blacklistTracks(/seedr.cc/i)(track, i, tracks)
		&& blacklistTracks(/seedr.io/i)(track, i, tracks)
		&& blacklistTracks(/organize your media and download subtitles/i)(track, i, tracks)
		&& blacklistTracks(function(track) { return !(track.text.match(/sync/i) && track.text.match(/correct/i)) })(track, i, tracks);
} 

module.exports = tracks;
