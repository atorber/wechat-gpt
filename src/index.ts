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
import { FileBox } from 'file-box'

// 导入html-to-docx模块
import htmlToDocx from 'html-to-docx'

const config = getConfig()
let history = getHistory()

enum KeyWords {
  Help = '#帮助',
  BingdText = '发送 #绑定+ChatGPT的key+API地址 绑定GPT配置信息,例：\n\n#绑定+sk-zsL0e6orgRxxxxxx3BlbkFJd2BxgPfl5aB2D7hFgeVA+https://api.openai.com',
  TemperatureText = '发送 #发散度+目标值 设置发散度，发散度取值范围0-1，例：\n\n#发散度+0.8',
  MaxTokenText = '发送 #最大长度+目标值 设置返回消息的最大长度，例：\n\n#最大长度+2048',
  HistoryContextNumText = '发送 #历史上下文数量+目标值 设置请求携带历史消息的数量，建议值1-6，例：\n\n#历史上下文数量+6',
  SystemPromptText = '发送 #系统提示词+提示词内容 设置系统提示词，例：\n\n#系统提示词+你是一个中英文互译助手，将用户输入在中英文之间互译',
  TimeoutText = '发送 #超时时间+目标值 设置请求超时时间，建议值30-90，例：\n\n#超时时间+30',
  ExportFile = '#导出文件',
  ClearHistory = '#清理历史消息'
  // ExportDoc = '#导出文档'
}

// 设置定时任务，每隔 10 秒执行一次
setInterval(() => {
  updateConfig(config)
  updateHistory(history)
}, 3000)

log.info('config:', JSON.stringify(config, null, '\t'))

async function exportFile (history:any[]) {
  try {
    const time = new Date().toLocaleString()
    let content = `<h2>导出时间</h2><br> ${time}<br><h2>内容记录</h2><br>`
    for (const record of history) {
      content += `${record.role} <br>${record.content}<br>`
    }
    // 使用html-to-docx库将会议聊天信息转换为word文档的buffer对象
    const buffer = await htmlToDocx(content)
    const reg = /[^a-zA-Z0-9]/g
    // 将buffer对象转换为FileBox对象，用于发送文件
    const fileBox = FileBox.fromBuffer(buffer, `${time.replace(reg, '')}.docx`)
    return fileBox

  } catch (err) {

    // 如果出现错误，打印错误信息，并回复给群聊
    log.error('导出失败', err)
    return '导出失败，请重试'
  }
}

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
  const curHistory = history[curId] || undefined

  if (text[0] === '#') {
    const helpText = `操作指令：\n\n${KeyWords.BingdText}\n\n${KeyWords.TemperatureText}\n\n${KeyWords.MaxTokenText}\n\n${KeyWords.HistoryContextNumText}\n\n${KeyWords.TimeoutText}\n\n${KeyWords.SystemPromptText}\n\n发送 ${KeyWords.ClearHistory} 清理历史消息\n\n发送 ${KeyWords.ExportFile} 可导出最近历史聊天记录为word文档`
    switch (text) {
      case KeyWords.Help:
        await msg.say(helpText)
        break
      case KeyWords.ExportFile:
        if (curHistory) {
          await msg.say(await exportFile(curHistory.historyContext))
        } else {
          await msg.say('没有可导出的内容')
        }
        break
      case KeyWords.ClearHistory:
        if (curHistory) {
          curHistory.historyContext = []
          history[curId] = curHistory
          await msg.say('历史消息清理完成~')
        } else {
          await msg.say('无需清理~')
        }
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
    if (textArr.length === 2 && textArr[0] === '#系统提示词') {
      log.info('textArr', textArr)
      try {
        const systemPrompt = Number(textArr[1])
        if (curConfig) {
          curConfig['systemPrompt'] = systemPrompt
          config[curId] = curConfig
          await msg.say(`系统提示词已设置为：${systemPrompt}`)
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
      const messages:any[] = history[curId].historyContext.slice(curConfig.historyContextNum * (-1))
      if (curConfig.systemPrompt) {
        messages.unshift({ content:curConfig.systemPrompt, role:'system' })
      }
      rePly = await getChatGPTReply(curConfig, messages)
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
