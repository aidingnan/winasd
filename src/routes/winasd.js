const Router = require('express').Router
const child = require('child_process')

module.exports = (appService) =>{
  const router = new Router()
  // 关机重启api
  router.patch('/', (req, res) => {
    appService.PATCH(req.user, req.body, err => {
      if (err) return res.error(err)
      res.success()
    })
  })
  // get device info
  router.get('/info', (req, res, next) => {
    res.success(appService.view())
  })
  router.use('/upgrade', require('./upgrade')(appService))
  
  // update device name
  router.post('/device', (req, res, next) => {
    let { name } = req.body
    if (typeof name !== 'string' || !name.length) return res.error(new Error('invald name'), 400)
    appService.updateDeviceName(req.user, name, err => 
      err ? res.error(err) : res.success())
  })

  // request start localAuth
  router.patch('/localAuth', (req, res, next) => {
    if (!appService.localAuth) return res.status(400).end({ code: 'ESTATE' })
    appService.localAuth.request((err, data) => {
      if (err) return res.error(err)
      res.success(data)
    })
  })

  // verify localAuth
  router.post('/localAuth', (req, res, next) => {
    if (!appService.localAuth) return res.status(400).end({ code: 'ESTATE' })
    appService.localAuth.auth(req.body, (err, data) => {
      if (err) return res.error(err)
      res.success(data)
    })
  })

  // request bind device
  router.post('/bind', (req, res, next) => {
    if (!req.body.encrypted) return res.error(new Error('invalid encrypted'), 400)
    appService.requestBind(req.body.encrypted, (err, data) => {
      console.log(err)
      if (err) return res.error(err)
      res.success(data)
    })
  })

  // request unbind device
  router.post('/unbind', (req, res, next) => {
    if (!appService.localAuth) return res.status(400).end({ code: 'ESTATE' })
    if (!req.body.encrypted || !req.body.authToken) return res.status(400).end()
    if (req.body.cleanVolume !== undefined && typeof req.body.cleanVolume !== 'boolean') return res.status(400).end()
    // verify localAuth token
    if (!appService.localAuth || !appService.localAuth.verify(req.body.authToken)) return res.status(400).json({ code: 'EAUTH' })
    appService.requestUnbind(req.body.encrypted, req.body.cleanVolume, (err, data) => {
      console.log(err)
      if (err) return res.error(err)
      res.success(data)
    })
  })

  // timedatectl
  router.get('/timedate', (req, res) => child.exec('timedatectl', (err, stdout, stderr) => {
    if (err || stderr) {
      res.status(500).json({code: err.code, message: err.message})
    } else {
      let timedate = stdout
        .toString()
        .split('\n')
        .filter(l => l.length)
        .reduce((prev, curr) => {
          let pair = curr.split(': ').map(str => str.trim())
          prev[pair[0]] = pair[1]
          return prev
        }, {})
      res.status(200).json(timedate)
    }
  }))
  
  return router
}