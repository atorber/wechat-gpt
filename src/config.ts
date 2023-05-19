#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/*
修改config.json配置文件，即修改api配置
*/
import fs from 'fs'

const baseConfig = {
  admin:{
    roomid: process.env['admin_roomid'] || '', // 管理群ID
    wxid: process.env['admin_wxid'] || '', // 管理员微信ID
  },
  baiduvop: {
    ak: process.env['baiduvop_ak'] || '', // 百度云语音转文字接口ak
    sk: process.env['baiduvop_sk'] || '', // 百度云语音转文字接口sk
  },
  openai:{
    endpoint: process.env['openai_endpoint'] || 'https://api.openai-proxy.com', // openai api地址
    key: process.env['openai_key'] || '', // openai api密钥
  },
  wechaty: {
    puppet: process.env['wechaty_puppet'] || 'wechaty-puppet-wechat4u', // wechaty-puppet-padlocal、wechaty-puppet-service、wechaty-puppet-wechat、wechaty-puppet-wechat4u、wechaty-puppet-xp（运行npm run wechaty-puppet-xp安装）
    token: process.env['wechaty_token'] || '', // wechaty token
  },
}

const config:any = JSON.parse(fs.readFileSync('src/config.json', 'utf8'))
const history:any = JSON.parse(fs.readFileSync('src/history.json', 'utf8'))

function saveConfigFile (config:any) {
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
    maxTokenNum: 2048,
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

export { getConfig, getHistory, saveConfigFile, updateHistory, getChatGPTConfig, storeHistory, baseConfig }
