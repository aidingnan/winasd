const Router = require('express').Router

module.exports = (service) =>{
  const router = new Router()
  router.get('/', (req, res, next) => {
    service.upgrade.LIST({}, req.body, (err, data) => {
      err ? res.error(err) : res.success(data)
    })
  })

  // router.post('/', (req, res, next) => {
  //   service.upgradeDevice(req.body.version ,(err, data) => {
  //     err ? res.error(err) : res.success(data)
  //   })
  // })

  return router
}