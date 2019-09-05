const express = require('express')
const router = express.Router()

const unbind = require('../actions/unbind')
const timedate = require('../lib/timedate')

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
  let { encrypted, authToken, cleanVolume } = req.body
  if (cleanVolume === undefined) cleanVolume = false

  if (typeof encrypted !== 'string' || !encrytped ||
    typeof authToken !== 'string' || !authToken ||
    typeof cleanVolume !== 'boolean') {
    return res.status(400).end()
  }

  if (!auth.verify(authToken)) return res.status(401).end()

  unbind(encrytped, cleanVolume, (err, data) => {
        
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
