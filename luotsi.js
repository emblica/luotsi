
// This is consul version of luotsi
var consul = require('consul')({host: process.env.HOST_IP,  port: process.env.PORT});


var fs = require('fs');
var Handlebars = require('handlebars');
var debounce = require('debounce');
var Q = require('q');

// HAPROXY

var HAProxy = require('haproxy');
var haproxy = new HAProxy('/tmp/haproxy.sock', {config: '/data/luotsi/haproxy.cfg'});

haproxy.start(function (err) {
	console.error(err);
});


// RSYSLOG UDP DAEMON
var SLOGPORT = 514;
var SLOGHOST = '127.0.0.1';
require('./udlog')(SLOGHOST, SLOGPORT);




var hostnames = {};
var metadata = {};


/**
* SERVICE WATCHER
* If new/changed web-service -> fetch nodes
*/
var service_watcher = consul.watch({ method: consul.catalog.service.list });

service_watcher.on('change', function(data, res) {
	fetchServices();
});

service_watcher.on('error', function(err) {
	console.log('error:', err);
});


/**
* HOSTNAME WATCHER
* If new/changed hostname -> fetch hostnames
*/
var hostname_watcher = consul.watch({ method: consul.kv.keys, options: {key: 'hostnames/', recursive: true} });

hostname_watcher.on('change', function(data, res) {
	var hosts = data.map(function(path){
		return path.replace('hostnames/', '');
	}).filter(function(hosts){
		return hosts.length > 0;
	});
	fetchHostnames(hosts);
});

hostname_watcher.on('error', function(err) {
	console.log('error:', err);
});


/**
* METADATA WATCHER
* If new/changed metadata -> fetch metadata
*/
var metadata_watcher = consul.watch({ method: consul.kv.keys, options: {key: 'metadatas/', recursive: true} });

metadata_watcher.on('change', function(data, res) {
	var hosts = data.map(function(path){
		return path.replace('metadatas/', '');
	}).filter(function(hosts){
		return hosts.length > 0;
	});
	fetchMetadatas(hosts);
});

metadata_watcher.on('error', function(err) {
	console.log('error:', err);
});



// UTILS
function ip2hex (ip) {
	var parts = ip.split('.');
	ints = parts.map(function(part){return parseInt(part);});
	var k = new Buffer(ints).toString('hex');
	return k;
}


function writeHaproxyConfig (services) {
	fs.readFile('haproxy.template', {encoding:'utf-8'}, function (err, content) {
		var template = Handlebars.compile(content);
		var output = template({services: services});

		console.log("WRITING HAPROXY CONFIGURATION");
		fs.writeFile('haproxy.cfg', output, function (err) {
			haproxy.reload();
		});
	});
}

/*
* SERVICES
*/

// Fetching single service
function fetchService (service_key) {
	var deferred = Q.defer();
	consul.catalog.service.nodes(service_key, function(err, result) {
		if (err) {
			deferred.reject(err);
		} else {
			var service = {};
			service.name = service_key;
			service.host = hostnames[service_key] ? hostnames[service_key] : service.name + '.slush.org';
			service.meta = metadata[service_key] ? metadata[service_key] : {};
			service.servers = result.map(handleNode);
			deferred.resolve(service);			
		}
	});
	return deferred.promise;
}

function handleNode (node) {
	return {
		name: node.Node +'_'+ ip2hex(node.Address),
		address: node.Address + ':' + node.ServicePort
	};
}

function fetchServiceNames() {
	var deferred = Q.defer();
	consul.catalog.service.list(function (err, data) {
		if (err) {
			deferred.reject(err);
		} else {
			var web_services = Object.keys(data).filter(function(key) {
				return data[key].indexOf('web') != -1;
			});
			deferred.resolve(web_services);			
		}
	});
	return deferred.promise;
}

function fetchServices () {
	var service_keys = fetchServiceNames();
	service_keys
	.then(function (keys) {
		// Fetches all services, combines with metadata and host
		var services = keys.map(fetchService);
		Q.all(services)
		.then(function (services) {
			//console.log(JSON.stringify(services,null, 3));
			// Write configuration and reload haproxy
			writeHaproxyConfig(services);
		});
	});
}

/*
* HOSTNAMES
*/

function fetchHostnames (keys) {
	var names = keys.map(fetchHostname);
	Q.all(names)
	.then(function (names) {
		hostnames = {};
		names.forEach(function (hname) {
			hostnames[hname.service] = hname.hostname;
		});
		// Call fetch services
		fetchServices();
	});
}

function fetchHostname (name) {
	var deferred = Q.defer();
	consul.kv.get('hostnames/'+name, function(err, result) {
		if (err) {
			deferred.reject(err);
		} else {
			deferred.resolve({
				service: name,
				hostname: result.Value
			});
		}
	});
	return deferred.promise;
}

/*
* METADATA
*/

function fetchMetadatas (keys) {
	var metas = keys.map(fetchMetadata);
	Q.all(metas)
	.then(function (metas) {
		metadata = {};
		metas.forEach(function (md) {
			metadata[md.service] = md.data;
		});
		// Call fetch services
		fetchServices();
	});
}


function fetchMetadata (service) {
	var deferred = Q.defer();
	consul.kv.get('metadatas/'+service, function(err, result) {
		if (err) {
			deferred.reject(err);
		} else {
			deferred.resolve({
				service: service,
				data: JSON.parse(result.Value)
			});
		}
	});
	return deferred.promise;
}


