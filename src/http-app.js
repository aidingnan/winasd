const app = require('express')()
const logger = require('morgan')
const bodyParser = require('body-parser')

const resMiddware = require('./middleware/res')

const info = require('./routes/info')
const actions = require('./routes/actions')

/**
set app.nolog to true skip all log
set single res.nolog to true skip single api log
*/
app.use(logger('dev', { skip: (req, res) => res.nolog === true || app.nolog === true }))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// what is this ??? TODO
app.use(resMiddware)

app.get('/', (req, res) => res.status(200).send('Welcome to winasd'))

// app.get('/info', (req, res, next) => res.success(appService.view()))
app.use('/info', info) 
app.use('/winasd', actions)

// 404 handler
app.use((req, res, next) => next(Object.assign(new Error('404 Not Found'), { status: 404 })))

// 500 handler
app.use((err, req, res, next) => {
  // log error, why req.log ??? TODO
  if (err && (req.log || process.env.LOGE)) console.log(':: ', err)

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
  if (err) {
    console.log('winasd http server failed to start: ', err.message)
  } else {
    console.log('winasd http server started on port 3001')
  }
})
