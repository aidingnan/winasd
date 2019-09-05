// this is a higher order function
// returns a racer function, which is also a higher order function
const racer = () => {
  // this function accepts a next function and a condition, 
  // which is a synchronous function returning true or false
  // this function could be called multiple times on different next function
  // this function guarantees only one of the next functions is involke and 
  // others rendered void
  let fired = false
  return (next, condition, tag) => {
    return (...args) => {
      if (fired) return
      if (condition && !condition(...args)) return
      fired = true
      next(...args)
    }
  } 
}

module.exports = racer
