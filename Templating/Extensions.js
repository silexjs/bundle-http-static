var pa = require('path');
var fs = require('fs');
var crypto = require('crypto');

var glob = require('glob');
var escapeStringRegexp = require('escape-string-regexp');
var uglifyJs = require('uglify-js');
var CleanCss = require('clean-css');


var Extensions = function(kernel, config, cache) {
	this.kernel = kernel;
	this.compression = config.get('http.static.compression', {});
	if(this.compression.extentions === undefined) { this.compression.extentions = {}; }
	this.cache = cache;
};
Extensions.prototype = {
	kernel: null,
	compression: null,
	cache: null,
	routing: null,
	
	onTemplatingConfig: function(next, templating) {
		if(templating.name !== 'swig') {
			return;
		}
		var self = this;
		var swig = templating.swig;
		swig.setTag('public', function(str, line, parser, types) {
			return true;
		}, function(compiler, args, content, parent, options, blockName) {
			return [
				'(function() {',
				'	var publicSave = _ctx.public;',
				'	var list = _ext.SilexHttpStaticBundle_public('+args.join(', ')+'), listLength = list.length;',
				'	for(var i=0; i<listLength; i++) {',
				'		_ctx.public = list[i]',
				'		'+compiler(content, parent, options, blockName),
				'	}',
				'	_ctx.public = publicSave;',
				'})();',
			].join('\n');
		}, true);
		swig.setExtension('SilexHttpStaticBundle_public', function() {
			var queries = [];
			var argumentsLength = arguments.length;
			for(var i=0; i<argumentsLength; i++) {
				if(arguments[i] instanceof Array) {
					queries = queries.concat(arguments[i]);
				} else {
					queries.push(arguments[i]);
				}
			}
			var cacheKey = 'SilexHttpStaticBundle.templating.public.'+queries.join('<>');
			var cacheValue = self.cache.get(cacheKey);
			if(cacheValue === undefined) {
				var list = {};
				for(var i in queries) {
					if(queries[i][0] === '@') {
						var search = self.kernel.searchBundle(queries[i], 'SWIG.HTTP-STATIC', queries[i]);
					} else {
						var search = self.kernel.dir.app+'/Resources/public'+(queries[i][0]!=='/'?'/':'')+queries[i];
					}
					var files = glob.sync(search);
					for(var ii in files) {
						var url = self.getUrlRouteFile(files[ii]);
						if(url !== false) {
							list[files[ii]] = {
								url: url,
								path: files[ii],
								basename: pa.basename(files[ii]),
								ext: pa.extname(files[ii]),
							};
						} else {
							list[files[ii]] = undefined; 
						}
					}
				}
				var listArray = [];
				for(var key in list) {
					if(list[key] === undefined) { continue; }
					listArray.push(list[key]);
				}
				
				if(self.compression.enable === true || (self.compression.enable === undefined && self.kernel.env !== 'development')) {
					var compression = true;
					var ext = null;
					var filesCompress = [];
					for(var i in listArray) {
						var file = listArray[i];
						if(ext !== null && file.ext !== ext) {
							compression = false;
							break;
						}
						ext = file.ext;
						filesCompress.push(file.path);
					}
					if(compression === true && ext !== null) {
						var dirCache = (self.kernel.dir.app+'/Resources/public/cache/').replace(/\\/g, '/');
						try {
							fs.statSync(dirCache);
						} catch(e) {
							fs.mkdirSync(dirCache);
						}
						var hash = crypto.createHash('sha1').update(key).digest('hex');
						var fileBasename = hash+ext;
						var filePath = dirCache+fileBasename;
						var fileRoute = self.getUrlRouteFile(filePath);
						var dataWrite = null;
						if(ext === '.js' && self.compression.extentions.js !== false) {
							var result = uglifyJs.minify(filesCompress, {
								compress: false,
							});
							dataWrite = result.code;
						} else if(ext === '.css' && self.compression.extentions.css !== false) {
							var cssFile = '';
							var regexIG = /url\([\s'"]*([^"'\(\)]+)[\s'"]*\)/ig;
							var regexI = /url\([\s'"]*([^"'\(\)]+)[\s'"]*\)/i;
							for(var i in listArray) {
								var file = listArray[i];
								var css = fs.readFileSync(file.path).toString();
								var matchs = css.match(regexIG);
								if(matchs !== null) {
									for(var i in matchs) {
										var match = matchs[i];
										var url = match.match(regexI)[1];
										if(url[0] !== '/') {
											var urlReplace = pa.join(pa.dirname(file.url), url).replace(/\\/g, '/');
											var cssNewUrl = match.replace(url, urlReplace);
											css = css.replace(new RegExp(escapeStringRegexp(match), 'ig'), cssNewUrl);
										}
									}
								}
								cssFile += css+'\n\n';
							}
							dataWrite = new CleanCss({ keepSpecialComments: 0 }).minify(cssFile).styles;
						}
						if(dataWrite !== null) {
							fs.writeFileSync(filePath, dataWrite);
							listArray = [{
								url: fileRoute,
								path: filePath,
								basename: fileBasename,
								ext: ext,
							}];
						}
					}
				}
				if(self.kernel.debug === false) {
					self.cache.set(cacheKey, listArray);
				}
				return listArray;
			} else {
				return cacheValue;
			}
		});
		next();
	},
	
	getUrlRouteFile: function(filePath) {
		if(this.routing === null) { this.routing = this.kernel.container.get('routing'); }
		for(var routeName in this.routing.compiledRoutes) {
			var config = this.routing.compiledRoutes[routeName].config;
			if(config.type !== 'static') {
				continue;
			}
			if(config.dir === filePath.substr(0, config.dir.length)) {
				return this.routing.generate(routeName, { path: filePath.substr(config.dir.length+1) });
			}
		}
		return false;
	}
};


module.exports = Extensions;
