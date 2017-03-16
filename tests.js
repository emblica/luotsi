const A = require('axios')
const MockAdapter = require('axios-mock-adapter')
const Promise = require('bluebird')
const R = require('ramda')
const test = require('tape')

const LBConfig = require('./mock_lb_config.json')
const {SETTINGS, md5, renderConfig, readFile, luotsiPoll} = require('./luotsi')

const mock = new MockAdapter(A)

// this is a row that should be rendered in the final config
// not a very thorough test, but can be used to verify that at least
// a config has been created with at least some data from mock_lb_config.json
const rowFromConfig = '# LB        f164603e-ddbb-4db1-82c1-1ebe3cd66f4e'


test('test md5 checksumming of the LBConfig', (t) => {
    t.plan(3)
    const d1 = JSON.stringify(LBConfig)
    const d2 = JSON.stringify(R.assocPath([0, 'name'], 'foobar', LBConfig))
    const [r1, r2, r3] = [md5(d1), md5(d1), md5(d2)]
    t.equal(typeof(r1), 'string')
    t.equal(r1, r2)
    t.notEqual(r2, r3)
})


test('test rendering HAProxy config from LBConfig', (t) => {
  t.plan(2)

  readFile(SETTINGS.template_file, 'utf-8').then(file => {
    t.true(file.includes('{{#each loadbalancers}}'))
    const config = renderConfig(file, SETTINGS, LBConfig)
    t.true(config.includes(rowFromConfig))
  })
})


test('test the Luotsi behavior when polling a new config', t => {
  t.plan(3) // # of asserts
  mock.onGet('http://localhost:4040/api/v1/loadbalancers/config').reply(200, LBConfig)

  const HAProxyReload = (config) => {
    return new Promise((resolve, reject) => {
      t.true(config.includes(rowFromConfig))
      t.pass()
      resolve()
    })
  }

  // asserts 1 and 2
  luotsiPoll(HAProxyReload)

  // try again, should not call HAProxyReload, but should call noReload

  // timeout to ensure the above luotsiPoll has finished (ugly but works)
  setTimeout(() => {
    luotsiPoll(
      () => t.fail(), // shouldn't get called
      () => t.pass()  // should get called -> assert 3
    )
  }, 200)

})
