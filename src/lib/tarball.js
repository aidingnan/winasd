const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec
const zlib = require('zlib')
const tar = require('tar-stream')


const inject = (oldPath, newPath, filename, data, callback) => {
  let rs, gunzip, extract, pack, gzip, ws
  let destroyed = false
  let finished = false
  let injected = false

  const destroy = () => {
    if (destroyed || finished) return 
    this.destroy = true

    const strip = x => (x.removeAllListeners(), x.on('error', () => {}))

    strip(rs)
    strip(gunzip)
    strip(extract)
    strip(pack)
    strip(gzip)
    strip(ws)

    rs.unpipe()
    gunzip.unpipe()
    pack.unpipe()
    gzip.unpipe()    

    rs.destroy()
    ws.destroy()
  }

  rs = fs.createReadStream(oldPath)
  gunzip = zlib.createGunzip()
  extract = tar.extract()
  pack = tar.pack()
  gzip = zlib.createGzip()
  ws = fs.createWriteStream(newPath, { flags: 'w+' })

  rs.on('error', err => (destroy(), callback(err)))
  gunzip.on('error', err => (destroy(), callback(err)))
  extract.on('error', err => (destroy(), callback(err)))
  pack.on('error', err => (destroy(), callback(err)))
  gzip.on('error', err => (destroy(), callback(err)))
  ws.on('error', err => (destroy(), callback(err)))

  /**
  Don't know why the original code do it in two different places, exclusively
  */

  extract.on('entry', (header, stream, done) => {

    // strip leading directory and prefix with dot
    header.name = '.' + header.name.slice(header.name.indexOf('/'))

    if (!injected) {
      let filePath = './' + filename

      // Positive when the referenceStr occurs after compareStr
      if (header.name.localeCompare(filePath) > 0) {
        pack.entry({ name: filePath }, data)
        injected = true
      }
    }

    stream.pipe(pack.entry(header, done))
  }) 

  extract.on('finish', () => {
    if (!injected) {
      let filePath = './' + filename
      pack.entry({ name: filePath }, data)
      injected = true
    }

    pack.finalize()
  })

  ws.on('close', () => callback(null))

  rs.pipe(gunzip).pipe(extract)
  pack.pipe(gzip).pipe(ws)
}

/**
@param {string} tarpath - tarball file path
@param {string} filepath - file path in tarball (should prefixed with ./)
*/
const cherryPick = (tarpath, filepath, callback) => {
  let gunzip = zlib.createGunzip()
  let extract = tar.extract() 
  let recording = false
  let stringBuffer = null
  let error = null

  extract.on('entry', function(header, stream, done) {
    recording = header.name === filepath ? true : false

    stream.on('data', data => {
      if (recording) {
        if (stringBuffer === null)
          stringBuffer = data.toString()
        else 
          stringBuffer += data.toString() 
      }
    })

    stream.on('end', () => {
      recording = false
      done()
    })

    stream.resume()
  })

  extract.on('error', e => callback(e))
  extract.on('finish', () => {
    callback(null, stringBuffer)
  })

  fs.createReadStream(tarpath).pipe(gunzip).pipe(extract)
}

const untarDry = (tarpath, callback) => {
  let destroyed = false
  let finished = false
  let child = exec(`tar xOzf ${tarpath} > /dev/null`, err => (finished = true, !destroyed && callback(err)))
  return {
    destroy: () => {
      if (destroyed || finished) return
      destroyed = true
      child.kill()
    }
  }
}

const untar = (tarpath, target, callback) => {
  let destroyed = false
  let finished = false
  let child = exec(`tar xzf ${tarpath} -C ${target}`, err => (finished = true, !destroyed && callback(err)))
  return {
    destroy: () => {
      if (destroyed || finished) return
      destroyed = true
      child.kill()
    }
  } 
}

module.exports = {
  inject,
  cherryPick,
  untarDry,
  untar
}