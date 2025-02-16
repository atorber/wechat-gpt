#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/* eslint-disable sort-keys */
/*
修改config.json配置文件，即修改api配置
*/
import fs from 'fs'
import type { BaseConfig, ChatData, WhiteList } from './types/mod.js'
import dotenv from 'dotenv'
// 加载环境变量
dotenv.config()

export const CONFIG = {
  OPENAI_API_KEY: process.env['OPENAI_API_KEY'] || '',
  OPENAI_BASE_URL: process.env['OPENAI_API_BASE_URL'] || '',
  OPENAI_MODEL: process.env['OPENAI_MODEL'] || '',
  COZE_TOKEN: process.env['COZE_TOKEN'] || '',
  MJ_TOKEN: process.env['MJ_TOKEN'] || '',
  BOT_ID: process.env['BOT_ID'] || '',
  WECHATY_PUPPET: process.env['WECHATY_PUPPET'] || '',
  WECHATY_TOKEN: process.env['WECHATY_TOKEN'] || '',
  DEFAULT_AVATAR: 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
}

export const baseConfig: BaseConfig = {
  admin: {
    name: '管理员信息',
    items: {
      roomTopic: {
        name: '管理员群',
        value: process.env['ADMIN_ROOM_TOPIC'] || '', // 管理群名称
      },
      wxName: {
        name: '管理员微信',
        value: process.env['ADMIN_WX_NAME'] || '', // 管理员微信昵称
      },
      roomid: {
        name: '管理员群',
        value: process.env['ADMIN_ROOM_ID'] || '', // 管理群名称
      },
      wxid: {
        name: '管理员微信',
        value: process.env['ADMIN_WX_ID'] || '', // 管理员微信昵称
      },
    },
  },
  baiduvop: {
    name: '百度云语音转文字服务',
    items: {
      ak: {
        name: 'Access Key',
        value: process.env['BAIDUVOP_AK'] || '', // 百度云语音转文字接口ak
      },
      sk: {
        name: 'Secret Key',
        value: process.env['BAIDUVOP_SK'] || '', // 百度云语音转文字接口sk
      },
    },

  },
  openai: {
    name: 'ChatGPT配置信息',
    items: {
      endpoint: {
        name: 'API地址',
        value: process.env['OPENAI_API_BASE_URL'] || 'https://api.openai.com',
      },
      key: {
        name: 'API密钥',
        value: process.env['OPENAI_API_KEY'] || '',
      },
      model: {
        name: '模型版本',
        value: process.env['OPENAI_MODEL'] || '',
      },

    },

  },
  wechaty: {
    name: 'Wechaty',
    items: {
      puppet: {
        name: 'Puppet名称',
        value: process.env['WECHATY_PUPPET'] || 'wechaty-puppet-wechat4u', // wechaty-puppet-padlocal、wechaty-puppet-service、wechaty-puppet-wechat、wechaty-puppet-wechat4u、wechaty-puppet-xp（运行npm run wechaty-puppet-xp安装）
      },
      token: {
        name: 'PuppetToken',
        value: process.env['WECHATY_TOKEN'] || '', // wechaty token
      },
    },

  },
}

const talk: any = JSON.parse(fs.readFileSync('data/talk.json', 'utf8'))

export class BotConfig {

  wxid: string

  constructor (wxid: string) {
    this.wxid = wxid
  }

  updateHistory (curHistory: ChatData) {

  }

  updateRecord (curRecord: any) {
  }

  updateTalk (curTalk: any) {
    talk[this.wxid] = curTalk
    fs.writeFileSync('data/talk.json', JSON.stringify(talk, null, '\t'))
  }

  updateData (data: any, filename: string) {
    fs.writeFileSync(`data/${filename}.json`, JSON.stringify(data, null, '\t'))
  }

  getConfig () {
    const curConfig = {
      lastSave: '2024/9/29 18:49:58',
      lastUpdate: '2024/9/29 18:16:46',
      whiteList: {},
    }
    return curConfig
  }

  getHistory () {
    const curHistory = {
      historyContext: [],
      time: [],
    }
    return curHistory
  }

  getTalk () {
    const curTalk = talk[this.wxid] || {}
    return curTalk
  }

  getRecord () {
    const curRecord: any[] = []
    return curRecord
  }

  getChatGPTConfig (textArr: string[]) {

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

  storeHistory (history: ChatData, id: string, role: 'user' | 'assistant' | 'system', content: string) {
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

}
