var Etcd = require('node-etcd');
var fs = require('fs');
var Handlebars = require('handlebars');
var debounce = require('debounce');
var hash = require('object-hash');
var spawn = require('child_process').spawn;

var etcd = new Etcd(process.env.HOST_IP, process.env.ETCD_PORT);
var haproxy_path = '/usr/sbin/haproxy';
var pid = -1;
var haproxy = spawnHaproxy();
//etcd.set("/services/testservice/10.10.0.1", "10.10.0.1:4555");
//etcd.set("/services/testservice/10.10.0.2", "10.10.0.2:4555");
//etcd.set("/services/testservice/10.10.0.3", "10.10.0.3:4555");
//etcd.set("/services/testservice2/10.10.0.1", "10.10.0.2:4556");

var hostnames = {};

var metadata = {};

var tservices = "";

hostname_watcher = etcd.watcher("/hostnames", null, {recursive: true});
hostname_watcher.on("change", debounce(fetchHostnames, 300));
hostname_watcher.on('error', console.log);

service_watcher = etcd.watcher("/services", null, {recursive: true});
service_watcher.on("change", debounce(fetchServices, 300));
service_watcher.on('error', console.log);


service_watcher = etcd.watcher("/metadata", null, {recursive: true});
service_watcher.on("change", debounce(fetchMetadata, 300));
service_watcher.on('error', console.log);


fetchHostnames();
fetchMetadata();

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
                fetchServices(1);
        });
}


function writeHaproxyConfig (services) {
	fs.readFile('haproxy.template', {encoding:'utf-8'}, function (err, content) {
		var template = Handlebars.compile(content);
		var output = template({services: services});
		//console.log(output, services);
		fs.writeFile('haproxy.cfg', output, function (err) {
			reloadHaproxy();
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
	ints = parts.map(parseInt);
	return new Buffer(ints).toString('hex');
}



function getHaproxyArgs (pid) {
	return ['-f', 'haproxy.cfg', '-st', pid]
}

function spawnHaproxy () {
	var args = ['-f', 'haproxy.cfg'];
	if (pid && pid !== -1) {
		args = getHaproxyArgs(pid);
	}
	var ha = spawn(haproxy_path, args);
	pid = ha.pid;
	ha.stdout.on('data', function (data) {
  		console.log(''+data);
	});

	ha.stderr.on('data', function (data) {
	  console.log('HAProxy stderr: ' + data);
	});

	ha.on('close', function (code) {
	  if (code !== 0) {
	    console.log('HAProxy process exited with code ' + code);
	  }
	});
	return ha;
}



function reloadHaproxy () {
	console.log(haproxy.pid, pid);
	var tmp_haproxy = spawnHaproxy(pid);
	haproxy.on('close', function () {
		haproxy = tmp_haproxy;
	});
}
