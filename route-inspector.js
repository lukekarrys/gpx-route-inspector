const path = require('path')
const _ = require('lodash')
const fs = require('fs')
const { exec } = require('child-process-promise')

module.exports = async (csv, start) => {
  const dir = process.cwd()
  const csvPath = path.resolve(dir, '.output.csv')
  const postmanPath = path.resolve(dir, 'postman_problems')

  fs.writeFileSync(csvPath, csv)

  const { stderr: res } = await exec(
    `chinese_postman --edgelist ${csvPath} --start_node ${start}`,
    { cwd: postmanPath }
  )

  fs.unlinkSync(csvPath)

  return res
    .split('\n')
    .filter(l => l.startsWith('INFO:postman_problems.postman_template:('))
    .map(l => l.match(/INFO:postman_problems.postman_template:\((.*)\)/)[1])
    .map(l => l.split(',').map(s => s.trim().replace(/['{}]/g, '')))
    .map(l => l.map(s => s.split(': ')[1] || s))
    .map(l => ({
      start: l[0],
      end: l[1],
      name: _.last(l[5].split('--'))
    }))
}
