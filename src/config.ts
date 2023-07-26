#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/* eslint-disable sort-keys */
/*
修改config.json配置文件，即修改api配置
*/
import fs from 'fs'
import type { BaseConfig, ChatData, WhiteList } from './types/mod.js'

const baseConfig:BaseConfig = {
  admin:{
    name:'管理员信息',
    items:{
      roomid: {
        name:'管理员群ID',
        value:process.env['ADMIN_ROOMID'] || '', // 管理群ID
      },
      wxid: {
        name:'管理员微信ID',
        value:process.env['ADMIN_WXID'] || '', // 管理员微信ID
      },
    },
  },
  baiduvop: {
    name: '百度云语音转文字服务',
    items:{
      ak: {
        name:'Access Key',
        value:process.env['BAIDUVOP_AK'] || '', // 百度云语音转文字接口ak
      },
      sk: {
        name:'Secret Key',
        value:process.env['BAIDUVOP_SK'] || '', // 百度云语音转文字接口sk
      },
    },

  },
  openai:{
    name:'ChatGPT配置信息',
    items:{
      endpoint: {
        name:'API地址',
        value:process.env['OPENAI_ENDPOINT'] || 'https://api.openai.com', // openai api地址
      },
      key: {
        name:'API密钥',
        value:process.env['OPENAI_API_KEY'] || '', // openai api密钥
      },

    },

  },
  wechaty: {
    name:'Wechaty',
    items:{
      puppet: {
        name:'Puppet名称',
        value:process.env['WECHATY_PUPPET'] || 'wechaty-puppet-wechat4u', // wechaty-puppet-padlocal、wechaty-puppet-service、wechaty-puppet-wechat、wechaty-puppet-wechat4u、wechaty-puppet-xp（运行npm run wechaty-puppet-xp安装）
      },
      token:{
        name:'PuppetToken',
        value: process.env['WECHATY_TOKEN'] || '', // wechaty token
      },
    },

  },
}

const config:any = JSON.parse(fs.readFileSync('data/config.json', 'utf8'))
const history:any = JSON.parse(fs.readFileSync('data/history.json', 'utf8'))
const talk:any = JSON.parse(fs.readFileSync('data/talk.json', 'utf8'))
const record:any = JSON.parse(fs.readFileSync('data/record.json', 'utf8'))

function saveConfigFile (config:WhiteList) {
  fs.writeFileSync('data/config.json', JSON.stringify(config, null, '\t'))
}

function updateHistory (history:ChatData) {
  fs.writeFileSync('data/history.json', JSON.stringify(history, null, '\t'))
}

function updateRecord (record:any) {
  fs.writeFileSync('data/record.json', JSON.stringify(record, null, '\t'))
}

function updateTalk (talk:any) {
  fs.writeFileSync('data/talk.json', JSON.stringify(talk, null, '\t'))
}

function updateData (data:any, filename:string) {
  fs.writeFileSync(`data/${filename}.json`, JSON.stringify(data, null, '\t'))
}

function getConfig () {
  return config
}

function getHistory () {
  return history
}

function getTalk () {
  return talk
}

function getRecord () {
  return record
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

function storeHistory (history:ChatData, id:string, role:'user' | 'assistant' | 'system', content:string) {

  if (history[id]) {
    history[id]?.historyContext.push({ content, role })
    history[id]?.time.push(new Date().toLocaleString())
  } else {
    history[id] = {
      historyContext: [],
      time: [],
    }
    history[id]?.historyContext.push({ content, role })
    history[id]?.time.push(new Date().toLocaleString())
  }
  return history

}

export {
  getConfig,
  getHistory,
  getTalk,
  getRecord,
  saveConfigFile,
  updateHistory,
  updateRecord,
  updateTalk,
  updateData,
  getChatGPTConfig,
  storeHistory,
  baseConfig,
}
