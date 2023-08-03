import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import * as dotenv from 'dotenv'
import { createLanguageModel, createJsonTranslator } from 'typechat'
import { log } from 'wechaty'
import type {
  Message,
} from 'wechaty'

import type { MessageActions } from '../types/messageActionsSchema'

import DB from '../db/nedb.js'
const messageData = DB('data/message.db')

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// TODO: use local .env file.
dotenv.config({ path: path.join(__dirname, '../../.env') })
log.info('env', process.env)

const model = createLanguageModel(process.env)
const schema = fs.readFileSync('src/types/messageActionsSchema.ts', 'utf8')
const translator = createJsonTranslator<MessageActions>(model, schema, 'MessageActions')
translator.validator.stripNulls = true

// Process requests interactively or from the input file specified on the command line
export const messageStructuring = async (text: string) => {
  const response: any = await translator.translate(text)
  log.info('messageStructuring:', JSON.stringify(response, undefined, 2))
  if (!response.success) {
    log.info('messageStructuring 请求失败：\n', response.message)
    return response
  }
  const messageActions = response.data
  log.info('结构化数据：\n', JSON.stringify(messageActions, undefined, 2))
  if (messageActions.actions.some((item: { actionType: string }) => item.actionType === 'unknown')) {
    log.info('语义无匹配：\n', "I didn't understand the following:")
    for (const action of messageActions.actions) {
      if (action.actionType === 'unknown') log.info('未匹配到类型：\n', action.text)
    }
    return messageActions
  }
  return messageActions
}

export const addMessage = async (message: Message) => {
  const talker = message.talker()
  const listener = message.listener()
  const room = message.room()
  let roomJson:any
  if (room) {
    roomJson = JSON.parse(JSON.stringify(room))
    delete roomJson.payload.memberIdList
  }

  const messageNew = {
    _id: message.id,
    data: message,
    listener:listener ?? undefined,
    room:roomJson,
    talker,
  }
  // log.info('addMessage messageNew:', JSON.stringify(messageNew))
  try {
    const res:any = await messageData.insert(messageNew)
    log.info('addMessage success:', res._id)
    return true
  } catch (e) {
    log.error('addMessage fail:', e)
    return false
  }

}

export const addSelfMessage = async (message: Message) => {
  const talker = message.talker()
  const listener = message.listener()
  const room = message.room()
  const messageNew = {
    _id: message.id,
    data: message,
    listener:listener ?? undefined,
    room:room ?? undefined,
    talker,
  }
  const res = await messageData.insert(messageNew)
  log.info('addMessage:', JSON.stringify(res))
}

export const extractAtContent = (keyword: string, message: string): string | null => {
  const startTag = '：'
  const endTag = '」<br/>'

  // 判断信息中是否包含关键字
  if (message.endsWith(keyword)) {
    const startIndex = message.indexOf(startTag) + startTag.length
    const endIndex = message.indexOf(endTag, startIndex)

    // 提取「和 」之间的内容
    if (startIndex !== -1 && endIndex !== -1) {
      return message.substring(startIndex, endIndex)
    }
  }

  return null
}

// // 示例消息
// const message = "「luyuchao：测试消息」<br/>- - - - - - - - - - - - - - -<br/>@瓦力";

// const extractedContent = extractContent(message);
// if (extractedContent) {
//   console.log("提取到的内容：", extractedContent);
// } else {
//   console.log("未找到匹配的内容");
// }
