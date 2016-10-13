const Handlebars = require('handlebars');
const winston = require('winston');
const fs = require('fs');
const a = require('axios');
const Promise = require('bluebird');
const crypto = require('crypto');
const exec = require('child_process').exec;

const logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({'timestamp':true})
    ]
});

function md5(data) {
	return new Promise((resolve, reject) => {
		return resolve(crypto.createHash('md5').update(data).digest("hex"));
	});
}

const VERSION = "0.1.0";

let checksum = "";

const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);

const settings = {
	stats: {
		path: "/haproxy",
		user: process.env.STATS_USER || "hadmin",
		pass: process.env.STATS_PASS || "hadmin"
	},
	maintenance_page: process.env.MAINTENANCE_PAGE || '/etc/haproxy/maintenance.http',
	cert_path: process.env.CERT_PATH ||'/etc/haproxy/cert.pem',

}

const template_file = 'haproxy.template';
const config_file = '/etc/haproxy/haproxy.cfg';
const halti_url = (process.env.HALTI_URL || "http://localhost:4040") + "/api/v1/loadbalancers/config";


function render_config(template_content, settings, loadbalancers) {
	return new Promise((resolve, reject) => {
		const template = Handlebars.compile(template_content);
		resolve(template({loadbalancers: loadbalancers, settings: settings}));
	});
}


function reload_haproxy () {
	return new Promise((resolve, reject) => {
		logger.info("Reload haproxy");
		exec("service haproxy reload", (error, stdout, stderr) => resolve());
	});
}


function check () {
	Promise.all([readFile(template_file, 'utf-8'), settings, a.get(halti_url).then(res => res.data)])
	.spread(render_config)
	.then(rendered_config => Promise.join(md5(rendered_config), rendered_config))
	.spread((hash, rendered_config) => {
		if (hash !== checksum) {
			checksum = hash;
			logger.info("Update haproxy config, new checksum: %s", hash);
			return writeFile(config_file, rendered_config)
							.then(reload_haproxy)
		}
	}).catch(e => logger.error(e))
}
logger.info("Halti - Luotsi loadbalancer v%s", VERSION)

setInterval(check, 5000);
