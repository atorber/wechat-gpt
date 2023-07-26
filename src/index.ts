#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/* eslint-disable sort-keys */
import 'dotenv/config.js'
import { Contact, Message, ScanStatus, types, WechatyBuilder, log } from 'wechaty'
import qrcodeTerminal from 'qrcode-terminal'
import { baseConfig, getConfig, getHistory, getTalk, getRecord, saveConfigFile, updateHistory, updateRecord, updateTalk, updateData, getChatGPTConfig, storeHistory } from './config.js'
import { getChatGPTReply } from './chatgpt.js'
// import { getCurrentFormattedDate } from './utils/mod.js'
import type { SendTextRequest } from './types/mod.js'
// import { v4 as uuidv4 } from 'uuid'
import { messageStructuring } from './api/message.js'
import type { MessageActions, Action } from './types/messageActionsSchema'
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
import { validateToken } from './service/user-service.js'

/* 将以下两行取消注释可以使用语音请求 */

import { convertSilkToWav } from './utils/voice.js'
import { vop } from './utils/baiduai.js'

/*******************************/

// import Koa from 'koa'
// import Router from 'koa-router'
import Koa, { DefaultState, DefaultContext } from 'koa'
import Router from '@koa/router'
import bodyParser from 'koa-bodyparser'
import { AppRoutes, Route } from './routes.js'
import cors from '@koa/cors'
import websockify from 'koa-websocket'

const config = getConfig()
const whiteList = config.whiteList
let history = getHistory()
let contactList: any[] = []
let roomList: any[] = []
let webClient: any
const recordsDir: {[key:string]:any[]} = getRecord()
const chats:{[key:string]:any} = getTalk()

// 设置定时任务，每隔 3 秒执行一次
setInterval(() => {
  config.lastSave = new Date().toLocaleString()
  saveConfigFile(config)
  updateHistory(history)
  updateRecord(recordsDir)
  updateTalk(chats)
  updateData(contactList, 'contactList')
  updateData(roomList, 'roomList')
  // log.info('配置已保存')
}, 3000)

