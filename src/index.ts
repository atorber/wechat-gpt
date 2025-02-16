#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/* eslint-disable camelcase */
/* eslint-disable sort-keys */
import 'dotenv/config.js'
import { Contact, Message, ScanStatus, types, WechatyBuilder, log, Room, Sayable, Wechaty } from 'wechaty'
import { FileBox } from 'file-box'
import { WechatferryPuppet } from '@atorber/puppet'
import qrcodeTerminal from 'qrcode-terminal'
import { BotConfig, CONFIG } from './config.js'
import type { SendTextRequest, MessagePublishRequest } from './types/mod.js'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import { addMessage } from './api/message.js'
import { getTalkRecordsFromServer, getTalkRecordsFromDB, replayMessageByAI } from './api/handler.js'
import {
  getAvatarUrl,
  updateChats,
  updateChatsReply,
  NewContact,
  NewRoom,
  getAllContacts,
  getAllRooms,
  ContactDetail,
  RoomDetail,
  getPhone,
} from './api/chat.js'
import { validateToken } from './service/user-service.js'
import { PoemPalette } from './bot/handlers/poem-palette.js'
import { createPoster } from './bot/handlers/poem.js'
import { PoemPalette as PoemPaletteCoze } from './bot/handlers/poem-palette-coze.js'
import Koa, { DefaultState, DefaultContext } from 'koa'
import Router from '@koa/router'
// import bodyParser from 'koa-bodyparser'
import { koaBody } from 'koa-body'
import path from 'path'
import { AppRoutes } from './routes/routes.js'
import cors from '@koa/cors'
import websockify from 'koa-websocket'
import serve from 'koa-static'
import { loggerMiddleware } from './middleware/logger.js'
import UserController from './controller/user-controller.js'

// 获取当前文件根目录路径
const rootDir = path.resolve(process.cwd(), './')
log.info('rootDir:', rootDir)

let currentUser: Contact
let botConfig: BotConfig

const whiteList: any = []

let webClient: any
let chats: { [key: string]: any }

let isCreating = false
let textPoemLatest: any = {}

const pp = new PoemPalette(CONFIG.MJ_TOKEN, CONFIG.COZE_TOKEN)
const ppCoze = new PoemPaletteCoze(CONFIG.COZE_TOKEN, CONFIG.BOT_ID)
let isCozeCreating = false

// 设置定时任务，每隔 3 秒执行一次
setInterval(() => {
  console.info('定时任务执行', new Date().toLocaleString())
  botConfig.updateTalk(chats)
  chats = botConfig.getTalk()
}, 30000)

// log.info('config:', JSON.stringify(config, null, '\t'))

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
  if (CONFIG.WECHATY_PUPPET && [ 'wechaty-puppet-wechat', 'wechaty-puppet-wechat4u', 'wechaty-puppet-padlocal', 'wechaty-puppet-wechatferry' ].includes(CONFIG.WECHATY_PUPPET)) {
    initConfig(user)
  }
}

