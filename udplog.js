

module.exports = function (host, port) {
	
	var dgram = require('dgram');
	var server = dgram.createSocket('udp4');

	server.on('listening', function () {
		var address = server.address();
		console.log('UDP Server listening on ' + address.address + ":" + address.port);
	});

	server.on('message', function (message, remote) {
		console.log(message.toString('utf-8'));

	});

	server.bind(host, port);
}