// log.info('config:', JSON.stringify(config, null, '\t'))

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
  await updateChats(msg, recordsDir, chats, webClient)
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

        if (baseConfig.baiduvop.items.ak.value) {
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
    const isAdmin = msg.talker().id === baseConfig.admin.items.wxid.value || msg.self()

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
              updateConfig(curId, '', whiteList, config, history)
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
                updateConfig(curId, curUserConfig, whiteList, config, history)
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
            if (baseConfig.openai.items.key.value) {
              text = `#绑定+${baseConfig.openai.items.key.value}+${baseConfig.openai.items.endpoint.value}`
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
            updateConfig(curId, curUserConfig, whiteList, config, history)
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
              updateConfig(curId, curUserConfig, whiteList, config, history)
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
                updateConfig(curId, curUserConfig, whiteList, config, history)
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
              updateConfig(curId, curUserConfig, whiteList, config, history)
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
              updateConfig(curId, curUserConfig, whiteList, config, history)
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
              updateConfig(curId, curUserConfig, whiteList, config, history)
              await msg.say(`超时时间已设置为${timeout}秒`)
            } else {
              await msg.say('未配置key，不能设置参数')
            }
          } catch (err) {
            await msg.say('指令格式有误，请检查后重新输入')
          }
        }
      } else if (text[0] === '/') {
        const textArr = text.split(' ')
        if (textArr[0] === '/msg') {
          const res: MessageActions = await messageStructuring(msg.text())
          log.info('res:', JSON.stringify(res))
          if (res.actions.length) {
            const textMsg:Action|undefined = res.actions[0]
            if (textMsg?.actionType === 'sendMessage') {
              const toUser = await bot.Contact.find({ name:textMsg.event.contacts[0] })
              log.info('toUser:', JSON.stringify(toUser))
              if (toUser) {
                await toUser.say(textMsg.event.text)
                await msg.say('已完成')
              } else {
                await msg.say('未找到联系人')
              }
            }
            if (textMsg?.actionType === 'sendRoomMessage') {
              const toUser = await bot.Room.find({ topic:textMsg.event.rooms[0] })
              if (toUser) {
                await toUser.say(textMsg.event.text)
                await msg.say('已完成')
              } else {
                await msg.say('未找到群')
              }
            }
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
              updateConfig(curId, curUserConfig, whiteList, config, history)
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

const app = new Koa()
const router = new Router()
app.use(cors())
app.use(bodyParser())

// 获取联系人列表
router.get('/api/v1/contact/list', async (ctx: any) => {
  const newContacts: NewContact[] = await getAllContacts(bot)
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
      manager_nickname:room.owner()?.name(),
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
      data:newMembers,
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
      user_info:contactDetail,
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
  const response = { code:200, message:'success', data:{ unread_num:0 } }
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
    data:  { items:applyRecords },
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
  talk_type:number;
  receiver_id:string
}

router.post('/api/v1/talk/create', async (ctx) => {
  const requestBody: CreateTalkRequest = ctx.request.body as CreateTalkRequest
  const chatId = `${requestBody.talk_type}_${requestBody.receiver_id}`
  const chat = chats[chatId]
  chat['content'] = ''
  chat['draft_text'] = ''
  chat['index_name'] = chatId
  chat['created_at'] = chat.updated_at

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
  content: string;
  created_at: string;
  extra: any;
};

// 假设存在一个根据查询参数检索聊天记录的异步函数 getTalkRecords
const getTalkRecords = async (
  recordId: number,
  receiverId: string,
  talkType: number,
  limit: number,
): Promise<TalkRecord[]> => {
  // Implement this function to retrieve the talk records based on query parameters
  const records = recordsDir[receiverId]
  log.info('聊天记录：', records)
  return records || [] // Return an array of talk records
}

router.get('/api/v1/talk/records', async (ctx) => {
  const recordId = Number(ctx.query['record_id']) || 0
  const receiverId = ctx.query['receiver_id'] as string
  const talkType = Number(ctx.query['talk_type']) || 1
  const limit = Number(ctx.query['limit']) || 30

  const talkRecords = await getTalkRecords(recordId, receiverId, talkType, limit)

  const response = {
    code: 200,
    message: 'success',
    data: {
      items: talkRecords,
      limit,
      record_id: recordId,
    },
  }

  ctx.body = response
})

router.post('/api/v1/talk/message/text', async (ctx) => {
  const requestBody: SendTextRequest = ctx.request.body as SendTextRequest
  await updateChatsReply(bot, requestBody, recordsDir, chats, webClient)
  if (requestBody.talk_type === 2) {
    const room = await bot.Room.find({ id: requestBody.receiver_id })
    await room?.say(requestBody.text)
    const response = { code:200, message:'success' }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
  } else if (requestBody.talk_type === 1) {
    const contact = await bot.Contact.find({ id: requestBody.receiver_id })
    await contact?.say(requestBody.text)
    const response = { code:200, message:'success' }
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

app.listen(process.env['HTTP_PORT'])

log.info(`http server running on http://127.0.0.1:${process.env['HTTP_PORT']}`)

// ws服务
const appWs = websockify(new Koa())
const routerWs = new Router<DefaultState, DefaultContext>()
routerWs.get('/wss/default.io', async (ctx: any) => {
  const token:string = ctx.query.token
  // 根据token验证连接，假设存在一个validateToken(token)函数
  const isValidToken = validateToken(token)

  if (isValidToken) {
    webClient = ctx
    ctx.websocket.on('open', () => {
      const message = { event:'connect', content:{ ping_interval:30, ping_timeout:75 } }
      ctx.websocket.send(JSON.stringify(message))
    })
    // 处理消息
    ctx.websocket.on('message', (message: any) => {
      log.info('WebSocket message received:', message)
      const messageJson = JSON.parse(message)

      if (messageJson.event && messageJson.event === 'ping') {
        message = JSON.stringify({ event:'pong' })
        log.info('message:', message)
        // 在此处处理接收到的消息，例如通过发送回应
        ctx.websocket.send(message)
      }

      if (messageJson.event && messageJson.event === 'event":"im.message') {
        const ack = {
          event:'ack',
          sid:messageJson.sid,
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
    ctx.websocket.close(1008, 'Invalid token')
  }
})

// @ts-ignore
appWs.ws.use(routerWs.routes())

// @ts-ignore
appWs.ws.use(routerWs.allowedMethods())

appWs.listen(process.env['WX_PORT'], () => {
  log.info(`WebSocket server running on ws://127.0.0.1:${process.env['WX_PORT']}`)
})
