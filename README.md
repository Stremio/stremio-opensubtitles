# stremio-opensubtitles

OpenSubtitles add-on for Stremio.

Functionalities include:

* Find subtitle files for the currently playing video
* Calculate opensubtitles video hash for currently playing video
* Load and parse an srt file into individual tracks

## Using with Stremio

This add-on is hosted at [opensubtitles.strem.io](http://opensubtitles.strem.io/stremio/v1) so you can go ahead and install it from there. 

Alternatively, you can run locally by:

```
git clone git@bitbucket.org:stremio/stremio-opensubtitles.git
cd stremio-opensubtitles
npm install
npm start
open http://localhost:3011/stremio/v1 # open in browser, install from there
```

## Proxying to `vtt` or `srt`

Often when building web applications, or doing casting to limited devices, it's important that we can serve a clean, UTF8 encoded `.srt` or `.vtt` file, often with CORS support.

This add-on has a function which it exports called `proxySrtOrVtt` which would proxy any URL to an `srt` or `vtt`, which may be zipped or gzipped, to a UTF8-encoded VTT or SRT.

How to use with connect/express:

```javascript
var subtitles = require("stremio-opensubtitles");
app.get("/subtitles.:ext", subtitles.proxySrtOrVtt);
```

Example on the front-end:

```javascript
fetch("http://localhost:8080/subtitles.vtt?from="+encodeURIComponent(urlToOpenSubtitlesGz))
.then(function(res) {  /* res will be an array of all subtitle tracks */})
.catch(function(e) { console.error(e) })
```

*NOTE:* in standalone mode (running via `npm start`), those endpoints (`/subtitles.vtt`, `/subtitles.srt`) will be accessible by default.

## Expose `subtitles.hash`

By default, this function is not exposed, because Stremio can possibly send `subtitles.hash` calls for `localhost:11470...` addresses, which this add-on cannot access when it's hosted remotely. 

The local instance of this add-on will expose this method by using this code:

```javascript
var subtitles = require('stremio-opensubtitles');
subtitles.methods['subtitles.hash'] = subtitles.subtitlesHash;
```


## Using with caching

Set the ``REDIS`` environment variable to a ``redis://`` link in order to enable caching.

Use ``CACHING_LOG`` env var (set to any value) to debug caching



## Building and deploying

``npm run docker-build``

``npm run docker-push``

