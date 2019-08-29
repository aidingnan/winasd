const child = require('child_process')

const loop = () => {
  let winasd = child.spawn('node', ['src/app.js'])
  winasd.stdout.on('data', data => {
    let text = data.toString().trim()
    if (!text.includes('register application')) {
      console.log(text)
    }

    // if (text.includes('ecc exec failure')) {
    //   process.exit()
    // }

    if (text.includes('telsa emit error')) {
      winasd.kill()
      setTimeout(() => loop(), 2000)
    }
  })
}

loop()
