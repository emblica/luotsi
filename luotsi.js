const Handlebars = require('handlebars')
const winston = require('winston')
const fs = require('fs')
const A = require('axios')
const Promise = require('bluebird')
const crypto = require('crypto')
const exec = require('child_process').exec

const env = (k, d) => process.env[k] || d


/* CHECKSUM STATE (mutable global) */

let CHECKSUM = ''


/* CONFIG */

const NODE_ENV = env('NODE_ENV', 'PROD')
const VERSION = '0.1.1'

const SETTINGS = {
  cert_path: env('CERT_PATH', '/etc/haproxy/cert.pem'),
  halti_url: env('HALTI_URL', 'http://localhost:4040') + '/api/v1/loadbalancers/config',
  log_level: env('LOG_LEVEL', 'info'),
  loop_interval: env('LOOP_INTERVAL', 5000),
  maintenance_page: env('MAINTENANCE_PAGE', '/etc/haproxy/maintenance.http'),
  stats: {
    path: '/haproxy',
    user: env('STATS_USER', 'hadmin'),
    pass: env('STATS_PASS', 'hadmin'),
  },
  ssl: env('SSL_ENABLED', 'true'),
  template_file: 'haproxy.template',
  haproxy: {
    user: env('HAPROXY_USER', 'haproxy'),
    group: env('HAPROXY_GROUP', 'haproxy'),
    config_file: env('HAPROXY_CONF', '/etc/haproxy/haproxy.cfg'),
    reload_cmd: env('HAPROXY_RELOAD_CMD', 'service haproxy reload'),
  }

}


/* UTILS */

const md5 = data => crypto.createHash('md5').update(data).digest('hex')
const noop = () => {}
const readFile = Promise.promisify(fs.readFile)
const writeFile = Promise.promisify(fs.writeFile)
const logger = new (winston.Logger)({
  transports: [new (winston.transports.Console)({'timestamp': true, 'level': SETTINGS.log_level})]
})


/* HELPERS */

const renderConfig = (tmpl, settings, loadbalancers) => Handlebars.compile(tmpl)({loadbalancers, settings})

const reconfig = (config) => (
  writeFile(SETTINGS.haproxy.config_file, config)
    .then(() => Promise.promisify(exec)(SETTINGS.haproxy.reload_cmd))
)

function luotsiPoll (reconfig) {
  Promise.all([
    readFile(SETTINGS.template_file, 'utf-8'),
    SETTINGS,
    A.get(SETTINGS.halti_url).then(res => res.data)]
  )
  .spread(renderConfig)
  .then(config => {
    const hash = md5(config)
    if (hash != CHECKSUM) {
      CHECKSUM = hash // save checksum

      logger.info('Update haproxy config, new checksum: %s', CHECKSUM)
      reconfig(config)
        .then(() => logger.info('HAProxy running with new config.'))
        .catch(e => logger.error(`HAProxy reconfig failed!\n${e}`))
    } else {
      logger.debug(`Received config without any changes (checksum: ${hash}).`)
    }
  })
  .catch(e => logger.error(`issue during polling loop\n ${e}`))
}


/* MAIN */

function main() {
  logger.info('Halti - Luotsi loadbalancer v%s', VERSION)
  logger.info(`starting polling loop, with loop interval ${SETTINGS.loop_interval}ms`)
  setInterval(luotsiPoll.bind(null, reconfig), SETTINGS.loop_interval)
}


/* ENTRYPOINT (with test exports) */

if (NODE_ENV == 'PROD') main()
else if (NODE_ENV == 'DEV') main()
else if (NODE_ENV == 'TEST') {
  module.exports = {
    md5, renderConfig, readFile, writeFile, SETTINGS, luotsiPoll
  }
}
