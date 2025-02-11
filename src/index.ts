#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/* eslint-disable camelcase */
/* eslint-disable sort-keys */
import 'dotenv/config.js'
import { Contact, Message, ScanStatus, types, WechatyBuilder, log, Room, Sayable } from 'wechaty'
import { FileBox } from 'file-box'
import { PuppetBridgeJwpingWxbotV3090825 as PuppetBridge } from 'wechaty-puppet-bridge'
import qrcodeTerminal from 'qrcode-terminal'
import {
  BotConfig,
  baseConfig,
  // getConfig,
  // getHistory,
  // getTalk,
  // getRecord,
  // saveConfigFile,
  // updateHistory,
  // updateRecord,
  // updateTalk,
  // updateData,
  // getChatGPTConfig,
  // storeHistory
} from './config.js'
import { getChatGPTReply } from './chatgpt.js'
// import { getCurrentFormattedDate } from './utils/mod.js'
import type { SendTextRequest, MessagePublishRequest } from './types/mod.js'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import {
  // messageStructuring,
  addMessage,
  extractAtContent,
} from './api/message.js'
import { getTalkRecordsFromServer } from './api/handler.js'
// import type { MessageActions, Action } from './types/messageActionsSchema'
import {
  getAvatarUrl,
  updateChats,
  updateChatsReply,
  exportFile,
  NewContact,
  NewRoom,
  getAllContacts,
  getAllRooms,
  ContactDetail,
  RoomDetail,
  getPhone,
  updateConfig,
} from './api/chat.js'
import { KeyWords } from './types/data.js'
import { validateToken, authenticateUser } from './service/user-service.js'
import {
  PoemPalette,
} from './poem-palette.js'

import {
  PoemPalette as PoemPaletteCoze,
} from './poem-palette-coze.js'

// import Koa from 'koa'
// import Router from 'koa-router'
import Koa, { DefaultState, DefaultContext } from 'koa'
import Router from '@koa/router'
// import bodyParser from 'koa-bodyparser'
import { koaBody } from 'koa-body'
import path from 'path'

import { AppRoutes } from './routes.js'
import cors from '@koa/cors'
import websockify from 'koa-websocket'
import serve from 'koa-static'
import { loggerMiddleware } from './middleware/logger.js'

// 获取当前文件根目录路径
const rootDir = path.resolve(process.cwd(), './')
log.info('rootDir:', rootDir)

let config: any
let currentUser: Contact
let botConfig: BotConfig

let whiteList: any
let history: any

let contactList: any[] = []
let roomList: any[] = []
let webClient: any
let recordsDir: { [key: string]: any[] }
let chats: { [key: string]: any }

let isCreating = false
let textPoemLatest: any = {}

const coze_token = process.env['COZE_TOKEN'] || ''
const mj_token = process.env['MJ_TOKEN'] || ''
const bot_id = process.env['BOT_ID'] || ''
const pp = new PoemPalette(mj_token, coze_token)
const ppCoze = new PoemPaletteCoze(coze_token, bot_id)
let isCozeCreating = false

// 设置定时任务，每隔 3 秒执行一次
setInterval(() => {
  console.info('定时任务执行')
  console.info('config:', config)
  config.lastSave = new Date().toLocaleString()
  botConfig.saveConfigFile(config)
  botConfig.updateHistory(history)
  botConfig.updateRecord(recordsDir)
  botConfig.updateTalk(chats)
  botConfig.updateData(contactList, 'contactList')
  botConfig.updateData(roomList, 'roomList')
  // log.info('配置已保存')
  chats = botConfig.getTalk()
}, 30000)

// log.info('config:', JSON.stringify(config, null, '\t'))

type Publisher = Contact | Message | Room

// 生成海报
const createPoster = async (publisher: Publisher, textPoem: any, disc: string) => {
  console.info('textPoem:', JSON.stringify(textPoem, null, 2))
  await publisher.say('正在生成海报，请等待...')
  isCreating = true
  const title = textPoem['诗题']
  const content = textPoem['诗词']
  // const disc = textPoem['画面描述'];

  // 生成图片
  const imageUrl = await pp.createImage(textPoem, disc)
  console.info('imageUrl:', imageUrl)

  // const imageUrl = 'https://filesystem.site/cdn/20240501/gkmSV1Vm1u8C9qEfB6utodMNnbCzr1.png'
  if (imageUrl) {
    // const imageUrl = 'https://cdn.gptbest.vip/mj/attachments/1232309211187380249/1233725967327825930/zik999_an_old_pine_tree_with_gnarled_branches_vibrant_green_on__5219f839-457e-466e-be64-c8febbb8d41d.png?ex=662e2458&is=662cd2d8&hm=e5d2448343781f375b601b2f59f1bdb844a1b993dc9b805662e4cffe33fbe45a&'
    // 下载图片
    const path = await pp.downloadImage(imageUrl, './public/images')
    // const path = await downloadImage('https://filesystem.site/cdn/20240423/mElg1SliaPWbVusYjbgtsRH0e1o05u.png', './public/images');

    // const path = './public/images/Ia9SOHm12lsR33wM3BKmIjM58qq5bf.png';
    // const path = './public/images/mElg1SliaPWbVusYjbgtsRH0e1o05u.png';
    // const path = './public/images/20240427105557.png';
    console.info('path:', path)

    // 分割图片
    const images = await pp.sliceImage(path, './public/images/')
    console.info('images:', images)

    // 生成带文字的海报，并发送
    images.map(async (imagePath) => {
      const newImagePath = await pp.drawPosterWithText(imagePath, title, content, './public/draws')
      const fileBox = FileBox.fromFile(newImagePath)
      await publisher.say(fileBox)
    })
  } else {
    await publisher.say('生成失败，请重新发送任务')
    console.error('图片生成失败：imageUrl is empty')
  }
  isCreating = false
}

const sendMessage = async (publisher: Publisher, text: Sayable): Promise<void> => {
  const replyMessage: Message | void = await publisher.say(text)
  if (replyMessage) {
    await updateChats(replyMessage, recordsDir, chats, webClient)
    await addMessage(replyMessage)
  }

  let listener: Contact | undefined, room: Room | undefined

  const topic = await (publisher as Room).payload?.topic

  if (topic) {
    room = publisher as Room
  } else if ((publisher as Message).payload?.text) {
    const rawMessage = publisher as Message
    if (rawMessage.room()) {
      room = rawMessage.room()
    } else {
      listener = rawMessage.talker()
    }
  } else {
    listener = publisher as Contact
  }

  const message: any = {
    id: uuidv4(),
    payload: {
      filename: '',
      id: uuidv4(),
      listenerId: listener?.id,
      mentionIdList: [],
      roomId: '',
      talkerId: currentUser.id,
      text: text.toString(),
      timestamp: new Date().getTime(),
      type: 7,
    },
    talker: () => currentUser,
    listener: () => listener,
    room: () => room,
  }

  await addMessage(message)
}

