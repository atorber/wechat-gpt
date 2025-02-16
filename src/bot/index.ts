/* eslint-disable sort-keys */
import { Contact, Message, ScanStatus, types, WechatyBuilder, log, Room, Sayable } from 'wechaty'
import { FileBox } from 'file-box'
import { WechatferryPuppet } from '@atorber/puppet'
import qrcodeTerminal from 'qrcode-terminal'

import { BotConfig, CONFIG } from '../config.js'

import { updateChats } from '../api/chat.js'
import { addMessage } from '../api/message.js'

import { v4 as uuidv4 } from 'uuid'

import { PoemPalette } from './handlers/poem-palette.js'
import { PoemPalette as PoemPaletteCoze } from './handlers/poem-palette-coze.js'
import { createPoster } from './handlers/poem.js'

import { getTalkRecordsFromServer, replayMessageByAI } from '../api/handler.js'

let currentUser: Contact
let botConfig: BotConfig
let chats: { [key: string]: any[] }
let webClient: any
const whiteList: any = []
let isCreating = false
let textPoemLatest: any = {}

const pp = new PoemPalette(CONFIG.MJ_TOKEN, CONFIG.COZE_TOKEN)
const ppCoze = new PoemPaletteCoze(CONFIG.COZE_TOKEN, CONFIG.BOT_ID)
let isCozeCreating = false

type Publisher = Contact | Message | Room

const sendMessage = async (publisher: Publisher, text: Sayable): Promise<void> => {
  const replyMessage: Message | void = await publisher.say(text)
  if (replyMessage) {
    await updateChats(replyMessage, chats, webClient)
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

const initConfig = (user: Contact) => {
  log.info('StarterBot initConfig...')
  currentUser = user
  botConfig = new BotConfig(user.id)
  chats = botConfig.getTalk()
}

// 登录成功
function onLogin (user: Contact) {
  log.info('StarterBot', '%s login', user)
  initConfig(user)
}

// 机器人就绪
function onReady () {

}

// 登出
function onLogout (user: Contact) {
  log.info('StarterBot', '%s logout', user)
}

// 收到消息
async function onMessage (msg: Message) {
  log.info('onMessage', JSON.stringify(msg))
  try {
    const talker = msg.talker()
    const room = msg.room()
    const topic = await room?.topic()
    let text = msg.text()

    log.info('talker:', JSON.stringify(talker))

    await updateChats(msg, chats, webClient)
    const addRes = await addMessage(msg)

    if (webClient && webClient.websocket) {
      await webClient.websocket.send(JSON.stringify({ type: 'message', data: msg }))
    }
    if (addRes) {
      try {
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

        const curUserConfig = whiteList[curId] || undefined
        log.info('curUserConfig:', JSON.stringify(curUserConfig))

        if ((msg.type() === types.Message.Text || msg.type() === types.Message.Audio)) {
          if (text.startsWith('/生成诗词')) {
            if (isCreating) {
              await msg.say('当前有任务正在生成，请等待完成后再发起新的任务~')
            } else {
              await msg.say('正在生成诗句，请稍等...')
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
          }

          if (text.startsWith('/生成海报')) {
            if (isCreating) {
              await msg.say('当前有任务正在生成，请等待完成后再发起新的任务~')
            } else {
              isCreating = true
              try {
                const textArr = text.split(' ')
                const disc = textArr[1] || ''
                if (textPoemLatest['诗题'] && textPoemLatest['诗词']) {
                  await msg.say('正在生成海报，请等待...')
                  isCreating = true
                  const fileBoxs = await createPoster(pp, textPoemLatest, disc)
                  if (fileBoxs.length > 0) {
                    for (const fileBox of fileBoxs) {
                      await msg.say(fileBox)
                    }
                    await sendMessage(msg, '海报已生成，请查看~')
                    textPoemLatest = {}
                    isCreating = false
                  } else {
                    await sendMessage(msg, '生成失败，请重新发送任务')
                  }
                } else {
                  await sendMessage(msg, '请先生成诗句再生成海报~')
                }
              } catch (err) {
                isCreating = false
                await sendMessage(msg, '生成失败，请重新发送任务')
                log.error('生成海报失败...', err)
              }
            }

          }

          if (text.startsWith('/最新任务')) {

            if (textPoemLatest['诗题'] && textPoemLatest['诗词']) {
              await msg.say(`${textPoemLatest['诗题']}\n${textPoemLatest['诗词']}`)
            } else {
              await sendMessage(msg, '当前没有任务正在生成~')
            }

          }

          if (text.startsWith('/取消任务')) {
            isCreating = false
            textPoemLatest = {}
            await sendMessage(msg, '生成任务已取消~')
          }

          if (text.startsWith('/诗词帮助')) {
            await sendMessage(msg, '发送 /生成诗词+关键字 生成诗词\n发送 /生成海报 生成海报\n发送 /最新任务 查看最新任务\n发送 /取消任务 取消当前任务')
          }
        }
      } catch (err) {
        log.error('onMessage err:', err)
      }
    } else {
      log.info('重复消息')
    }

    if (room && topic && [ '插画诗', '吟诗一首' ].includes(topic)) {
      if (text === '使用说明' || text === '如何使用') {
        const helpText = '发送以 // 开头的消息与吟诗一首对话，可以要求生成插画诗，例如：\n\n//我想要一首春天的诗\n//描述一只猫在草地上玩耍\n//生成海报\n//润色一下 《七十有感》本人今年七十一，弯腰驼背头渐低。手笨眼迟行动缓，不与别人争高低。'
        await room.say(helpText)
      }
      if (text.startsWith('//')) {
        if (isCozeCreating) {
          await room.say('当前有任务正在运行，请等待完成后继续对话~', ...[ talker ])
        } else {
          text = text.replace(/\/\//g, '')
          try {
            isCozeCreating = true
            const chatResp = await ppCoze.chat(topic, text, room.id)
            if (chatResp.type === 'image') {
              await room.say('海报已生成完毕~', ...[ talker ])
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

    // 私聊消息中使用机器人回复
    if (!room && !msg.self()) {
      const talker = msg.talker()
      const messages = await getTalkRecordsFromServer(talker.id, 30, 0, bot)
      const replayMessage = await replayMessageByAI(bot, msg.talker().id, messages)
      await sendMessage(msg, replayMessage.message.replyMessage)
    }
  } catch (err) {
    log.error('onMessage err:', err)
  }
}

// 构建机器人
const ops: any = {
  name: 'WechatGPT',
  puppet: CONFIG.WECHATY_PUPPET,
} // 默认web版微信客户端

const token = CONFIG.WECHATY_TOKEN
const puppet = CONFIG.WECHATY_PUPPET
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
  case 'wechaty-puppet-wechatferry':
    ops.puppet = new WechatferryPuppet()
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

export {
  bot,
  sendMessage,
  pp,
  ppCoze,
  isCreating,
  textPoemLatest,
  isCozeCreating,
}
