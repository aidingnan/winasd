const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const Config = require('config')
const request = require('superagent')

const certFolder = path.join(Config.volume.cloud, Config.cloud.domain, Config.cloud.id)
// const tmpDir = Config.volume.tmp

// const storageConf = Config.get('storage')
// const certFolder = storageConf.dirs.certDir
// const tmpDir = storageConf.dirs.tmpDir
const pkeyName = 'device.key'

const createSignature = (ecc, op, callback) => {
  let raw
  if (Config.system.withoutEcc) {
    let signature; const raw = JSON.stringify({
      lifecycle: 'fack device....',
      op
    })
    try {
      const sign = crypto.createSign('SHA256')
      sign.write(raw)
      sign.end()
      signature = sign.sign(fs.readFileSync(path.join(certFolder, pkeyName)), 'hex')
      return callback(null, { signature, raw })
    } catch (e) {
      return callback(e)
    }
  } else {
    readCounter(ecc, (err, count) => {
      if (err) return callback(err)
      raw = JSON.stringify({
        lifecycle: count,
        op
      })
      ecc.sign({ data: raw }, (err, sig) => {
        if (err) return callback(err)
        callback(null, { signature: sig.toString('hex'), raw })
      })
    })
  }
}

module.exports.createSignature = createSignature

module.exports.reqUnbind = (ecc, encrypted, token, callback) => {
  createSignature(ecc, 'unbind', (err, data) => {
    if (err) return callback(err)
    const { signature, raw } = data
    request.post(`${Config.pipe.baseURL}/s/v1/station/unbind`)
      .send({ signature, encrypted, raw })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body)
      }, error => {
        callback(error)
      })
  })
}

module.exports.reqBind = (ecc, encrypted, token, callback) => {
  createSignature(ecc, 'bind', (err, data) => {
    if (err) return callback(err)
    const { signature, raw } = data
    request.post(`${Config.pipe.baseURL}/s/v1/station/bind`)
      .send({ signature, encrypted, raw })
      .set('Authorization', token)
      .then(res => {
        callback(null, res.body)
      }, error => {
        callback(error)
      })
  })
}

/*
callback: (err, verified, fulfilled) => {}
*/
module.exports.verify = (ecc, signature, raw, callback) => {
  if (!ecc || !signature || !raw) {
    return callback(new Error('invalid args'))
  }
  ecc.verify({
    data: raw,
    signature: Buffer.from(signature, 'hex')
  }, (err, data) => {
    if (err) return callback(err)
    if (!data) return callback(null, false)
    try {
      raw = JSON.parse(raw)
    } catch (e) {
      return callback(null, false)
    }
    readCounter(ecc, (err, count) => {
      if (err) return callback(err)
      // record counter in cloud while do binding or unbinding
      // if current counter equal to cloud, that means not fulfilled
      // else fulfilled
      if (raw.lifecycle === count) {
        callback(null, true, false) // not fulfilled
      } else if (raw.lifecycle === count - 1) {
        callback(null, true, true) // fulfilled
      } else {
        callback(null, false)
      }
    })
  })
}

const refresh = (ecc, callback) => {
  ecc.incCounter({}, callback)
}

const readCounter = (ecc, callback) => {
  ecc.readCounter({}, callback)
}

module.exports.refresh = refresh
