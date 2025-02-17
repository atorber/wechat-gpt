/* eslint-disable sort-keys */
/* eslint-disable camelcase */
import type { MessagePublishRequest } from '../types/mod.js'
import { Wechaty, log } from 'wechaty'
import { sendMessage } from '../bot/index.js'
import { FileBox } from 'file-box'
import { CONFIG } from '../config.js'

export default class TalkService {

  hello = () => {
    return new Promise(resolve => resolve('hello world,' + new Date().toLocaleString()))
  }

  async sendMessage (ctx: any) {
    // {"type":"text","content":"ff","quote_id":"","mentions":[],"receiver":{"receiver_id":2055,"talk_type":1}}
    // {"type":"image","width":1024,"height":1024,"url":"https://im-static.gzydong.com/public/media/image/202404/2f82bc68-131c-4bac-a85f-46462b630cb9_1024x1024.png","size":10000,"receiver":{"receiver_id":2055,"talk_type":1}}
    console.info('ctx.request.body:', ctx.request.body)
    const model: MessagePublishRequest = ctx.request.body
    const receiver = model.receiver
    const receiver_id = receiver.receiver_id
    const bot = ctx.bot as Wechaty
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
  }

  // 发送文件消息/api/v1/talk/message/file
  async sendFile (ctx: any) {
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
    const bot = ctx.bot as Wechaty
    const file = CONFIG.FILES[upload_id]
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
    return ctx
  }

}
