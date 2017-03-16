const http = require('http')
const LBConfig = require('./mock_lb_config.json')
const PORT = 4040

function handleRequest(request, response){
  if (request.url == '/api/v1/loadbalancers/config') {
    console.log('serving mock loadbalancers config...')
    return response.end(JSON.stringify(LBConfig))
  }

  response.end('Mock Halti, for your development.')
}

const server = http.createServer(handleRequest)
server.listen(PORT, () => {
  console.log('Mock Halti: http://localhost:%s', PORT)
})
