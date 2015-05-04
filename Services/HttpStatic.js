var pa = require('path');
var fs = require('fs');
var zlib = require('zlib');
var mime = require('mime-types');
var glob = require('glob');

var ErrorHttpNotFound = USE('Silex.HttpServerBundle.Error.HttpNotFound');


var HttpStatic = function(kernel, config, log) {
	this.kernel = kernel;
	this.config = config;
	this.log = log;
};
HttpStatic.prototype = {
	kernel: null,
	config: null,
	
	onController: function(next, request, response) {
		if(request.route.type === 'static') {
			var filePath = pa.resolve(request.route.raw.dir, request.route.variables.path);
			if(pa.relative(request.route.raw.dir, filePath).search('\\.\\.') !== -1) {
				throw new Error('Security');
			} else if(fs.existsSync(filePath) === false || fs.lstatSync(filePath).isFile() !== true) {
				throw new ErrorHttpNotFound();
			}
			var self = this;
			var respond = function(content, contentEncoding) {
				response.setContentType(mime.contentType(pa.basename(filePath)));
				if(contentEncoding !== undefined) {
					response.setHeader('Content-Encoding', contentEncoding);
				}
				if(self.kernel.debug === true) {
					response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
					response.setHeader('Expires', '0');
				}
				response.content = content;
				response.hasResponse = true;
				next();
			};
			fs.readFile(filePath, function(error, content) {
				if(self.config.get('http.static.public.gzip') === true && request.getHeader('accept-encoding', '').search('gzip') !== -1) {
					zlib.gzip(content, function (_, contentGzip) {
						respond(contentGzip, 'gzip');
					});
				} else {
					respond(content);
				}
			});
		} else {
			next();
		}
	},
	
	onRoutingConfig: function(next, routing) {
		var config = this.config.get('http.static.public');
		var prefix = config.routePrefix || 'SilexHttpStaticBundle_public_auto_';
		if(config.auto === true) {
			var self = this;
			var routes = {};
			var pattern = config.pattern;
			if(typeof pattern === 'string') {
				if(pattern[pattern.length-1] === '/') { pattern = pattern.substr(0, pattern.length-1); }
				for(var key in this.kernel.bundles) {
					var bundle = this.kernel.bundles[key];
					var dir = bundle.dir+'/Resources/public';
					if(fs.existsSync(dir) === false) {
						continue;
					}
					var bundleNameUnderscore = bundle.name.replace(/([A-Z])/g, '_$1').toLowerCase().substr(1);
					var bundleNameDash = bundleNameUnderscore.replace(/_/g, '-');
					routes[prefix+bundleNameUnderscore] = {
						type: 'static',
						path: pattern.replace('{bundle}', bundleNameDash)+'/{path}',
						requirements: { path: '.*' },
						dir: dir,
					};
				}
			}
			var app = config.app;
			if(typeof app === 'string') {
				if(app[app.length-1] === '/') { app = app.substr(0, app.length-1); }
				var dir = (this.kernel.dir.app+'/Resources/public').replace(/\\/g, '/');
				if(fs.existsSync(dir) === true) {
					routes[prefix+'app'] = {
						type: 'static',
						path: app+'/{path}',
						requirements: { path: '.*' },
						dir: dir,
					};
				}
			}
			routing.add(routes);
		}
		next();
	},
};


module.exports = HttpStatic;
