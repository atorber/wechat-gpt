#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/*
修改config.json配置文件，即修改api配置
*/
import fs from 'fs'
const config:any = JSON.parse(fs.readFileSync('src/config.json', 'utf8'))
const history:any = JSON.parse(fs.readFileSync('src/history.json', 'utf8'))

function updateConfig (config:any) {
  fs.writeFileSync('src/config.json', JSON.stringify(config, null, '\t'))
}

function updateHistory (history:any) {
  fs.writeFileSync('src/history.json', JSON.stringify(history, null, '\t'))
}

function getConfig () {
  return config
}

function getHistory () {
  return history
}

function getChatGPTConfig (textArr: string[]) {

  const config = {
    endpoint: textArr[2],
    historyContextNum: 6,
    key: textArr[1],
    maxTokenNum: 100,
    systemPrompt: '',
    temperature: 1,
    timeout: 60,
    userPrompt: '',
  }

  return config

}

function storeHistory (history:any, id:string, role:string, content:string) {

  if (history[id]) {
    history[id].historyContext.push({ content, role })
    history[id].time.push(new Date().toLocaleString())
  } else {
    history[id] = {
      historyContext: [],
      time: [],
    }
    history[id].historyContext.push({ content, role })
    history[id].time.push(new Date().toLocaleString())
  }
  return history

}

export { getConfig, getHistory, updateConfig, updateHistory, getChatGPTConfig, storeHistory }
