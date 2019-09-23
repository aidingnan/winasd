const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')

/* '1009-EXJM-6TIK' */
module.exports = (usn, debug) => {

  if (!/^[0-9]{4}-E[234567A-Z]{3}-[234567A-Z]{4}$/.test(usn)) {
    console.log('------')
    console.log(usn)
    console.log('------')
    throw new Error('invalid usn format')
  }

  const n = [...usn.slice(6, 9).split(''), ...usn.slice(10, 14)]
    .map(c => a.indexOf(c))
    .reverse()
    .reduce((sum, n, i) => sum + n * Math.pow(32, i), Math.pow(32, 7) * 
      (parseInt(usn.slice(2, 4)) - 3 + parseInt(usn.slice(0, 2) - 10) * 96))

  if (debug) console.log('n', n)

  return `0123${n.toString(16).padStart(12, '0')}ee`
}