// 机器人就绪
function onReady () {
  if (CONFIG.WECHATY_PUPPET && [ 'wechaty-puppet-service' ].includes(CONFIG.WECHATY_PUPPET)) {
    initConfig(bot.currentUser)
  }
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

// bot.start()
//   .then(() => log.info('StarterBot', 'Starter Bot Started.'))
//   .catch(e => log.error('StarterBot', e))

function startBot () {
  log.info('开始启动...')
  try {
    bot.stop().then(() => {
      bot.start()
        .then(() => {
          log.info('机器人已启动')
          return true
        })
        .catch(e => {
          log.error('StarterBot 失败...', e)
          // 等待一段时间后重启
        })
      return true
    }).catch(e => {
      log.error('机器人启动失败...', e)
      bot.start()
        .then(() => {
          log.info('StarterBot', 'Starter Bot Started.')
          return true
        })
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
router.post('/api/v1/auth/login', UserController.login)

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
    if (![ '.jpg', '.jpeg', '.png', '.gif' ].includes(fileExt)) {
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
      avatar: await getAvatarUrl(room) || CONFIG.DEFAULT_AVATAR, // 设置联系人头像
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

// 获取群申请未读数
router.get('/api/v1/group/apply/unread', async (ctx: any) => {
  const response = { code: 200, message: 'success', data: { unread_num: 0 } }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
})

// 1查询用户表情包接口
// ServeFindUserEmoticon | GET | /api/v1/emoticon/list |
router.get('/api/v1/emoticon/list', async (ctx: any) => {
  const response = { code: 200, message: 'success', data: { collect_emoticon: [], sys_emoticon: [] } }
  ctx.set('Content-Type', 'application/json; charset=utf-8')
  ctx.body = response
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
      avatar: await getAvatarUrl(contact) || CONFIG.DEFAULT_AVATAR, // 设置联系人头像
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
    avatar: await getAvatarUrl(contact) || CONFIG.DEFAULT_AVATAR,
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
  const talkRecords = await getTalkRecordsFromDB(bot)
  console.info('talkRecords:', talkRecords)

  for (const item of talkRecords) {
    const StrTalker = item.StrTalker
    console.info('StrTalker:', StrTalker)
    const id = StrTalker.includes('@chatroom') ? `2_${StrTalker}` : `1_${StrTalker}`
    const talk_type = StrTalker.includes('@chatroom') ? 2 : 1
    const updated_at = new Date(item.CreateTime * 1000 + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '')
    let name = ''
    let avatar = ''
    if (StrTalker.includes('@chatroom')) {
      try {
        const room = await bot.Room.find({ id: StrTalker })
        name = await room?.topic() || ''
        console.info('获取群名称成功:', room)
        if (room) {
          const avatarObj = await room.avatar()
          const avatarJson = avatarObj.toJSON() as any
          avatar = avatarJson.url as string
          // console.info('获取群头像成功:', avatarJson)
        }
      } catch (err) {
        console.info('获取群名称失败:', err)
      }
    } else {
      try {
        const contact = await bot.Contact.find({ id: StrTalker })
        name = contact?.name() || ''
        console.info('获取联系人名称成功:', contact)
        if (contact) {
          const avatarObj = await contact.avatar()
          const avatarJson = avatarObj.toJSON() as any
          avatar = avatarJson.url as string
          // console.info('获取联系人头像成功:', avatarJson)
        }
      } catch (err) {
        console.info('获取联系人名称失败:', err)
      }
    }
    const talkRecord = {
      avatar,
      id,
      index_name: id,
      is_disturb: 0,
      is_online: 1,
      is_robot: 0,
      is_top: 0,
      msg_text: item.StrContent || '...',
      name,
      receiver_id: StrTalker,
      remark_name: '',
      talk_type,
      unread_num: 0,
      updated_at,
    }
    if (name) {
      result.push(talkRecord)
    }
  }

  // for (const key in chats) {
  //   result.push(chats[key])
  // }

  // console.info('result:', result)

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
  receiverId: string,
  limit: number,
  cursor: number,
  bot: Wechaty,
): Promise<TalkRecord[]> => {
  // Implement this function to retrieve the talk records based on query parameters
  const talkRecordsServer: any[] = await getTalkRecordsFromServer(receiverId, limit, cursor, bot)
  console.info('talkRecordsServer:', talkRecordsServer)

  const records: TalkRecord[] = []
  for (const item of talkRecordsServer) {
    // 格式：2025-02-10 10:10:44
    const created_at = new Date(item.CreateTime * 1000 + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '')
    const receiver_id = item.StrTalker.includes('@chatroom') ? item.StrTalker : item.StrSender
    const record: TalkRecord = {
      id: item.localId,
      sequence: item.Sequence,
      msg_id: item.MsgSvrID,
      talk_type: item.StrTalker.includes('@chatroom') ? 2 : 1,
      msg_type: 1,
      user_id: item.StrSender,
      receiver_id,
      nickname: item.nickname,
      avatar: '',
      is_revoke: 0,
      is_mark: 1,
      is_read: 1,
      created_at,
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
        lang: 'yaml',
      }
      record.extra = content
      record.msg_type = 2
    }
    records.push(record)
  }

  // log.info('聊天记录：', JSON.stringify(records))
  return records
}

router.get('/api/v1/talk/records', async (ctx) => {
  const recordId = Number(ctx.query['record_id']) || 0
  const receiverId = ctx.query['receiver_id'] as string
  const limit = Number(ctx.query['limit']) || 30
  const cursor = Number(ctx.query['cursor']) || 0

  const talkRecords = await getTalkRecords(receiverId, limit, cursor, bot)

  const orderTalkRecords = (talkRecords: { created_at: string }[]) => {
    return talkRecords.sort((a: { created_at: string }, b: { created_at: string }) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
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
  await updateChatsReply(bot, requestBody, chats, webClient)
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
