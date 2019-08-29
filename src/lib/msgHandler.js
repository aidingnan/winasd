class MsgHandler {
  constructor () {
    this.handlerMap = new Map()
    this.msgCache = new Map()
  }

  handle (...args) {
    throw new Error('subclass must implement handle func')
  }

  register (type, func) {
    if (this.handlerMap.has(type)) {
      this.handlerMap.set(type, [...this.handlerMap.get(type), func])
    } else {
      this.handlerMap.set(type, [func])
    }

    if (!this.disableCache && this.msgCache.has(type)) {
      try {
        func(...this.msgCache.get(type))
      } catch (e) {}
    }
  }
}
module.exports.MsgHandler = MsgHandler

/**
 * handlers type
 * 1. token
 * 2. pipe
 * 3. users
 * 4. checkout
 * 5. download
 */

class ChannelHandler extends MsgHandler {

  handle (topic, payload) {
    let data
    try {
      data = JSON.parse(payload.toString())
    } catch (e) {
      console.log('MQTT PAYLOAD FORMATE ERROR')
      return
    }

    const segs = topic.split('/')
    if (!segs.length) return // unknown topic
    const type = segs.pop()

    // cache latest msg
    this.msgCache.set(type, [data])

    if (this.handlerMap.has(type)) {
      this.handlerMap.get(type).forEach(f => {
        try {
          f(data)
        } catch (e) {}
      })
    } else {
      console.log('NOBODY CARED CHANNEL MESSAGE: ', topic)
      console.log(data)
    }
  }
}
module.exports.ChannelHandler = ChannelHandler

/**
 * handlers type:
 * 1. LocalAuthWrite
 * 2. NSWrite
 * 3. CloudWrite
 * 4. DeviceConnect
 * 5. DeviceDisconnect
 */

class BledHandler extends MsgHandler {
  handle (type, data, done) {
    let packet
    if (data) {
      try {
        packet = JSON.parse(data)
      } catch (e) {
        return  (type, { code: 'ENOTJSON', message: 'packet error' })
      }
    }

    if (this.handlerMap.has(type)) {
      this.handlerMap.get(type).forEach(f => {
        try {
          f(packet, res => done(type, res))
        } catch (e) {}
      })
    } else {
      console.log('NOBODY CARED BLED MESSAGE: ', type)
      console.log(packet)
      return done(type, { code: 'ENOHANDLE', message: 'no handler handle this type' })
    }
  }
}
module.exports.BledHandler = BledHandler
