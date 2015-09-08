var Etcd = require('node-etcd');
var fs = require('fs');
var Handlebars = require('handlebars');
var debounce = require('debounce');
var hash = require('object-hash');


var spawn = require('child_process').spawn


var config = '/data/luotsi/haproxy.cfg';
var haproxy_bin = '/usr/sbin/haproxy-systemd-wrapper';

var etcd = new Etcd(process.env.HOST_IP, process.env.ETCD_PORT);

var Haproxy = function (config_path) {
	var self = this;
	this.config_path = config_path;
	this.pid = -1;
	this.pid_file = '/run/haproxy.pid';
	this.start = function () {
		self.haprocess = spawn(haproxy_bin, ['-f', self.config_path, '-p', self.pid_file]);
		self.pid = self.haprocess.pid;
		self.haprocess.on('close', function (code) {
			process.exit(code);
		});
	};
	this.running = function (cb) {
			fs.exists('/proc/' + self.pid, function (exists) {
				return cb(null, exists)
			});
	};
	this.reload = function () {
		process.kill(self.pid, 'SIGUSR1');
	};
	this.terminate = function () {
		process.kill(self.pid, 'SIGKILL');
	};

	return this;
}

var haproxy = new Haproxy(config);
process.on('SIGTERM', function() {
	haproxy.terminate();
	process.exit(code);
});

/*
* LOG COLLECTOR
*/
var PORT = 514;
var HOST = '127.0.0.1';

var dgram = require('dgram');
var server = dgram.createSocket('udp4');

server.on('listening', function () {
	var address = server.address();
	console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

server.on('message', function (message, remote) {
	client.send(message, 0, message.length, 5145, 'monitor-in.slush.xyz');
});

server.bind(PORT, HOST);



//etcd.set("/services/testservice/10.10.0.1", "10.10.0.1:4555");
//etcd.set("/services/testservice/10.10.0.2", "10.10.0.2:4555");
//etcd.set("/services/testservice/10.10.0.3", "10.10.0.3:4555");
//etcd.set("/services/testservice2/10.10.0.1", "10.10.0.2:4556");

var hostnames = {};

var metadata = {};

var tservices = "";
var hash_meta = "";

hostname_watcher = etcd.watcher("/hostnames", null, {recursive: true});
hostname_watcher.on("change", debounce(fetchHostnames, 200));
hostname_watcher.on('error', console.log);

service_watcher = etcd.watcher("/services", null, {recursive: true});
service_watcher.on("change", debounce(fetchServices, 200));
service_watcher.on('error', console.log);


service_watcher = etcd.watcher("/metadata", null, {recursive: true});
service_watcher.on("change", debounce(fetchMetadata, 200));
service_watcher.on('error', console.log);


fetchHostnames();
fetchMetadata();

fetchServices(1);


function fetchServices (cascade) {
	etcd.get("/services", {recursive:true}, function (err, listing) {
		if (err) { console.error(err); return;}
		var services = [];
		try {
			services = listing.node.nodes.map(handleService);
		} catch (e) {console.log(e, e.stack);}
		services.sort(function (a, b) {
			return (a.name > b.name) ? -1 : 1;
		});
		if (tservices != hash(services) || cascade == 1) {
			console.log("CAPTAIN: rewriting loadbalancer");
			writeHaproxyConfig(services);
		}
		tservices = hash(services);
	});
}

function fetchHostnames () {
	etcd.get("/hostnames", function (err, kvs) {
		var hnames = [];
		try {
			kvs.node.nodes.forEach(function (hostname) {
				var key = hostname.key.replace('/hostnames/', '');
				hnames[key] = hostname.value;
			});
		} catch (e) {}
		hostnames = hnames;
		fetchServices(1);
	});
}

function fetchMetadata () {
	etcd.get("/metadata", function (err, kvs) {
		var metas = [];
		try {
			kvs.node.nodes.forEach(function (metadata) {
				var key = metadata.key.replace('/metadata/', '');
				metas[key] = JSON.parse(metadata.value);
			});
		} catch (e) {}
		metadata = metas;
		if(hash(metadata) !== hash_meta) {
			fetchServices(1);
		}
		hash_meta = hash(metadata);
	});
}


function writeHaproxyConfig (services) {
	fs.readFile('haproxy.template', {encoding:'utf-8'}, function (err, content) {
		var template = Handlebars.compile(content);
		var output = template({services: services});
		//console.log(output, services);
		fs.writeFile('haproxy.cfg', output, function (err) {
			haproxy.running(function (err, running) {
				if (running) {
					console.log("LB is running... Reloading!");
					haproxy.reload();
				} else {
					console.log("LB is NOT running. Starting!");
					haproxy.start();
				}
			});
		});
	});
}
/*
function writeFleetdConfig (template, service) {
	fs.readFile(template, {encoding: 'utf-8'}, function (err, content) {
		var template = Handlebars.compile(content);
		var output = template({service: service});
		console.log(output);
	});
}
function writeServiceConfig (service) {
	writeFleetdConfig('discovery.tpl', service);
	writeFleetdConfig('webservice.tpl', service);
}
*/

function handleService (service_item) {
	var service = {};
	service.name = service_item.key.replace('/services/', '');
	service.host = hostnames[service.name] ? hostnames[service.name] : service.name+".slush.org";
	service.meta = metadata[service.name] ? metadata[service.name] : {};
	service.servers = [];
	try {
		service.servers = service_item.nodes
		.map(handleServers)
		.sort(function (a, b) {
			return (a.name > b.name) ? -1 : 1;
		});
	} catch(e) {
		console.log("CAPTAIN: No backend for " + service.name);
	}
	return service;
}

function handleServers (server_item) {
	var server = {};
	var ks = server_item.key.split('/');
	server.name = ip2hex(ks[ks.length-1]);
	server.address = server_item.value;
	return server;
}

function ip2hex (ip) {
	var parts = ip.split('.');
	ints = parts.map(function(part){return parseInt(part);});
	var k = new Buffer(ints).toString('hex');
	return k;
}
