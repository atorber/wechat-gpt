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

enum KeyWords {
  Help = '#帮助',
  BingdText = '发送 #绑定+ChatGPT的key+API地址 绑定GPT配置信息,例：\n\n#绑定+sk-zsL0e6orgRxxxxxx3BlbkFJd2BxgPfl5aB2D7hFgeVA+https://api.openai.com',
  TemperatureText = '发送 #发散度+目标值 设置发散度，发散度取值范围0-1，例：\n\n#发散度+0.8',
  MaxTokenText = '发送 #最大长度+目标值 设置返回消息的最大长度，例：\n\n#最大长度+2048',
  HistoryContextNumText = '发送 #历史上下文数量+目标值 设置请求携带历史消息的数量，建议值1-6，例：\n\n#历史上下文数量+6',
  TimeoutText = '发送 #超时时间+目标值 设置请求超时时间，建议值30-90，例：\n\n#超时时间+30'
}

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

  if (text[0] === '#') {
    const helpText = `操作指令：\n\n${KeyWords.BingdText}\n\n${KeyWords.TemperatureText}\n\n${KeyWords.MaxTokenText}\n\n${KeyWords.HistoryContextNumText}\n\n${KeyWords.TimeoutText}`
    switch (text) {
      case KeyWords.Help:
        await msg.say(helpText)
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
        await msg.say('输入的配置信息有误或权限不足，请使用key请求api验证配置信息是否正确后重试')
        delete config[curId]
      }
    }
    if (textArr.length === 2 && textArr[0] === '#发散度') {
      log.info('textArr', textArr)
      try {
        const temperature = Number(textArr[1])
        if (curConfig) {
          curConfig['temperature'] = temperature
          config[curId] = curConfig
          await msg.say(`分散度已设置为${temperature}`)
        } else {
          await msg.say('未配置key，不能设置参数')
        }
      } catch (err) {
        await msg.say('指令格式有误，请检查后重新输入')
      }
    }
    if (textArr.length === 2 && textArr[0] === '#最大长度') {
      log.info('textArr', textArr)
      try {
        const maxTokenNum = Number(textArr[1])
        if (curConfig) {
          curConfig['maxTokenNum'] = maxTokenNum
          config[curId] = curConfig
          await msg.say(`最大长度已设置为${maxTokenNum}`)
        } else {
          await msg.say('未配置key，不能设置参数')
        }
      } catch (err) {
        await msg.say('指令格式有误，请检查后重新输入')
      }
    }
    if (textArr.length === 2 && textArr[0] === '#历史上下文数量') {
      log.info('textArr', textArr)
      try {
        const historyContextNum = Number(textArr[1])
        if (curConfig) {
          curConfig['historyContextNum'] = historyContextNum
          config[curId] = curConfig
          await msg.say(`历史上下文数量已设置为${historyContextNum}`)
        } else {
          await msg.say('未配置key，不能设置参数')
        }
      } catch (err) {
        await msg.say('指令格式有误，请检查后重新输入')
      }
    }
    if (textArr.length === 2 && textArr[0] === '#超时时间') {
      log.info('textArr', textArr)
      try {
        const timeout = Number(textArr[1])
        if (curConfig) {
          curConfig['timeout'] = timeout
          config[curId] = curConfig
          await msg.say(`超时时间已设置为${timeout}秒`)
        } else {
          await msg.say('未配置key，不能设置参数')
        }
      } catch (err) {
        await msg.say('指令格式有误，请检查后重新输入')
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
      log.info('curConfig 不存在')
    }
  }
}

const bot = WechatyBuilder.build({
  name: 'WechatGPT',
  puppet: 'wechaty-puppet-wechat4u',
})

// const bot = WechatyBuilder.build({
//   name: 'WechatGPT',
//   puppet: 'wechaty-puppet-padlocal',
//   puppetOptions:{
//     token: 'padlocal token',
//   },
// })

bot.on('scan',    onScan)
bot.on('login',   onLogin)
bot.on('logout',  onLogout)
bot.on('message', onMessage)

bot.start()
  .then(() => log.info('StarterBot', 'Starter Bot Started.'))
  .catch(e => log.error('StarterBot', e))
