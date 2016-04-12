var Handlebars = require('handlebars');

var fs = require('fs');
var fetch = require('node-fetch');
var Promise = require('bluebird');
var crypto = require('crypto');
const exec = require('child_process').exec;

function md5(data) {
	return new Promise((resolve, reject) => {
		return resolve(crypto.createHash('md5').update(data).digest("hex"));
	});
}

var checksum = "";

var readFile = Promise.promisify(fs.readFile);
var writeFile = Promise.promisify(fs.writeFile);


var template_file = 'haproxy.template';
var config_file = '/etc/haproxy/haproxy.cfg';
var halti_url = (process.env.HALTI_URL || "http://10.4.1.224:4040") + "/api/v1/loadbalancers/config";


function render_config(template_content, loadbalancers) {
	return new Promise((resolve, reject) => {
		const template = Handlebars.compile(template_content);
		resolve(template({loadbalancers: loadbalancers}));
	});
}



function reload_haproxy () {
	return new Promise((resolve, reject) => {
		exec("service haproxy reload", (error, stdout, stderr) => resolve());
	});
}


function check () {
	Promise.all([readFile(template_file, 'utf-8'), fetch(halti_url).then(res => res.json())])
	.spread(render_config)
	.then(rendered_config => Promise.join(md5(rendered_config), rendered_config))
	.spread((hash, rendered_config) => {
		if (hash !== checksum) {
			checksum = hash;
			console.log("Update!", hash);
			return writeFile(config_file, rendered_config)
							.then(reload_haproxy)
		}
	}).catch(e => console.log(e))
}

setInterval(check, 5000);
