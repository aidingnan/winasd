const express = require('express')
const router = express.Router()

const upgrade = require('./upgrade')

// shutdown / reboot
router.patch('/', (req, res) => {
})

// upgrade
router.use('/upgrade', upgrade) 

// update devices name
router.post('/device', (req, res, next) => {
})

router.patch('/localAuth', (req, res, next) => {
})

router.post('/localAuth', (req, res, next) => {
})

router.post('/bind', (req, res, next) => {
})

router.post('/unbind', (req, res, next) => {
})

router.post('/timedate', (req, res) => {
})

module.exports = router
