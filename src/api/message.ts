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
