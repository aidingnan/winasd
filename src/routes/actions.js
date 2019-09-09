const express = require('express')
const router = express.Router()

const overview = require('../actions/overview')
const unbind = require('../actions/unbind')
const timedate = require('../lib/timedate')
const device = require('../components/device')
const ownership = require('../components/ownership')
const auth = require('../components/local-auth')
const upgrade = require('../components/upgrade')

// TODO no auth ???
router.patch('/', (req, res) => {
  switch (req.body.op) {
    case 'reboot':
      device.reboot()
      res.status(200).end()
      break
    case 'shutdown':
      device.shutdown()
      res.status(200).end()
      break
    case 'root':
      ownership.root(err => {
        if (err) {
          res.status(500).json({ code: err.code, message: err.message })
        } else {
          res.status(200).end()
        }
      })
      break
    case 'unroot':
      ownership.unroot(err => {
        if (err) {
          res.status(500).json({ code: err.code, message: err.message })
        } else {
          res.status(200).end()
        }
      })
      break
    default:
      res.status(400).end()
      break
  }
})

router.get('/info', (req, res) => {
  overview((err, data) => {
    if (err) {
      res.error(err)
    } else {
      res.success(data)
    }
  })
})

router.get('/upgrade', (req, res) =>
  upgrade.listLocal((err, data) =>
    err ? res.error : res.success(data)))

// update device name
router.post('/device', (req, res, next) => {
  let { name } = req.body 
  if (typeof name !== 'string' || !name.length) {
    res.status(400).end()
  } else {
    ownership.setDisplayName(name)  
    res.status(200).end()
  }
})

// request
router.patch('/localAuth', (req, res, next) => {
  auth.request((err, data) => {
    if (err) return res.error(err)
    res.success(data)
  })
})

router.post('/localAuth', (req, res, next) => {
  auth.auth(req.body, (err, data) => {
    if (err) return res.error(err)
    res.success(data)
  })
})

// TODO not used ???
router.post('/bind', (req, res, next) => {
  res.status(500).end()
})

router.post('/unbind', (req, res, next) => {
  let { encrypted, authToken, clean } = req.body
  if (clean === undefined) clean = false

  if (typeof encrypted !== 'string' || !encrypted ||
    typeof authToken !== 'string' || !authToken ||
    typeof clean !== 'boolean') {
    return res.status(400).end()
  }

  if (!auth.verify(authToken)) return res.status(401).end()
  unbind(encrypted, clean, (err, data) => {
    if (err) {
      const { code, message } = err
      // console.log('unbind error', err)
      // if cloud forbidden this should be 4xx
      res.status(500).json({ code, message })
    } else {
      res.status(200).json(data)
    }
  })
})

router.post('/timedate', (req, res) => {
  timedate(req.body, (err, data) => {
    if (err) {
      const { code, message } = err
      res.status(500).json({ code, message })
    } else {
      res.status(200).json(data)
    }
  })
})

module.exports = router
