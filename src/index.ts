#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
import 'dotenv/config.js'

import {
  Contact,
  Message,
  ScanStatus,
  WechatyBuilder,
  log,
} from 'wechaty'

import qrcodeTerminal from 'qrcode-terminal'
import { getConfig, getHistory, updateConfig, updateHistory, getChatGPTConfig, storeHistory } from './config.js'
import { getChatGPTReply } from './chatgpt.js'

const config = getConfig()
let history = getHistory()

// 设置定时任务，每隔 10 秒执行一次
setInterval(() => {
  updateConfig(config)
  updateHistory(history)
}, 3000)

log.info('config:', JSON.stringify(config, null, '\t'))

function onScan (qrcode: string, status: ScanStatus) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    const qrcodeImageUrl = [
      'https://wechaty.js.org/qrcode/',
      encodeURIComponent(qrcode),
    ].join('')
    log.info('StarterBot', 'onScan: %s(%s) - %s', ScanStatus[status], status, qrcodeImageUrl)

    qrcodeTerminal.generate(qrcode, { small: true })  // show qrcode on console

  } else {
    log.info('StarterBot', 'onScan: %s(%s)', ScanStatus[status], status)
  }
}

function onLogin (user: Contact) {
  log.info('StarterBot', '%s login', user)
}

function onLogout (user: Contact) {
  log.info('StarterBot', '%s logout', user)
}

async function onMessage (msg: Message) {
  log.info('onMessage', JSON.stringify(msg))

  const talker = msg.talker()
  const room = msg.room()
  const text = msg.text()

  let rePly:any = {}
  let curId = ''

  if (room) {
    curId = room.id
  } else {
    curId = talker.id
  }
  log.info('curId', curId)

  const curConfig = config[curId] || undefined

  enum KeyWords {
    Help = '#帮助',
    HelpText = '发送"#绑定+ChatGPT的key+API地址"绑定GPT配置信息,例如：\n/绑定+sk-zsL0e6orgRxxxxxx3BlbkFJd2BxgPfl5aB2D7hFgeVA+https://api.openai.com',
  }

  if (text[0] === '#') {
    switch (text) {
      case KeyWords.Help:
        await msg.say(KeyWords.HelpText)
        break
      default:
        log.info('不支持的指令')
    }
    const textArr = text.split('+')
    log.info('textArr', textArr)
    if (textArr.length === 3 && textArr[0] === '#绑定') {
      log.info('textArr', textArr)
      const curConfig = getChatGPTConfig(textArr)
      rePly = await getChatGPTReply(curConfig, [ { content:'你能干什么？', role:'user' } ])
      if (rePly['role'] !== 'err') {
        await msg.say('恭喜你配置成功，我是你的ChatGPT智能助手~\n\n' + rePly['content'])
        history = storeHistory(history, curId, 'user', '你能干什么？')
        history = storeHistory(history, curId, rePly.role, rePly.content)
        config[curId] = curConfig
      } else {
        await msg.say('你提供的配置信息有误或权限不足，请直接使用key请求api验证配置信息是否正确')
        delete config[curId]
      }

    }
  } else {
    if (curConfig) {
      history = storeHistory(history, curId, 'user', text)
      rePly = await getChatGPTReply(curConfig, history[curId].historyContext.slice(curConfig.historyContextNum * (-1)))
      await msg.say(rePly['content'])
      if (rePly['role'] !== 'err') {
        history = storeHistory(history, curId, rePly.role, rePly.content)
      } else {
        history[curId].historyContext.pop()
      }
    } else {
      log.info('curConfig', curConfig)
    }
  }
}

const bot = WechatyBuilder.build({
  name: 'WechatGPT',
  puppet: 'wechaty-puppet-wechat4u',
})

bot.on('scan',    onScan)
bot.on('login',   onLogin)
bot.on('logout',  onLogout)
bot.on('message', onMessage)

bot.start()
  .then(() => log.info('StarterBot', 'Starter Bot Started.'))
  .catch(e => log.error('StarterBot', e))
