/*
修改config.json配置文件，即修改api配置
*/
import fs from 'fs'
let config:any = fs.readFileSync('src/config.json', 'utf8')
config = JSON.parse(config)

export { config }
