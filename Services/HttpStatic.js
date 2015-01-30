var pa = require('path');
var fs = require('fs');
var mime = require('mime-types');
var glob = require('glob');

var ErrorHttpNotFound = USE('Silex.HttpServerBundle.Error.HttpNotFound');


var HttpStatic = function(kernel, config) {
	this.kernel = kernel;
	this.config = config;
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
			response.setContentType(mime.contentType(filePath));
			response.content = fs.readFileSync(filePath);
			response.hasResponse = true;
		}
		next();
	},
	
	onRoutingConfig: function(next, routing) {
		if(this.config.get('http.static.public.auto') === true) {
			var self = this;
			var routes = {};
			var pattern = this.config.get('http.static.public.pattern');
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
					routes['SilexHttpStaticBundle_public_auto_'+bundleNameUnderscore] = {
						type: 'static',
						path: pattern.replace('{bundle}', bundleNameDash)+'/{path}',
						requirements: { path: '.*' },
						dir: dir,
					};
				}
			}
			var app = this.config.get('http.static.public.app');
			if(typeof app === 'string') {
				if(app[app.length-1] === '/') { app = app.substr(0, app.length-1); }
				var dir = (this.kernel.dir.app+'/Resources/public').replace(/\\/g, '/');
				if(fs.existsSync(dir) === true) {
					routes['SilexHttpStaticBundle_public_auto_app'] = {
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
