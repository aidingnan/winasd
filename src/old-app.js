// change current working directory
process.chdir(require('path').dirname(__dirname))

const fs = require('fs')
const child = require('child_process')
const Config = require('config')

if (!Config.cloud.id) {
  const serial = fs.readFileSync('/run/cowroot/root/data/init/sn').toString().trim()

  if (/^0123[0-9a-f]{12}ee$/.test(serial)) {
    Config.cloud.id = serial
    console.log(`set Config.cloud.id to ${serial}`)
  } else {
    throw new Error(`invalid atecc serial ${serial}`)
  }
}

const express = require('express')
const logger = require('morgan')
const bodyParser = require('body-parser')
const AppService = require('./services')
const resMiddware = require('./middleware/res')

const app = express()
const appService = new AppService()

app.set('json spaces', 0)
app.use(logger('dev', { skip: (req, res) => res.nolog === true || app.nolog === true }))
// install body parser
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(resMiddware)
app.get('/', (req, res) => res.status(200).send('Welcome to winasd'))

app.get('/info', (req, res, next) => res.success(appService.view()))
app.use('/winasd', require('./routes/winasd')(appService))

// 404 handler
app.use((req, res, next) => next(Object.assign(new Error('404 Not Found'), { status: 404 })))

// 500 handler
app.use((err, req, res, next) => {
  if (err) {
    if (req.log || process.env.LOGE) {
      console.log(':: ', err)
    }
  }

  // TODO check nodejs doc for more error properties such as syscall.
  res.status(err.status || 500).json({
    code: err.code,
    xcode: err.xcode,
    message: err.message,
    result: err.result,
    index: err.index,
    reason: err.reason,
    where: err.where
  })
})

app.listen(3001, err => {
  if (err) return console.log('winasd listen error: ', err.message)
  console.log('winasd started on port 3001')
})

/**
 * argv: not implement
 *  --withoutWinas: start winasd  without winas
 *  --withoutEcc: start winasd without ecc, use openssl
 */
