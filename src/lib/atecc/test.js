const initEcc = require('./index')

const initEccAsync = async () => 
  new Promise((resolve, reject) => 
    initEcc(1, (err, ecc) => err
      ? reject(err)
      : resolve(ecc)))

const testAsync = async () => {
  let ecc = await initEccAsync()

  console.log('counter 0 read', await ecc.ecc.counterAsync('read', 0))
  console.log('counter 1 read', await ecc.ecc.counterAsync('read', 1))
  await ecc.ecc.counterAsync('incr', 1)
  console.log('counter 1 read', await ecc.ecc.counterAsync('read', 1))
  console.log('random', await ecc.ecc.randomAsync())
}

testAsync()
  .then(() => {})
  .catch(e => e && console.log(e))
