const express = require('express')
const router = express.Router()

const timedate = require('../lib/timedate')
const auth = require('../components/local-auth')
const unbind = require('../actions/unbind')


router.patch('/', (req, res) => {
})

router.get('/upgrade', (req, res) => {
}) 

router.post('/device', (req, res, next) => {
})

router.patch('/localAuth', (req, res, next) => {
})

router.post('/localAuth', (req, res, next) => {
})

router.post('/bind', (req, res, next) => {
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