function onScan(qrcode: string, status: ScanStatus) {
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

function onLogin(user: Contact) {
  log.info('StarterBot', '%s login', user)
  if (process.env['WECHATY_PUPPET'] && ['wechaty-puppet-wechat', 'wechaty-puppet-wechat4u', 'wechaty-puppet-padlocal'].includes(process.env['WECHATY_PUPPET'])) {
    currentUser = user
    console.info('currentUser:', currentUser.id)
    botConfig = new BotConfig(user.id)
    recordsDir = botConfig.getRecord()
    history = botConfig.getHistory()
    chats = botConfig.getTalk()
    config = botConfig.getConfig()
    whiteList = config.whiteList
  }
}

function onReady() {
  if (process.env['WECHATY_PUPPET'] && ['wechaty-puppet-service'].includes(process.env['WECHATY_PUPPET'])) {
    currentUser = bot.currentUser
    botConfig = new BotConfig(currentUser.id)
    recordsDir = botConfig.getRecord()
    history = botConfig.getHistory()
    chats = botConfig.getTalk()
    config = botConfig.getConfig()
    whiteList = config.whiteList
  }
}

function onLogout(user: Contact) {
  log.info('StarterBot', '%s logout', user)
}

async function onMessage(msg: Message) {
  log.info('onMessage', JSON.stringify(msg))
  const talker = msg.talker()
  const room = msg.room()
  const topic = await room?.topic()
  let text = msg.text()

  // 保留字转换，将保留字转换为内部指令
  if (['帮助', '开通服务', '积分充值', '联系客服', '查询积分'].includes(text)) text = '#' + text

  log.info('talker:', JSON.stringify(talker))
  // const alias = await talker.alias()
  // log.info('roomInfo:', '========================================')
  // log.info('await talker.alias()可用，talker alias:', alias)
  // log.info('roomInfo:', '========================================')

  // const room = msg.room()
  // if (room) {
  //   log.info('room:', JSON.stringify(room, undefined, 2))
  //   const memberAlias =  await room.alias(currentUser)
  //   const has = await room.has(talker)
  //   const member = await room.member('luyuchao1')
  //   log.info('roomInfo:', '========================================')
  //   log.info('const memberAlias =  await room.alias(currentUser):', memberAlias || undefined)
  //   log.info('const has = await room.has(talker):', has)
  //   log.info('const member = await room.member(\'luyuchao\'):', member)
  //   log.info('roomInfo:', '========================================')
  // }

  await updateChats(msg, recordsDir, chats, webClient)
  const addRes = await addMessage(msg)
  await webClient.websocket.send(JSON.stringify({ type: 'message', data: msg }))
  if (addRes) {
    try {
      let rePly: any = {}
      let rePlyText: string = ''
      let curId = ''
      let curUser = ''

      if (room) {
        curId = room.id
        curUser = await room.topic()
      } else {
        curId = talker.id
        curUser = talker.name()
      }
      log.info('curUser', curUser)
      log.info('curId', curId)

      let curUserConfig = whiteList[curId] || undefined
      log.info('curUserConfig:', JSON.stringify(curUserConfig))
      let curHistory = history[curId] || undefined
      let curContact: Contact | undefined
      const isAdmin = msg.talker().id === baseConfig.admin.items.wxid.value || msg.talker().name() === baseConfig.admin.items.wxName.value || msg.self()

      if ((msg.type() === types.Message.Text || msg.type() === types.Message.Audio)) {
        if (text[0] === '#') {
          log.info('操作指令：', text)
          let textArr = text.split('+')

          // 管理员操作指令
          if (isAdmin) {
            if (!room) {
              curId = msg.listener()?.id || ''
              curHistory = history[curId] || undefined
              curUserConfig = whiteList[curId] || undefined
              curContact = await bot.Contact.find({ id: curId })
            }
            log.info('管理员操作，操作指令：', text)

            if (text === '#关闭') {
              if (curUserConfig) {
                updateConfig(curId, '', whiteList, config, history)
                rePlyText = '你的智能助手已关闭~\n'
              } else {
                rePlyText = '智能助手未开启~\n'
              }
              if (room) {
                await sendMessage(msg, rePlyText)
              } else {
                if (curContact) await sendMessage(curContact, rePlyText)
              }
            }
            if (textArr[0] === '#充值') {
              if (curUserConfig && textArr.length === 2) {
                const num = Number(textArr[1])
                if (num) {
                  curUserConfig['quota'] = (curUserConfig['quota'] || 20) + num
                  updateConfig(curId, curUserConfig, whiteList, config, history)
                  rePlyText = `充值成功，当前对话剩余${curUserConfig['quota']}次`
                } else {
                  rePlyText = '格式错误，请重新输入~'
                }
              } else {
                rePlyText = '你还未开通服务，请联系管理员开通~'
              }
              if (room) {
                await sendMessage(msg, rePlyText)
              } else {
                if (curContact) await sendMessage(curContact, rePlyText)
              }
            }
            if (text === '#开通') {
              if (baseConfig.openai.items.key.value) {
                text = `#绑定+${baseConfig.openai.items.key.value}+${baseConfig.openai.items.endpoint.value}`
                textArr = text.split('+')
              } else {
                rePlyText = '智能助手未配置~'
              }
            }
          }

          // 用户操作指令
          const advancedText = `操作指令：\n\n${KeyWords.BingdText}\n\n${KeyWords.TemperatureText}\n\n${KeyWords.MaxTokenText}\n\n${KeyWords.HistoryContextNumText}\n\n${KeyWords.TimeoutText}\n\n${KeyWords.SystemPromptText}\n\n发送 ${KeyWords.ClearHistory} 清理历史消息\n\n发送 ${KeyWords.ExportFile} 可导出最近历史聊天记录为word文档`
          const helpText = '发送如下指令消息可以完成对应操作：\n开通服务 开启智能问答服务\n积分充值 获得问答积分\n查询积分 查询当前余额\n联系客服 联系客服微信'
          switch (text) {
            case KeyWords.Advanced:
              await sendMessage(msg, advancedText)
              break
            case KeyWords.Help:
              await sendMessage(msg, helpText)
              break
            case KeyWords.ExportFile:
              if (curHistory) {
                await sendMessage(msg, await exportFile(curHistory.historyContext))
              } else {
                await sendMessage(msg, '没有可导出的内容')
              }
              break
            case KeyWords.ClearHistory:
              if (curHistory) {
                curHistory.historyContext = []
                curHistory.time = []
                history[curId] = curHistory
                await sendMessage(msg, '历史消息清理完成~')
              } else {
                await sendMessage(msg, '无需清理~')
              }
              break
            case '#查询积分':
              if (curUserConfig) {
                await sendMessage(msg, `你的剩余对话次数为${curUserConfig['quota'] || 20}次`)
              } else {
                await sendMessage(msg, '你还未开通服务，请联系管理员开通~')
              }
              break
            case '#联系客服':
              await sendMessage(msg, '添加个人微信 ledongmao 联系客服')
              break
            case '#积分充值':
              if (curUserConfig) {
                await sendMessage(msg, '直接发送红包获取积分：\n￥1 = 20次\n￥5 = 120次\n￥10 = 250次')
              } else {
                await sendMessage(msg, '你还未开通服务，请发送 #开通服务 开通~')
              }
              break
            case '#开通服务':
              if (curUserConfig) {
                rePlyText = '你已开通服务，无需重复开通~\n'
                await sendMessage(msg, rePlyText)
              } else {
                text = `#绑定+${baseConfig.openai.items.key.value}+${baseConfig.openai.items.endpoint.value}`
                textArr = text.split('+')
              }
              break
            default:
              log.info('不是系统操作指令')
          }
          log.info('textArr', textArr)
          if (textArr.length === 3 && textArr[0] === '#绑定') {
            log.info('textArr', textArr)
            const curUserConfig = botConfig.getChatGPTConfig(textArr)
            rePly = await getChatGPTReply(curUserConfig, [{ content: '你能干什么？', role: 'user' }])
            if (rePly['role'] !== 'err') {
              rePlyText = '配置成功，已获得20次免费对话次数，我是你的智能助手~\n\n' + rePly['content']
              history = botConfig.storeHistory(history, curId, 'user', '你能干什么？')
              history = botConfig.storeHistory(history, curId, rePly.role, rePly.content)
              updateConfig(curId, curUserConfig, whiteList, config, history)
            } else {
              rePlyText = '输入的配置信息有误或权限不足，请使用key请求api验证配置信息是否正确后重试'
            }
            if (room || !isAdmin) {
              await sendMessage(msg, rePlyText)
            } else {
              if (curContact) await sendMessage(curContact, rePlyText)
            }
          }
          if (textArr.length === 2 && textArr[0] === '#发散度') {
            log.info('textArr', textArr)
            try {
              const temperature = Number(textArr[1])
              if (curUserConfig) {
                curUserConfig['temperature'] = temperature
                updateConfig(curId, curUserConfig, whiteList, config, history)
                await sendMessage(msg, `分散度已设置为${temperature}`)
              } else {
                await sendMessage(msg, '未配置key，不能设置参数')
              }
            } catch (err) {
              await sendMessage(msg, '指令格式有误，请检查后重新输入')
            }
          }
          if (textArr.length === 2 && textArr[0] === '#系统提示词') {
            log.info('textArr', textArr)
            try {
              const systemPrompt = String(textArr[1])
              if (curUserConfig) {
                if (systemPrompt === '清空') {
                  curUserConfig['systemPrompt'] = ''
                  updateConfig(curId, curUserConfig, whiteList, config, history)
                  await sendMessage(msg, '系统提示词已清空')
                } else {
                  curUserConfig['systemPrompt'] = systemPrompt
                  whiteList[curId] = curUserConfig
                  config.whiteList = whiteList
                  curHistory.historyContext = []
                  curHistory.time = []
                  history[curId] = curHistory
                  await sendMessage(msg, `历史消息已清理，系统提示词已设置为：${systemPrompt}`)
                }
              } else {
                await sendMessage(msg, '未配置key，不能设置参数')
              }
            } catch (err) {
              await sendMessage(msg, '指令格式有误，请检查后重新输入')
            }
          }
          if (textArr.length === 2 && textArr[0] === '#最大长度') {
            log.info('textArr', textArr)
            try {
              const maxTokenNum = Number(textArr[1])
              if (curUserConfig) {
                curUserConfig['maxTokenNum'] = maxTokenNum
                updateConfig(curId, curUserConfig, whiteList, config, history)
                await sendMessage(msg, `最大长度已设置为${maxTokenNum}`)
              } else {
                await sendMessage(msg, '未配置key，不能设置参数')
              }
            } catch (err) {
              await sendMessage(msg, '指令格式有误，请检查后重新输入')
            }
          }
          if (textArr.length === 2 && textArr[0] === '#历史上下文数量') {
            log.info('textArr', textArr)
            try {
              const historyContextNum = Number(textArr[1])
              if (curUserConfig) {
                curUserConfig['historyContextNum'] = historyContextNum
                updateConfig(curId, curUserConfig, whiteList, config, history)
                await sendMessage(msg, `历史上下文数量已设置为${historyContextNum}`)
              } else {
                await sendMessage(msg, '未配置key，不能设置参数')
              }
            } catch (err) {
              await sendMessage(msg, '指令格式有误，请检查后重新输入')
            }
          }
          if (textArr.length === 2 && textArr[0] === '#超时时间') {
            log.info('textArr', textArr)
            try {
              const timeout = Number(textArr[1])
              if (curUserConfig) {
                curUserConfig['timeout'] = timeout
                updateConfig(curId, curUserConfig, whiteList, config, history)
                await sendMessage(msg, `超时时间已设置为${timeout}秒`)
              } else {
                await sendMessage(msg, '未配置key，不能设置参数')
              }
            } catch (err) {
              await sendMessage(msg, '指令格式有误，请检查后重新输入')
            }
          }
        } else if (text.startsWith('/生成诗词')) {
          if (isCreating) {
            await sendMessage(msg, '当前有任务正在生成，请等待完成后再发起新的任务~')
          } else {
            await sendMessage(msg, '正在生成诗句，请稍等...')
            try {
              const textArr = text.split(' ')
              const input = textArr[1]
              if (input) {
                isCreating = true
                const textPoem = await pp.chat(curId, input, [])
                await msg.say(`${textPoem['诗题']}\n${textPoem['诗词']}`)
                textPoemLatest = textPoem
                isCreating = false
              }
            } catch (err) {
              isCreating = false
              await sendMessage(msg, '生成失败，请重新发送任务')
              log.error('生成诗句失败...', err)
            }
          }
        } else if (text.startsWith('/生成海报')) {
          if (isCreating) {
            await sendMessage(msg, '当前有任务正在生成，请等待完成后再发起新的任务~')
          } else {
            isCreating = true
            try {
              const textArr = text.split(' ')
              const disc = textArr[1] || ''
              if (textPoemLatest['诗题'] && textPoemLatest['诗词']) {
                await createPoster(msg, textPoemLatest, disc)
                await sendMessage(msg, '海报已生成，请查看~')
                textPoemLatest = {}
                isCreating = false
              } else {
                await sendMessage(msg, '请先生成诗句再生成海报~')
              }
            } catch (err) {
              isCreating = false
              await sendMessage(msg, '生成失败，请重新发送任务')
              log.error('生成海报失败...', err)
            }
          }

        } else if (text.startsWith('/最新任务')) {

          if (textPoemLatest['诗题'] && textPoemLatest['诗词']) {
            await msg.say(`${textPoemLatest['诗题']}\n${textPoemLatest['诗词']}`)
          } else {
            await sendMessage(msg, '当前没有任务正在生成~')
          }

        } else if (text.startsWith('/取消任务')) {
          isCreating = false
          textPoemLatest = {}
          await sendMessage(msg, '生成任务已取消~')
        } else if (text.startsWith('/诗词帮助')) {
          await sendMessage(msg, '发送 /生成诗词+关键字 生成诗词\n发送 /生成海报 生成海报\n发送 /最新任务 查看最新任务\n发送 /取消任务 取消当前任务')
        } else {
          let atName = currentUser.name()
          if (room) {
            const memberAlias = await room.alias(currentUser)
            if (memberAlias) {
              atName = memberAlias
            }
          }

          const newText = extractAtContent(`@${atName}`, text)
          if (newText !== null) {
            text = newText
            curUserConfig = {
              endpoint: process.env['OPENAI_API_BASE_URL'],
              historyContextNum: 6,
              key: process.env['OPENAI_API_KEY'],
              maxTokenNum: 2048,
              systemPrompt: '',
              temperature: 1,
              timeout: 60,
              userPrompt: '',
              quota: 99,
            }
          }

          if (curUserConfig && text && !msg.self()) {
            let quota = curUserConfig['quota'] || 20
            if (quota > 0) {
              let systemPrompt = curUserConfig.systemPrompt
              if (text[0] && (text[0] === '*' || text[0].startsWith('[微笑]'))) {
                const textArr = text.split(' ')
                if (textArr[0] && textArr[0].length > 2) {
                  let role = ''
                  if (text[0] === '*') {
                    role = textArr[0].slice(1)
                  } else {
                    role = textArr[0].slice(4)
                  }

                  systemPrompt = `下面我希望你来充当${role},你需要以${role}的角色身份尽可能客观、准确的回答问题，如果你不知道答案或问题超出你的知识范围，你需要如实承认不足而不是编造答案。`
                  text = text.slice(textArr[0].length)
                }
              }
              history = botConfig.storeHistory(history, curId, 'user', text)
              const messages: any[] = history[curId].historyContext.slice(curUserConfig.historyContextNum * (-1))
              if (systemPrompt) {
                messages.unshift({ content: systemPrompt, role: 'system' })
              }
              rePly = await getChatGPTReply(curUserConfig, messages)
              await sendMessage(msg, rePly['content'])
              if (rePly['role'] !== 'err') {
                history = botConfig.storeHistory(history, curId, rePly.role, rePly.content)
                quota = quota - 1
                curUserConfig['quota'] = quota
                updateConfig(curId, curUserConfig, whiteList, config, history)
              } else {
                history[curId].historyContext.pop()
              }
            }

            if (quota === 0) {
              await sendMessage(msg, '余额不足，请充值\n直接发送红包获取积分：\n￥1 = 20次\n￥5 = 120次\n￥10 = 250次')
            }

          } else {
            log.info('不在白名单内：', curId)
          }
        }
      }
    } catch (err) {
      log.error('onMessage err:', err)
    }
  } else {
    log.info('重复消息')
  }

  if (room && topic && ['插画诗', '吟诗一首'].includes(topic)) {
    if (text === '使用说明' || text === '如何使用') {
      const helpText = '发送以 // 开头的消息与吟诗一首对话，可以要求生成插画诗，例如：\n\n//我想要一首春天的诗\n//描述一只猫在草地上玩耍\n//生成海报\n//润色一下 《七十有感》本人今年七十一，弯腰驼背头渐低。手笨眼迟行动缓，不与别人争高低。'
      await room.say(helpText)
    }
    if (text.startsWith('//')) {
      if (isCozeCreating) {
        await room.say('当前有任务正在运行，请等待完成后继续对话~', ...[talker])
      } else {
        text = text.replace(/\/\//g, '')
        try {
          isCozeCreating = true
          const chatResp = await ppCoze.chat(topic, text, room.id)
          if (chatResp.type === 'image') {
            await room.say('海报已生成完毕~', ...[talker])
            const file0 = FileBox.fromUrl(chatResp.content[0] as string)
            await room.say(file0)
            const file1 = FileBox.fromUrl(chatResp.content[1] as string)
            await room.say(file1)
          } else {
            await room.say(chatResp.content)
          }
          isCozeCreating = false
        } catch (err) {
          log.error('插画诗 err:', err)
          isCozeCreating = false
        }
      }
    }
  }

}

// 构建机器人
const ops: any = {
  name: 'WechatGPT',
  puppet: baseConfig.wechaty.items.puppet.value,
} // 默认web版微信客户端

const token = baseConfig.wechaty.items.token.value
const puppet = baseConfig.wechaty.items.puppet.value
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
    ops.puppetOptions = { uos: true }
    break
  case 'wechaty-puppet-xp':
    break
  case 'wechaty-puppet-padlocal':
    ops.puppetOptions = { token }
    break
  case 'wechaty-puppet-bridge':
    ops.puppet = new PuppetBridge()
    break
  default:
    log.info('不支持的puppet')
}

const bot = WechatyBuilder.build(ops)
bot.on('scan', onScan)
bot.on('login', onLogin)
bot.on('ready', onReady)
bot.on('logout', onLogout)
bot.on('message', onMessage)
bot.on('friendship', async friendship => {
  try {
    switch (friendship.type()) {

      // 1. New Friend Request

      case bot.Friendship.Type.Receive:
        await friendship.accept()
        await friendship.contact().say('你好，我是你的智能助手瓦力。发送 帮助 获取操作说明')
        break

      // 2. Friend Ship Confirmed

      case bot.Friendship.Type.Confirm:
        log.info('case bot.Friendship.Type.Confirm:', '好友请求被确认')
        await friendship.contact().say('你好，我是你的智能助手瓦力。发送 帮助 获取操作说明~')
        break
    }
  } catch (e) {
    console.error(e)
  }
})

// bot.start()
//   .then(() => log.info('StarterBot', 'Starter Bot Started.'))
//   .catch(e => log.error('StarterBot', e))

function startBot() {
  log.info('开始启动...')
  try {
    bot.stop().then(() => {
      bot.start()
        .then(() => log.info('StarterBot', 'Starter Bot Started.'))
        .catch(e => {
          log.error('StarterBot 失败...', e)
          // 等待一段时间后重启
          setTimeout(startBot, 5000)  // 5秒后重启
        })
      return true
    }).catch(e => {
      log.error('机器人启动失败...', e)
      bot.start()
        .then(() => log.info('StarterBot', 'Starter Bot Started.'))
        .catch(e => {
          log.error('StarterBot 失败...', e)
          // 等待一段时间后重启
          setTimeout(startBot, 5000)  // 5秒后重启
        })
    })
  } catch (e) {
    log.error('机器人停止失败...')
    // 等待一段时间后重启
    setTimeout(startBot, 5000)  // 5秒后重启
  }
}

// 启动 bot
startBot()

const app = new Koa()
const router = new Router()
app.use(cors())
// app.use(bodyParser())
app.use(koaBody({
  multipart: true, // 支持文件上传
  formidable: {
    uploadDir: path.join(rootDir, 'public/uploads'), // 设置文件上传目录
    keepExtensions: true, // 保持文件扩展名
  },
}))

// 添加日志中间件（确保它是第一个中间件）
app.use(loggerMiddleware)

// 假设静态资源位于项目的 `public` 目录
app.use(serve(path.join(rootDir, 'public')))

// -----------------------路由---------------------------
// 登录
router.post('/api/v1/auth/login', async (ctx: any) => {
  // mobile: model.username || '18798272054',
  // password: model.password || 'admin123',
  // platform: 'web'
  const { mobile, password } = ctx.request.body
  const token = await authenticateUser(mobile, password)
  if (token) {
    const response = {
      code: 200,
      message: 'success',
      data: {
        access_token: token,
        expires_in: 36000000,
        type: 'Bearer',
      },
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = { code: 401, message: '用户名或密码错误', data: {} }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

// 发送文本消息/api/v1/talk/message/publish
router.post('/api/v1/talk/message/publish', async (ctx: any) => {
  // {"type":"text","content":"ff","quote_id":"","mentions":[],"receiver":{"receiver_id":2055,"talk_type":1}}
  // {"type":"image","width":1024,"height":1024,"url":"https://im-static.gzydong.com/public/media/image/202404/2f82bc68-131c-4bac-a85f-46462b630cb9_1024x1024.png","size":10000,"receiver":{"receiver_id":2055,"talk_type":1}}
  console.info('ctx.request.body:', ctx.request.body)
  const model: MessagePublishRequest = ctx.request.body
  const receiver = model.receiver
  const receiver_id = receiver.receiver_id
  if (receiver_id.indexOf('@') > -1 || receiver_id.indexOf('R:') > -1) {
    const room = await bot.Room.find({ id: receiver_id })
    if (room) {
      if (model.type === 'text') {
        await sendMessage(room, model.content)
      }
      if (model.type === 'image') {
        const fileBox = FileBox.fromUrl(model.url)
        await sendMessage(room, fileBox)
      }
    }
    const response = {
      code: 200,
      message: 'success',
      data: {},
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const contact = await bot.Contact.find({ id: receiver_id })
    if (contact) {
      if (model.type === 'text') {
        // await contact.say(model.content)
        await sendMessage(contact, model.content)
      }
      if (model.type === 'image') {
        const fileBox = FileBox.fromUrl(model.url)
        // await contact.say(fileBox)
        await sendMessage(contact, fileBox)
      }
    }
    const response = {
      code: 200,
      message: 'success',
      data: {},
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

// 上传图片/api/v1/upload/image
router.post('/api/v1/upload/image', async (ctx: any) => {
  console.info('ctx.request:', ctx.request.files)
  try {
    const file = ctx.request.files.file
    if (!file) {
      ctx.throw(400, 'No file uploaded!')
    }
    log.info('file:', file)
    log.info('file:', JSON.stringify(file))
    const fileJson: any = JSON.parse(JSON.stringify(file))
    const fileExt = path.extname(fileJson.originalFilename).toLowerCase()
    if (!['.jpg', '.jpeg', '.png', '.gif'].includes(fileExt)) {
      ctx.throw(400, 'Only image files are allowed!')
    }

    const newFilename = `${Date.now()}${fileExt}`
    const newFilePath = path.join(rootDir, 'public/uploads', newFilename)

    const reader = fs.createReadStream(fileJson.filepath)
    const writer = fs.createWriteStream(newFilePath)
    reader.pipe(writer)
    log.info('uploading %s -> %s', file.name, writer.path)

    const response = {
      code: 200,
      message: 'success',
      data: {
        src: `http://127.0.0.1:9503/uploads/${newFilename}`,
      },
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } catch (err) {
    log.error('上传图片失败...', err)
    ctx.throw(400, '上传图片失败...')
  }
})

const files: {
  [key: string]: {
    file_name: string;
    file_size: number;
    fileWriteStream?: any;
    targetFilePath: string;
    targetFileUrl: string;
  }
} = {}
// 获取上传文件id /api/v1/upload/multipart/initiate
router.post('/api/v1/upload/multipart/initiate', async (ctx: any) => {
  // {file_name: "2024年清单.md", file_size: 1357}
  // {"code":200,"message":"success","data":{"split_size":5242880,"upload_id":"fa86a0c1-28cf-4312-b27e-687aeea9f8c9","upload_id_md5":"a383e7641225991f22c94735a0205706"}}
  const { file_name, file_size } = ctx.request.body
  const upload_id = uuidv4()
  // 目标文件，将要创建或覆写
  const curTime = new Date().getTime()
  const targetFilePath = path.join(rootDir, 'public', 'uploads', curTime + '_' + file_name)
  const targetFileUrl = `http://127.0.0.1:9503/uploads/${curTime + '_' + file_name}`

  // 创建一个可写流用于输出组装后的文件
  // const fileWriteStream = fs.createWriteStream(targetFilePath)

  files[upload_id] = { file_name, file_size, targetFilePath, targetFileUrl }
  const response = {
    code: 200,
    data: {
      upload_id,
      split_size: file_size,
      upload_id_md5: upload_id,
    },
    message: 'success',
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

// 分片上传/api/v1/upload/multipart, 接收分片组装成文件
router.post('/api/v1/upload/multipart', async (ctx: any) => {
  log.info('ctx.request.body:', JSON.stringify(ctx.request.body, undefined, 2))
  log.info(ctx.request.files)
  log.info(ctx.request.files.file)

  //   Content-Type:
  // multipart/form-data; boundary=----WebKitFormBoundaryABSyoBpxTUp5e5Dr
  // file: （二进制）
  // upload_id: fa86a0c1-28cf-4312-b27e-687aeea9f8c9
  // split_index: 1
  // split_num: 1
  // 非最后一个分片响应：{code: 200, message: "success", data: {is_merge: false, upload_id: ""}}
  // 最后一个分片响应：{"code":200,"message":"success","data":{"is_merge":true,"upload_id":"fa86a0c1-28cf-4312-b27e-687aeea9f8c9"}}

  const { upload_id, split_index, split_num } = ctx.request.body
  const file = ctx.request.files.file
  const fileJson: any = JSON.parse(JSON.stringify(file))
  const curFile = files[upload_id]
  const response = {
    code: 200,
    message: 'success',
    data: {
      is_merge: true,
      upload_id,
    },
  }
  if (split_index !== split_num) {
    const chunkReadStream = fs.createReadStream(fileJson.filepath)
    const fileWriteStream = fs.createWriteStream(curFile?.targetFilePath as string)
    chunkReadStream.pipe(fileWriteStream)
    // 创建读取片段的可读流
    response.data.is_merge = false
    response.data.upload_id = ''
  } else if (split_index === '1' && split_num === '1') {
    const chunkReadStream = fs.createReadStream(fileJson.filepath)
    const fileWriteStream = fs.createWriteStream(curFile?.targetFilePath as string)
    chunkReadStream.pipe(fileWriteStream)
    log.info('uploading %s -> %s', curFile?.file_name, fileWriteStream.path)
  } else {
    // 所有片段已经成功组装
    const chunkReadStream = fs.createReadStream(fileJson.filepath)
    const fileWriteStream = fs.createWriteStream(curFile?.targetFilePath as string)
    chunkReadStream.pipe(fileWriteStream)
    console.info('所有片段已经成功组装')
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response

})

// 发送文件消息/api/v1/talk/message/file
router.post('/api/v1/talk/message/file', async (ctx: any) => {
  // {
  //   "upload_id": "fa86a0c1-28cf-4312-b27e-687aeea9f8c9",
  //   "receiver_id": 2055,
  //   "talk_type": 1
  // }
  const model: MessagePublishRequest = ctx.request.body
  log.info('model:', JSON.stringify(model))
  const {
    upload_id,
    receiver_id,
    talk_type,
  } = model

  log.info('receiver_id:', receiver_id, upload_id, talk_type)
  const file = files[upload_id]
  log.info('file url:', file?.targetFileUrl)
  if (receiver_id.indexOf('@') > -1) {
    const room = await bot.Room.find({ id: receiver_id })
    if (room) {
      const fileBox = FileBox.fromUrl(file?.targetFileUrl as string)
      await room.say(fileBox)

    }
    const response = {
      code: 200,
      message: 'success',
      data: {},
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const contact = await bot.Contact.find({ id: receiver_id })
    if (contact) {
      const fileBox = FileBox.fromUrl(file?.targetFileUrl as string)
      await contact.say(fileBox)

    }
    const response = {
      code: 200,
      message: 'success',
      data: {},
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

// 获取联系人列表
router.get('/api/v1/contact/list', async (ctx: any) => {
  log.info('/api/v1/contact/list:', JSON.stringify(ctx))
  const newContacts: NewContact[] = await getAllContacts(bot) as NewContact[]
  contactList = newContacts
  const response = {
    code: 200,
    data: {
      items: newContacts,
    },
    message: 'success',
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

// 获取群列表
router.get('/api/v1/group/list', async (ctx: any) => {
  const newRooms: NewRoom[] = await getAllRooms(bot)
  roomList = newRooms
  const response = {
    code: 200,
    data: {
      items: newRooms,
    },
    message: 'success',
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

// 获取群详情
router.get('/api/v1/group/detail', async (ctx: any) => {
  const groupId: string = ctx.query.group_id

  // 假设存在一个根据 userId 查找对应联系人的异步函数 findContactById
  const room = await bot.Room.find({ id: groupId })
  if (room) {
    const roomDetail: RoomDetail = {
      avatar: await getAvatarUrl(room) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png', // 设置联系人头像
      created_at: '2023-05-27 11:02:35',
      group_id: room.id,
      group_name: await room.topic(),
      is_disturb: 0,
      is_manager: room.owner() === bot.currentUser,
      manager_nickname: room.owner()?.name(),
      profile: await room.announce(),
      visit_card: '',
    }
    const response = {
      code: 200,
      data: roomDetail,
      message: 'success',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = {
      code: 404,
      data: {},
      message: 'Room not found',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

// 获取群列表
router.get('/api/v1/group/member/list', async (ctx: any) => {
  const groupId: string = ctx.query.group_id

  // 假设存在一个根据 userId 查找对应联系人的异步函数 findContactById
  const room = await bot.Room.find({ id: groupId })
  const members = await room?.memberAll()
  if (members) {
    const newMembers = await Promise.all(
      members.map(async (member: Contact) => ({
        avatar: await getAvatarUrl(member) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png', // 设置群组头像
        id: member.id,
        user_id: member.id,
        nickname: member.name(),
        gender: member.gender(),
        motto: '人间繁华无尽',
        leader: room?.owner()?.id === member.id ? 2 : 0,
        is_mute: 0,
        user_card: '',
      })),
    )
    const response = {
      code: 200,
      data: newMembers,
      message: 'success',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = {
      code: 404,
      data: {},
      message: 'Room not found',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

// 获取联系人详情
router.get('/api/v1/users/detail', async (ctx: any) => {
  const userId: string = ctx.query.user_id

  // 假设存在一个根据 userId 查找对应联系人的异步函数 findContactById
  let contact: Contact | undefined

  if (userId) {
    contact = await bot.Contact.find({ id: userId })
  } else {
    contact = bot.currentUser
  }

  if (contact) {
    const contactDetail: ContactDetail = {
      avatar: await getAvatarUrl(contact) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png', // 设置联系人头像
      email: 'atorber@163.com',
      friend_apply: 0,
      friend_status: 0,
      gender: contact.gender(),
      group_id: 0,
      id: contact.id,
      mobile: await getPhone(contact), // 设置联系人手机号
      motto: await contact.description(), // 设置联系人签名
      nickname: contact.name(),
      remark: await contact.alias(),
    }
    const response = {
      code: 200,
      data: contactDetail,
      message: 'success',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = {
      code: 404,
      data: {},
      message: 'User not found',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

router.get('/api/v1/users/setting', async (ctx: any) => {
  // 假设存在一个根据 userId 查找对应联系人的异步函数 findContactById
  const contact: Contact = bot.currentUser
  const contactDetail = {
    avatar: await getAvatarUrl(contact) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png',
    email: 'atrober@163.com',
    gender: contact.gender(),
    is_qiye: false,
    mobile: await getPhone(contact),
    motto: await contact.alias() || '--',
    nickname: contact.name(),
    uid: contact.id,
  }
  const response = {
    code: 200,
    data: {
      setting: {
        keyboard_event_notify: '',
        notify_cue_tone: '',
        theme_bag_img: '',
        theme_color: '',
        theme_mode: '',
      },
      user_info: contactDetail,
    },
    message: 'success',
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

router.get('/api/v1/contact/detail', async (ctx: any) => {
  const userId: string = ctx.query.user_id
  // 假设存在一个根据 userId 查找对应联系人的异步函数 findContactById
  const contact: Contact | undefined = await bot.Contact.find({ id: userId })

  if (contact) {
    const contactDetail: ContactDetail = {
      avatar: await getAvatarUrl(contact) || 'https://im.gzydong.club/public/media/image/avatar/20230516/c5039ad4f29de2fd2c7f5a1789e155f5_200x200.png', // 设置联系人头像
      email: 'atorber@163.com',
      friend_apply: 0,
      friend_status: 0,
      gender: contact.gender(),
      group_id: 0,
      id: contact.id,
      mobile: await getPhone(contact), // 设置联系人手机号
      motto: await contact.description(), // 设置联系人签名
      nickname: contact.name(),
      remark: await contact.alias(),
    }
    const response = {
      code: 200,
      data: contactDetail,
      message: 'success',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = {
      code: 404,
      data: {},
      message: 'User not found',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }
})

router.get('/api/v1/talk/list', async (ctx: any) => {
  const result = []

  for (const key in chats) {
    result.push(chats[key])
  }

  const response = {
    code: 200,
    message: 'success',
    data: {
      items: result,
    },
  }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response

})

router.get('/api/v1/contact/apply/unread-num', async (ctx: any) => {
  const response = { code: 200, message: 'success', data: { unread_num: 0 } }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response

})

type ApplyRecord = {
  // Add properties for apply records
};

// This function is a placeholder to retrieve contact apply records.
const getApplyRecords = async (page: number, pageSize: number): Promise<ApplyRecord[]> => {
  // Implement this function to retrieve the apply records
  log.info('请求参数：', page, pageSize)
  return [] // Return an array of apply records
}

router.get('/api/v1/contact/apply/records', async (ctx) => {
  const page = Number(ctx.query['page']) || 1
  const pageSize = Number(ctx.query['page_size']) || 10000

  const applyRecords = await getApplyRecords(page, pageSize)

  const response = {
    code: 200,
    data: { items: applyRecords },
    message: 'success',
  }

  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

type ClearRequest = {
  // Add properties for request body
};

// This function is a placeholder to actually clear unread messages.
const clearUnreadMessages = async (requestBody: ClearRequest): Promise<void> => {
  // Implement this function to clear unread messages
  log.info('requestBody:', JSON.stringify(requestBody))
}

router.post('/api/v1/talk/unread/clear', async (ctx) => {
  const requestBody: ClearRequest = ctx.request.body as ClearRequest

  await clearUnreadMessages(requestBody)

  const response = {
    code: 200,
    data: {},
    message: 'success',
  }

  ctx.body = response
})

type CreateTalkRequest = {
  talk_type: number;
  receiver_id: string
}

router.post('/api/v1/talk/create', async (ctx) => {
  const requestBody: CreateTalkRequest = ctx.request.body as CreateTalkRequest
  const receiver_id = requestBody.receiver_id
  const talk_type = requestBody.talk_type
  const chatId = `${talk_type}_${receiver_id}`
  const chats = botConfig.getTalk()
  let chat = chats[chatId]
  if (!chat) {
    chat = {
      avatar: 'https://im.gzydong.club/public/media/image/talk/20220221/447d236da1b5787d25f6b0461f889f76_96x96.png',
      id: chatId,
      index_name: chatId,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: '1',
      name: chatId,
      receiver_id,
      remark_name: '',
      talk_type,
      unread_num: 0,
      updated_at: '2024-04-17 13:43:44',
    }
    chats[chatId] = chat
    botConfig.updateTalk(chats)
  }
  const response = {
    code: 200,
    data: chat,
    message: 'success',
  }

  ctx.body = response
})

type TalkRecord = {
  id: number;
  sequence: number;
  msg_id: string;
  talk_type: number;
  msg_type: number;
  user_id: number;
  receiver_id: number;
  nickname: string;
  avatar: string;
  is_revoke: number;
  is_mark: number;
  is_read: number;
  created_at: string;
  extra: any;
};

const getTalkRecords = async (
  recordId: number,
  receiverId: string,
  talkType: number,
  limit: number,  
  cursor: number,
): Promise<TalkRecord[]> => {
  // Implement this function to retrieve the talk records based on query parameters
  const talkRecordsServer: any[] = await getTalkRecordsFromServer(receiverId, talkType, limit, cursor)
  console.info('talkRecordsServer:', talkRecordsServer)

  let records: TalkRecord[] = []
  for (const item of talkRecordsServer) {
    /*
  {
    "localId": 10202,
    "TalkerId": 10,
    "MsgSvrID": 8.634301410993605e+18,
    "Type": 1,
    "SubType": 0,
    "IsSender": 0,
    "CreateTime": 1739163044,
    "Sequence": 1739163044000,
    "StatusEx": 0,
    "FlagEx": 0,
    "Status": 2,
    "MsgServerSeq": 1,
    "MsgSequence": 774293006,
    "StrTalker": "tyutluyc",
    "StrContent": "好的",
    "DisplayContent": "",
    "Reserved0": 0,
    "Reserved1": 2,
    "Reserved2": null,
    "Reserved3": null,
    "Reserved4": null,
    "Reserved5": null,
    "Reserved6": null,
    "CompressContent": null,
    "BytesExtra": "CgQIEBAAGqkCCAcSpAI8bXNnc291cmNlPgogICAgPGFsbm9kZT4KICAgICAgICA8ZnI+MTwvZnI+CiAgICA8L2Fsbm9kZT4KICAgIDxwdWE+MTwvcHVhPgogICAgPHNpZ25hdHVyZT5WMV9TREdQemlHS3x2MV9TREdQemlHSzwvc2lnbmF0dXJlPgogICAgPHRtcF9ub2RlPgogICAgICAgIDxwdWJsaXNoZXItaWQgLz4KICAgIDwvdG1wX25vZGU+CiAgICA8c2VjX21zZ19ub2RlPgogICAgICAgIDxhbG5vZGU+CiAgICAgICAgICAgIDxmcj4xPC9mcj4KICAgICAgICA8L2Fsbm9kZT4KICAgIDwvc2VjX21zZ19ub2RlPgo8L21zZ3NvdXJjZT4KGiQIAhIgZTc5ZGYxNDhmMzMyYWMyYzlhNjYwOTU0YzNiMjc2ODM=",
    "BytesTrans": null,
    "sender_id": null,
    "xml_content": "\u003Cmsgsource\u003E\n    \u003Calnode\u003E\n        \u003Cfr\u003E1\u003C/fr\u003E\n    \u003C/alnode\u003E\n    \u003Cpua\u003E1\u003C/pua\u003E\n    \u003Csignature\u003EV1_SDGPziGK|v1_SDGPziGK\u003C/signature\u003E\n    \u003Ctmp_node\u003E\n        \u003Cpublisher-id /\u003E\n    \u003C/tmp_node\u003E\n    \u003Csec_msg_node\u003E\n        \u003Calnode\u003E\n            \u003Cfr\u003E1\u003C/fr\u003E\n        \u003C/alnode\u003E\n    \u003C/sec_msg_node\u003E\n\u003C/msgsource\u003E\n",
    "proto": {
      "message1": {
        "field1": 16,
        "field2": 0
      },
      "message2": [
        {
          "field1": 7,
          "field2": "\u003Cmsgsource\u003E\n    \u003Calnode\u003E\n        \u003Cfr\u003E1\u003C/fr\u003E\n    \u003C/alnode\u003E\n    \u003Cpua\u003E1\u003C/pua\u003E\n    \u003Csignature\u003EV1_SDGPziGK|v1_SDGPziGK\u003C/signature\u003E\n    \u003Ctmp_node\u003E\n        \u003Cpublisher-id /\u003E\n    \u003C/tmp_node\u003E\n    \u003Csec_msg_node\u003E\n        \u003Calnode\u003E\n            \u003Cfr\u003E1\u003C/fr\u003E\n        \u003C/alnode\u003E\n    \u003C/sec_msg_node\u003E\n\u003C/msgsource\u003E\n"
        },
        {
          "field1": 2,
          "field2": "e79df148f332ac2c9a660954c3b27683"
        }
      ]
    },
    "StrSender": "tyutluyc"
  }
    */
    // 格式：2025-02-10 10:10:44
    const created_at = new Date(item.CreateTime * 1000 + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '')
    const receiver_id = item.StrTalker.includes('@chatroom') ? item.StrTalker : item.StrSender
    let record: TalkRecord = {
      id: item.localId,
      sequence: item.Sequence,
      msg_id: item.MsgSvrID,
      talk_type: item.StrTalker.includes('@chatroom') ? 2 : 1,
      msg_type: 1,
      user_id: item.StrSender,
      receiver_id: receiver_id,
      nickname: item.nickname,
      avatar: '',
      is_revoke: 0,
      is_mark: 1,
      is_read: 1,
      created_at: created_at,
      extra: {
        content: item.StrContent,
      },
    }
    // const curMsg = record
    
    // switch (item.Type) {
    //   case types.Message.Image: {
    //     // const file = message.toImage()
    //     // const thumbnail = await file.thumbnail()
    //     // await thumbnail.toFile(path.join(rootDir, 'public', 'uploads', `${message.id}.jpg`))
  
    //     curMsg.msg_type = 3
    //     // curMsg.extra = {
    //     //   height: 1024,
    //     //   name: '',
    //     //   size: thumbnail.size || 100,
    //     //   url: `http://127.0.0.1:9503/uploads/${message.id}.jpg`,
    //     //   width: 1024,
    //     // } as any
    //     break
    //   }
    //   case types.Message.Attachment:{
    //     // const file = await message.toFileBox()
    //     // const fileName = file.name
    //     // await file.toFile(path.join(rootDir, 'public', 'uploads', `${message.id}_${fileName}`))
  
    //     curMsg.msg_type = 6
    //     // curMsg.extra = {
    //     //   drive: 1,
    //     //   name:fileName,
    //     //   path:`http://127.0.0.1:9503/uploads/${message.id}_${fileName}`,
    //     //   size:file.size || 100,
    //     // } as any
    //     break
    //   }
    //   case types.Message.Audio:{
    //     // const file = await message.toFileBox()
    //     // const fileName = file.name
    //     // await file.toFile(path.join(rootDir, 'public', 'uploads', `${message.id}_${fileName}`))
  
    //     curMsg.msg_type = 4
    //     // curMsg.extra = {
    //     //   duration: 0,
    //     //   name:fileName || '',
    //     //   url:`http://127.0.0.1:9503/uploads/${message.id}_${fileName}`,
    //     //   size:file.size || 0,
    //     // } as any
    //     break
    //   }
    //   default:
    //     break
    // }

    // record = curMsg

    // 如果消息以<msg>开头，则不添加到records
    if (item.StrContent.startsWith('<msg>')) {
      const content = {
        code: item.StrContent,
        lang: "yaml"
      }
      record.extra = content
      record.msg_type = 2
    }
    records.push(record)
  }
  // records = recordsDir[receiverId] as TalkRecord[]

  log.info('聊天记录：', JSON.stringify(records))
  return records || [] // Return an array of talk records
}

router.get('/api/v1/talk/records', async (ctx) => {
  const recordId = Number(ctx.query['record_id']) || 0
  const receiverId = ctx.query['receiver_id'] as string
  const talkType = Number(ctx.query['talk_type']) || 0
  const limit = Number(ctx.query['limit']) || 30
  const cursor = Number(ctx.query['cursor']) || 0

  const talkRecords = await getTalkRecords(recordId, receiverId, talkType, limit, cursor)

  // 对talkRecords对象数组按created_at字段顺序排列
  const orderTalkRecords = (talkRecords: { created_at: string }[]) => {
    return talkRecords.sort((a: { created_at: string }, b: { created_at: string }) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  const response = {
    code: 200,
    message: 'success',
    data: {
      items: orderTalkRecords(talkRecords),
      limit,
      cursor: cursor + limit,
      record_id: recordId,
    },
  }

  ctx.body = response
})

router.post('/api/v1/talk/message/text', async (ctx) => {
  console.info('ctx.request.body:', ctx.request.body)
  const requestBody: SendTextRequest = ctx.request.body as SendTextRequest
  await updateChatsReply(bot, requestBody, recordsDir, chats, webClient)
  if (requestBody.talk_type === 2) {
    const room = await bot.Room.find({ id: requestBody.receiver_id })
    if (room) await sendMessage(room, requestBody.text)
    const response = { code: 200, message: 'success' }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else if (requestBody.talk_type === 1) {
    const contact = await bot.Contact.find({ id: requestBody.receiver_id })
    if (contact) await sendMessage(contact, requestBody.text)

    const response = { code: 200, message: 'success' }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else {
    const response = {
      code: 404,
      data: {},
      message: '不支持的talk_type',
    }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  }

})

// 路由
AppRoutes.forEach((route) => (router as any)[route.method](route.path, route.action))

app.use(router.routes())

app.listen(process.env['HTTP_PORT'] || 9503)

log.info(`http server running on http://127.0.0.1:${process.env['HTTP_PORT'] || 9503}`)

// ws服务
const appWs = websockify(new Koa())
const routerWs = new Router<DefaultState, DefaultContext>()
routerWs.get('/wss/default.io', async (ctx: any) => {
  const token: string = ctx.query.token
  // 根据token验证连接，假设存在一个validateToken(token)函数
  const isValidToken = validateToken(token)

  if (isValidToken) {
    webClient = ctx
    ctx.websocket.on('open', () => {
      log.info('WebSocket opened')
      const message = { event: 'connect', content: { ping_interval: 30, ping_timeout: 75 } }
      ctx.websocket.send(JSON.stringify(message))
    })
    // 处理消息
    ctx.websocket.on('message', (message: any) => {
      log.info('WebSocket message received:', message)
      const messageJson = JSON.parse(message)

      if (messageJson.event && messageJson.event === 'ping') {
        message = JSON.stringify({ event: 'pong' })
        log.info('message:', message)
        // 在此处处理接收到的消息，例如通过发送回应
        ctx.websocket.send(message)
      }

      if (messageJson.event && messageJson.event === 'event":"im.message') {
        const ack = {
          event: 'ack',
          sid: messageJson.sid,
        }
        message = JSON.stringify(ack)
        log.info('message:', message)
        // 在此处处理接收到的消息，例如通过发送回应
        ctx.websocket.send(message)
      }
    })

    // 监听WebSocket关闭事件
    ctx.websocket.on('close', () => {
      log.info('WebSocket closed')
    })
  } else {
    // 无效的
    console.info('Invalid token')
    ctx.websocket.close(1008, 'Invalid token')
  }
})

// @ts-ignore
appWs.ws.use(routerWs.routes())

// @ts-ignore
appWs.ws.use(routerWs.allowedMethods())

appWs.listen(process.env['WS_PORT'] || 9504, () => {
  log.info(`WebSocket server running on ws://127.0.0.1:${process.env['WS_PORT'] || 9504}`)
})
