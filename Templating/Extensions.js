var pa = require('path');
var fs = require('fs');
var glob = require('glob');

var Extensions = function(kernel, cache) {
	this.kernel = kernel;
	this.cache = cache;
};
Extensions.prototype = {
	kernel: null,
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
