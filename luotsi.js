var Etcd = require('node-etcd');
var fs = require('fs');
var Handlebars = require('handlebars');
var debounce = require('debounce');
var hash = require('object-hash');

var HAProxy = require('haproxy');

var haproxy = new HAProxy('/tmp/haproxy.sock', {config: '/data/luotsi/haproxy.cfg'});

var etcd = new Etcd(process.env.HOST_IP, process.env.ETCD_PORT);
var haproxy_path = '/usr/sbin/haproxy';

var PORT = 514;
var HOST = '127.0.0.1';

var dgram = require('dgram');
var server = dgram.createSocket('udp4');

server.on('listening', function () {
    var address = server.address();
    console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

server.on('message', function (message, remote) {
    console.log(message.toString('utf-8'));

});

server.bind(PORT, HOST);


haproxy.start(function (err) {
  console.error(err);
});

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
			haproxy.reload();
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
