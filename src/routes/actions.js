const express = require('express')
const router = express.Router()

const overview = require('../actions/overview')
const unbind = require('../actions/unbind')
const timedate = require('../lib/timedate')
const auth = require('../components/local-auth')
const unbind = require('../actions/unbind')

router.patch('/', (req, res) => {
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

router.get('/upgrade', (req, res) => {
}) 

// update device name
router.post('/device', (req, res, next) => {
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
      let { code, message } = err
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
      let { code, message } = err
      res.status(500).json({ code, message })
    } else {
      res.status(200).json(data)
    }
  })  
})

module.exports = router
