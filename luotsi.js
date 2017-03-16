const Handlebars = require('handlebars')
const winston = require('winston')
const fs = require('fs')
const A = require('axios')
const Promise = require('bluebird')
const crypto = require('crypto')
const exec = require('child_process').exec

const env = (k, d) => process.env[k] || d


/* CHECKSUM STATE */

let CHECKSUM = ''


/* CONFIG */

const NODE_ENV = env('NODE_ENV', 'PROD')
const VERSION = '0.1.1'

const SETTINGS = {
  cert_path: env('CERT_PATH', '/etc/haproxy/cert.pem'),
  config_file: NODE_ENV == 'TEST' ? 'test_haproxy.cfg' : env('HAPROXY_CONF', '/etc/haproxy/haproxy.cfg'),
  halti_url: env('HALTI_URL', 'http://localhost:4040') + '/api/v1/loadbalancers/config',
  loop_interval: 5000,
  maintenance_page: env('MAINTENANCE_PAGE', '/etc/haproxy/maintenance.http'),
  stats: {
    path: '/haproxy',
    user: env('STATS_USER', 'hadmin'),
    pass: env('STATS_PASS', 'hadmin'),
  },
  ssl: env('SSL_ENABLED', 'true'),
  template_file: 'haproxy.template',
}


/* UTILS */

const md5 = data => crypto.createHash('md5').update(data).digest('hex')
const noop = () => {}
const readFile = Promise.promisify(fs.readFile)
const writeFile = Promise.promisify(fs.writeFile)
const logger = new (winston.Logger)({
  transports: [new (winston.transports.Console)({'timestamp': true})]
})


/* HELPERS */

const renderConfig = (tmpl, settings, loadbalancers) => Handlebars.compile(tmpl)({loadbalancers, settings})


function HAProxyReload (config) {
  return writeFile(SETTINGS.config_file, config).then(() => {
    logger.info('Reload haproxy')

    const promisedExec = Promise.promisify(exec)
    return promisedExec('service haproxy reload')
  })
}


/* MAIN */

function luotsiPoll (HAProxyReload, noReload=noop) {
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
      return HAProxyReload(config)
    } else {
      logger.debug(`Received config without any changes.`)
      return noReload()
    }
  }).catch(e => logger.error(`issue during polling loop\n ${e}`))
}


function main() {
  logger.info('Halti - Luotsi loadbalancer v%s', VERSION)
  logger.info(`starting polling loop, with loop interval ${SETTINGS.loop_interval}ms`)
  setInterval(luotsiPoll.bind(null, HAProxyReload), SETTINGS.loop_interval)
}


function devMain() {
  const MockHAProxyReload = (config) => {
    return new Promise((resolve, reject) => {
      logger.info(`MockHAProxyReload - HAProxy config was NOT updated.`)
    })
  }

  const noReload = () => {
    logger.info(`noReload: config checksum did not change.`)
  }

  setInterval(luotsiPoll.bind(null, MockHAProxyReload, noReload), SETTINGS.loop_interval)
}


/* ENTRYPOINT (with test exports) */

if (NODE_ENV == 'PROD') main()
else if (NODE_ENV == 'DEV') devMain()
else if (NODE_ENV == 'TEST') {
  module.exports = {
    md5, renderConfig, readFile, writeFile, SETTINGS, luotsiPoll
  }
}
