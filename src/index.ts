#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
import 'dotenv/config.js'
import { Contact, Message, ScanStatus, types, WechatyBuilder, log } from 'wechaty'
import qrcodeTerminal from 'qrcode-terminal'
import { baseConfig, getConfig, getHistory, saveConfigFile, updateHistory, getChatGPTConfig, storeHistory } from './config.js'
import { getChatGPTReply } from './chatgpt.js'
import { FileBox } from 'file-box'
import htmlToDocx from 'html-to-docx'

/* 将以下两行取消注释可以使用语音请求 */

import { convertSilkToWav } from './utils/voice.js'
import { vop } from './utils/baiduai.js'

/*******************************/

const config = getConfig()
const whiteList = config.whiteList
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

// 设置定时任务，每隔 3 秒执行一次
setInterval(() => {
  config.lastSave = new Date().toLocaleString()
  saveConfigFile(config)
  updateHistory(history)
  // log.info('配置已保存')
}, 3000)

// log.info('config:', JSON.stringify(config, null, '\t'))

function updateConfig (curId:string, curUserConfig:any) {
  if (curUserConfig) {
    whiteList[curId] = curUserConfig
  } else {
    delete whiteList[curId]
    delete history[curId]
  }
  config.whiteList = whiteList
  config.lastUpdate = new Date().toLocaleString()
}

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

  try {
    const talker = msg.talker()
    const room = msg.room()
    let text = msg.text()

    let rePly:any = {}
    let rePlyText:string = ''
    let curId = ''

    if (room) {
      curId = room.id
    } else {
      curId = talker.id
    }
    log.info('curId', curId)

    if (msg.type() === types.Message.Audio) {
      try {
        text = ''

        /* 取消以下注释可以使用语音请求 */

        if (baseConfig.baiduvop.ak) {
          const voiceFile = await msg.toFileBox()
          const fileName = voiceFile.name
          await voiceFile.toFile(fileName)
          log.info('voice:', fileName)
          const newFile = await convertSilkToWav(fileName)
          log.info(newFile)
          const res:any = await vop(newFile)
          log.info('res:', JSON.stringify(res.result[0]))
          if (res.err_msg === 'success.') {
            text = res.result[0]
          }
        } else {
          log.info('baiduvop未配置')
        }

        /**************************/

      } catch (err) {
        log.error('err:', err)
      }
    }

    let curUserConfig = whiteList[curId] || undefined
    let curHistory = history[curId] || undefined
    let curContact: Contact | undefined
    const isAdmin = msg.talker().id === baseConfig.admin.wxid || msg.self()

    if ((msg.type() === types.Message.Text || msg.type() === types.Message.Audio)) {
      if (text[0] === '#') {
        log.info('操作指令：', text)
        let textArr = text.split('+')
        if (isAdmin) {
          if (!room) {
            curId = msg.listener()?.id || ''
            curHistory = history[curId] || undefined
            curUserConfig = whiteList[curId] || undefined
            curContact = await bot.Contact.find({ id:curId })
          }
          log.info('管理员操作，操作指令：', text)

          if (text === '#关闭') {
            if (curUserConfig) {
              updateConfig(curId, '')
              rePlyText = '你的智能助手已关闭~\n'
            } else {
              rePlyText = '智能助手未开启~\n'
            }
            if (room) {
              await msg.say(rePlyText)
            } else {
              await curContact?.say(rePlyText)
            }
          }
          if (textArr[0] === '#充值') {
            if (curUserConfig && textArr.length === 2) {
              const num = Number(textArr[1])
              if (num) {
                curUserConfig['quota'] = (curUserConfig['quota'] || 20) + num
                updateConfig(curId, curUserConfig)
                rePlyText = `已充值成功，当前剩余${curUserConfig['quota']}次`
              } else {
                rePlyText = '充值错误，请重新输入~'
              }
            } else {
              rePlyText = '你还未开通服务，请联系管理员开通~'
            }
            if (room) {
              await msg.say(rePlyText)
            } else {
              await curContact?.say(rePlyText)
            }
          }
          if (text === '#开通') {
            if (baseConfig.openai.key) {
              text = `#绑定+${baseConfig.openai.key}+${baseConfig.openai.endpoint}`
              textArr = text.split('+')
            } else {
              rePlyText = '智能助手未配置~'
            }
          }
        }
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
              curHistory.time = []
              history[curId] = curHistory
              await msg.say('历史消息清理完成~')
            } else {
              await msg.say('无需清理~')
            }
            break
          case '#查询余额':
            if (curUserConfig) {
              await msg.say(`你的剩余对话次数为${curUserConfig['quota'] || 20}次`)
            } else {
              await msg.say('你还未开通服务，请联系管理员开通~')
            }
            break
          default:
            log.info('不是系统操作指令')
        }
        log.info('textArr', textArr)
        if (textArr.length === 3 && textArr[0] === '#绑定') {
          log.info('textArr', textArr)
          const curUserConfig = getChatGPTConfig(textArr)
          rePly = await getChatGPTReply(curUserConfig, [ { content:'你能干什么？', role:'user' } ])
          if (rePly['role'] !== 'err') {
            rePlyText = '配置成功，我是你的智能助手~\n\n' + rePly['content']
            history = storeHistory(history, curId, 'user', '你能干什么？')
            history = storeHistory(history, curId, rePly.role, rePly.content)
            updateConfig(curId, curUserConfig)
          } else {
            rePlyText = '输入的配置信息有误或权限不足，请使用key请求api验证配置信息是否正确后重试'
          }
          if (room || !isAdmin) {
            await msg.say(rePlyText)
          } else {
            await curContact?.say(rePlyText)
          }
        }
        if (textArr.length === 2 && textArr[0] === '#发散度') {
          log.info('textArr', textArr)
          try {
            const temperature = Number(textArr[1])
            if (curUserConfig) {
              curUserConfig['temperature'] = temperature
              updateConfig(curId, curUserConfig)
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
            const systemPrompt = String(textArr[1])
            if (curUserConfig) {
              if (systemPrompt === '清空') {
                curUserConfig['systemPrompt'] = ''
                updateConfig(curId, curUserConfig)
                await msg.say('系统提示词已清空')
              } else {
                curUserConfig['systemPrompt'] = systemPrompt
                whiteList[curId] = curUserConfig
                config.whiteList = whiteList
                curHistory.historyContext = []
                curHistory.time = []
                history[curId] = curHistory
                await msg.say(`历史消息已清理，系统提示词已设置为：${systemPrompt}`)
              }
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
            if (curUserConfig) {
              curUserConfig['maxTokenNum'] = maxTokenNum
              updateConfig(curId, curUserConfig)
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
            if (curUserConfig) {
              curUserConfig['historyContextNum'] = historyContextNum
              updateConfig(curId, curUserConfig)
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
            if (curUserConfig) {
              curUserConfig['timeout'] = timeout
              updateConfig(curId, curUserConfig)
              await msg.say(`超时时间已设置为${timeout}秒`)
            } else {
              await msg.say('未配置key，不能设置参数')
            }
          } catch (err) {
            await msg.say('指令格式有误，请检查后重新输入')
          }
        }
      } else {
        if (curUserConfig && text && !msg.self()) {
          let quota = curUserConfig['quota'] || 100
          if (quota > 0) {
            history = storeHistory(history, curId, 'user', text)
            const messages:any[] = history[curId].historyContext.slice(curUserConfig.historyContextNum * (-1))
            if (curUserConfig.systemPrompt) {
              messages.unshift({ content:curUserConfig.systemPrompt, role:'system' })
            }
            rePly = await getChatGPTReply(curUserConfig, messages)
            await msg.say(rePly['content'])
            if (rePly['role'] !== 'err') {
              history = storeHistory(history, curId, rePly.role, rePly.content)
              quota = quota - 1
              curUserConfig['quota'] = quota
              updateConfig(curId, curUserConfig)
            } else {
              history[curId].historyContext.pop()
            }
          }

          if (quota === 0) {
            await msg.say('配额不足，请联系管理员充值')
          }

        } else {
          log.info('不在白名单内：', curId)
        }
      }
    }
  } catch (err) {
    log.error('onMessage err:', err)
  }

}

// 构建机器人
const ops: any = {
  name: 'WechatGPT',
  puppet: baseConfig.wechaty.puppet,
} // 默认web版微信客户端

const token = baseConfig.wechaty.token
const puppet = baseConfig.wechaty.puppet
log.info('puppet:', puppet)
switch (puppet) {
  case 'wechaty-puppet-service':// 企业版微信客户端
    ops.puppetOptions = { token }
    process.env['WECHATY_PUPPET_SERVICE_NO_TLS_INSECURE_CLIENT'] = 'true'
    process.env['WECHATY_PUPPET_SERVICE_AUTHORITY'] = 'token-service-discovery-test.juzibot.com'
    break
  case 'wechaty-puppet-wechat4u':
    break
  case 'wechaty-puppet-wechat':// web版微信客户端
    ops.puppetOptions = { uos:true }
    break
  case 'wechaty-puppet-xp':
    break
  case 'wechaty-puppet-padlocal':
    ops.puppetOptions = { token }
    break
  default:
    log.info('不支持的puppet')
}

const bot = WechatyBuilder.build(ops)
bot.on('scan',    onScan)
bot.on('login',   onLogin)
bot.on('logout',  onLogout)
bot.on('message', onMessage)

bot.start()
  .then(() => log.info('StarterBot', 'Starter Bot Started.'))
  .catch(e => log.error('StarterBot', e))
