const request = require('superagent')
const config = require('config')
const debug = require('debug')('responder')

const overview = require('../actions/overview')
const device = require('./device')
const channel = require('./channel')
const ownership = require('./ownership')
const upgrade = require('./upgrade')

/**
responder responds to cloud message, on behalf of winasd
*/

const getURL = (stationId, jobId) =>
  `${config.pipe.baseURL}/s/v1/station/${stationId}/response/${jobId}`

const formatError = (error, status) => {
  status = status || 403
  let formatError
  if (error instanceof Error) {
    formatError = error
    formatError.status = error.status ? error.status : status
  } else if (typeof err === 'string') {
    formatError = new Error(error)
    formatError.status = status
  }
  return formatError
}

const reply = (msg, error, res, isFetch, isStore) => {
  let resErr
  if (error) {
    error = formatError(error)
    resErr = error
  }

  let uri = getURL(this.sn, msg.sessionId, false)
  if (isFetch) uri += '/pipe/fetch'
  else if (isStore) uri += '/pipe/store'
  else uri += '/json'
  return request({
    uri: uri,
    method: 'POST',
    headers: {
      Authorization: this.ctx.token,
      Cookie: msg.headers['cookie']
    },
    body: true,
    json: {
      error: resErr,
      data: res
    }
  }, (error, response, body) => {
    if (error) {
      debug('replay error: ', error)
    } else {
      debug('reply success:', response.statusCode)
    }
  })
}

const handleMessage = msg => {
  const { urlPath, verb, user } = msg
  const owner = ownership.owner
  const body = Object.assign({}, msg.body, msg.params)

  // not mine
  if (urlPath !== '/winasd' && !urlPath.startsWith('/winasd/')) return

  if (!owner) {
    const err = new Error('owner unavailable')
    return reply(msg, err, { status: 503 })
  }

  if (!user || !user.id || user.id !== owner.id) {
    const err = new Error('unauthorized')
    return reply(msg, err, { status: 401 })
  }

  // root, unroot, reboot, shutdown
  if (urlPath === '/winasd' && verb === 'PATCH') {
    switch (body.op) {
      case 'reboot':
        device.reboot()
        return reply(msg, null, {})
      case 'shutdown':
        device.shutdown()
        return reply(msg, null, {})
      case 'root':
        return ownership.root(err => reply(msg, err || null, {}))
      case 'unroot':
        return ownership.unroot(err => reply(msg, err || null, {}))
      default:
        const err = new Error('invalid op')
        return reply(msg, err, { status: 400 })
    }

  // overview
  } else if (urlPath === '/winasd/info') {
    overview((err, data) => {
      if (err) {
        reply(msg, err, { status: 500 })
      } else {
        reply(msg, null, data)
      }
    })

  // update device name
  } else if (urlPath === '/winasd/device') {
    ownership.setDisplayName(body.name)
    return reply(msg, null, {})

  // retrieve usable checkout list
  } else if (urlPath === '/winasd/upgrade' && verb === 'GET') {
    upgrade.listLocal((err, list) => {
      if (err) {
        reply(msg, err, { status: 500 })
      } else {
        reply(msg, null, list)
      }
    })

  // bad
  } else {
    // TODO for restful design,
    // resource not found 404 and method not allowed 405 are different things
    return reply(msg, formatError('not found'))
  }
}

/**
TODO
It is possible that owner message does not arrived when pipe message arrived,
since ownership processes owner asynchronously.
*/
channel.on('pipe', handleMessage)
