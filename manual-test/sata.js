const sata = require('./components/sata')

sata.once('statusUpdate', status => {
  console.log(new Error('stack'))
  console.log(status)
  console.log(sata)
  sata.format(err => console.log(err))
})
