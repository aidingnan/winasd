const sata = require('./components/diskman')

sata.once('status', status => {
  console.log(new Error('stack'))
  console.log(status)
  console.log(sata)
  sata.format(err => console.log(err))
})
