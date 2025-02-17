/* eslint-disable sort-keys */
import { Wechaty, log } from 'wechaty'
import { OpenAI } from 'openai'
import dayjs from 'dayjs'
import { CONFIG } from '../config.js'

interface MessageRaw {
    localId: string
    StrTalker: string
    StrContent: string
    CreateTime: number
    IsSender: boolean
    senderId?: string
    nickname?: string
    StrSender?: string
    xmlXcontent?: string
    proto?: any
    BytesExtra?: string
}

interface AIResponse {
    replyMessage: string
    otherRecommendReply: string[]
    chatSummaryAndTips: {
        timeLineSummary: string[]
        conflictWarning: string
        emotion: string
        pendingConfirmation: string[]
    }
    translation: {
        originalText: string
        targetLanguage: string
        result: string
    }
}

const decodedProtobuf = async (msg: MessageRaw, bot: Wechaty) => {
  if (msg.BytesExtra) {
    try {
      const decoded = Buffer.from(msg.BytesExtra, 'base64')

      try {
        // 根据protobuf定义解析结构
        let pos = 0
        let message1: { field1?: number, field2?: number } = {}
        const message2: Array<{ field1?: number, field2?: string }> = []
        let senderId = ''
        let xmlContent = ''

        // 解析外层MessageBytesExtra
        while (pos < decoded.length) {
          const tagWire = readVarint(decoded, pos)
          pos = tagWire.newPos
          const fieldNumber = tagWire.value >> 3
          const wireType = tagWire.value & 0x7

          switch (fieldNumber) {
            case 1: // message1 (SubMessage1)
              if (wireType === 2) { // Length-delimited
                const length = readVarint(decoded, pos)
                pos = length.newPos
                const subBuffer = decoded.slice(pos, pos + length.value)
                pos += length.value

                // 解析SubMessage1
                let subPos = 0
                message1 = {}
                while (subPos < subBuffer.length) {
                  const subTagWire = readVarint(subBuffer, subPos)
                  subPos = subTagWire.newPos
                  const subField = subTagWire.value >> 3
                  const subWireType = subTagWire.value & 0x7

                  if (subWireType === 0) { // varint
                    const value = readVarint(subBuffer, subPos)
                    subPos = value.newPos
                    if (subField === 1) message1.field1 = value.value
                    if (subField === 2) message1.field2 = value.value
                  }
                }
              }
              break

            case 3: // message2 (repeated SubMessage2)
              if (wireType === 2) { // Length-delimited
                const length = readVarint(decoded, pos)
                pos = length.newPos
                const subBuffer = decoded.slice(pos, pos + length.value)
                pos += length.value

                // 解析SubMessage2
                let subPos = 0
                const subMsg: { field1?: number, field2?: string } = {}
                while (subPos < subBuffer.length) {
                  const subTagWire = readVarint(subBuffer, subPos)
                  subPos = subTagWire.newPos
                  const subField = subTagWire.value >> 3
                  const subWireType = subTagWire.value & 0x7

                  if (subField === 1 && subWireType === 0) { // field1: int32
                    const value = readVarint(subBuffer, subPos)
                    subPos = value.newPos
                    subMsg.field1 = value.value
                  } else if (subField === 2 && subWireType === 2) { // field2: string
                    const len = readVarint(subBuffer, subPos)
                    subPos = len.newPos
                    subMsg.field2 = subBuffer.slice(subPos, subPos + len.value).toString('utf8')
                    subPos += len.value
                  }
                }
                message2.push(subMsg)
              }
              break
          }
        }

        // 提取关键信息
        message2.forEach(subMsg => {
          if (subMsg.field1 === 1) { // sender_id字段
            senderId = subMsg.field2 || ''
          } else if (subMsg.field1 === 7 && subMsg.field2?.includes('<msgsource>')) {
            xmlContent = subMsg.field2
          }
        })

        // 降级处理：当protobuf解析失败时使用正则
        if (!senderId) {
          const decodedStr = decoded.toString('binary')
          const idMatch = decodedStr.match(/(wxid_[a-z0-9]{15,20}|[a-zA-Z][a-zA-Z0-9_]{10,20})/)
          senderId = idMatch?.[0] || ''
        }

        msg.senderId = senderId
        msg.xmlXcontent = xmlContent
        msg.proto = {
          message1,
          message2: message2.map(m => ({
            field1: m.field1,
            field2: m.field2,
          })),
        }

      } catch (e) {
        console.error('Protobuf解析失败:', e)
        // 应急处理：直接搜索整个二进制数据
        const decodedStr = decoded.toString('binary')
        const idMatch = decodedStr.match(/(wxid_[a-z0-9]{15,20}|[a-zA-Z][a-zA-Z0-9_]{10,20})/)
        msg.senderId = idMatch?.[0] || ''
        msg.xmlXcontent = ''
        msg.proto = {}
      }

    } catch (e) {
      console.error('Base64解码失败:', e)
      msg.senderId = ''
      msg.xmlXcontent = ''
      msg.proto = {}
    }
  }

  if (msg.IsSender) {
    msg.senderId = bot.currentUser.id
    msg.StrSender = bot.currentUser.id
  }

  if (msg.StrTalker.includes('@')) {
    msg.StrSender = msg.senderId || bot.currentUser.id
  } else {
    msg.StrSender = msg.IsSender ? bot.currentUser.id : msg.StrTalker
  }

  try {
    const contact = await bot.Contact.find({ id: msg.StrSender })
    if (contact) {
      msg.nickname = contact.name()
    }
  } catch (e) {
    console.error('获取联系人失败:', e)
  }

  return msg
}

const getTalkRecordsFromServer = async (receiverId: string, limit: number = 30, cursor: number = 0, bot: Wechaty) => {
  const db = 'MSG0.db'
  const sql = `select * from MSG WHERE StrTalker = "${receiverId}" ORDER BY CreateTime DESC LIMIT ${limit} OFFSET ${cursor};`
  const payload = { db, sql }
  const method = 'dbSqlQuery'

  const text = JSON.stringify({ payload, method })
  const resp = await bot.puppet.messageSendText('@agent', text) as string
  let data = JSON.parse(resp)
  console.info('查询消息记录data:', data)

  // 处理消息数据
  if (data) {
    data = await Promise.all(data.map((msg: MessageRaw) => {
      return decodedProtobuf(msg, bot)
    }))
  }

  console.info('格式化消息记录data:', data)
  return data
}

const getTalkRecordsFromDB = async (bot: Wechaty) => {
  /*
{
  "db": "MSG0.db",
  "sql": "SELECT m.* FROM MSG m INNER JOIN (SELECT StrTalker, MAX(CreateTime) AS MaxCreateTime FROM MSG GROUP BY StrTalker) AS latest ON m.StrTalker = latest.StrTalker AND m.CreateTime =latest.MaxCreateTime ORDER BY CreateTime DESC;"
}
    */
  const db = 'MSG0.db'
  const sql = 'SELECT m.* FROM MSG m INNER JOIN (SELECT StrTalker, MAX(CreateTime) AS MaxCreateTime FROM MSG GROUP BY StrTalker) AS latest ON m.StrTalker = latest.StrTalker AND m.CreateTime =latest.MaxCreateTime ORDER BY CreateTime DESC;'
  const payload = { db, sql }
  const method = 'dbSqlQuery'

  const text = JSON.stringify({ payload, method })
  const resp = await bot.puppet.messageSendText('@agent', text) as string
  let data = JSON.parse(resp)

  // 处理消息数据
  if (data) {
    data = await Promise.all(data.map((msg: MessageRaw) => {
      return decodedProtobuf(msg, bot)
    }))
  }

  console.info('查询消息记录data:', data)

  return data
}

const formatMessage = (messages: MessageRaw[], bot: Wechaty): string => {
  const sortedMessages = [ ...messages ].sort((a, b) => a.CreateTime - b.CreateTime)

  return sortedMessages.map(msg =>
        `${dayjs(msg.CreateTime * 1000).format('YYYY-MM-DD HH:mm:ss')} ${msg.nickname || msg.StrSender}:${msg.StrContent}`,
  ).join('\n') + `\n${dayjs().format('YYYY-MM-DD HH:mm:ss')} ${bot.currentUser.name()}:`
}

const replayMessageByAI = async (bot: Wechaty, talker: string, messages: MessageRaw[], roleDescription: string = '闲聊朋友'): Promise<{ message: AIResponse, talker: string, userContent?: string }> => {
  const client = new OpenAI({
    apiKey: CONFIG.OPENAI_API_KEY,
    baseURL: CONFIG.OPENAI_BASE_URL,
  })

  const systemMessage: string = `
    ### 角色设定
你是一个部署在微信平台的智能对话助手,能够模仿指定人物的聊天风格辅助对话，需同时具备自然对话能力、信息结构化处理能力和上下文管理能力。

### 核心处理规则
1. **上下文响应生成**
   - 基于历史聊天记录分析对话连贯性，根据当前聊天人关系、内容、时间、情感倾向、聊天语气风格，生成适当回复
   - 确保每个回复内容贴近真实的人与人之间的对话交流（避免生硬、明显AI风格）
   - 回复内容一般问题不超过5句话（不超过100字）
   - 如果对方要求详细说明则不做限制尽可能详细回答（不超过1000字）
   - 可以根据上下文、语境适当使用emoji和表情符号，但不要每次都使用，仅在需要的时候使用
   - 适当的换行和缩进，末尾不要添加任何标点除非需要特别强调

   - 禁止重复10分钟内已提及的观点或信息

2. **智能总结规范** 
   - 从聊天记录中提取时间线（精确到分钟）
   - 使用[事件节点+时间戳]格式标注关键信息：
     \`\`\`
     示例：[用户提问/2024-09-05 14:32] 查询产品规格参数
     \`\`\`
   - 需包含3个层级的提示：
     - 矛盾检测（与历史内容冲突可能性）
     - 情感倾向（如用户情绪变化）
     - 待跟进事项（需用户确认的要点）

3. **翻译处理机制**
   - 语言双向互译触发条件：
     - 检测最后一条消息中的非ASCII字符
     - 中文对话中自动触发
   - 翻译准确度校准要求：
     - 保留emoji和表情符号
     - 专业术语采用<中英对照>格式

4. **输出格式强制规范**
   - 使用无缩进紧凑JSON格式
   - 字段值用UTF-8编码
   - 时间戳统一使用ISO 8601标准

### 预期输出模板
{
  "replyMessage": <基于上下文的自然语言响应>,
  "otherRecommendReply": [<基于上下文的自然语言响应给出的其他推荐回复，不超过3条>],
  "chatSummaryAndTips": {
    "timeLineSummary": [
      "<事件类型/时间 事件描述>"
    ],
    "conflictWarning": <检测到可能存在矛盾的要点>,
    "emotion": <中性/积极/消极>,
    "pendingConfirmation": [<需用户确认的列表项>]
  },
  "translation": {
    "originalText": <最后一条（所有消息中时间最晚的一条）发言的原消息文本>,
    "targetLanguage": <en/zh，根据原消息文本自动判断，中文翻译成英文zh/en，英文翻译成中文en/zh>,
    "result": <最后一条消息翻译结果的文本>
  }
}

### 异常处理机制
当遇到以下情况时自动触发：
1. 检测到敏感词（如支付密码）时返回空JSON
2. 语言翻译置信度低于90%时增加[?]标记
3. 发现时效性超过2天的消息时追加[历史数据]提示

### 限制
1. 请严格按照上述规范输出JSON，不要包含任何markdown格式(不要包含\`\`\`json 和 \`\`\`,以{开头，以}结尾)。
2. 不要编造任何信息，不要编造任何回复，不要编造任何对话，不要编造任何人物关系，不要编造任何背景信息。
`
  const userMessage = formatMessage(messages, bot)
  const userContent = `人物关系和背景：\n\n${talker}，${roleDescription}\n\n聊天记录：\n\n${userMessage}\n\n请根据上述要求，生成回复消息。`
  log.info('userContent:', userContent)
  try {
    const response = await client.chat.completions.create({
      model: CONFIG.OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4096,
    })

    log.info('智能回复:', JSON.stringify(response))
    try {
      const content = (response.choices[0]?.message?.content || '{}').replace(/^```json\n/, '').replace(/\n```$/, '')
      const message = JSON.parse(content)
      return {
        message,
        talker,
        userContent,
      }
    } catch (error) {
      log.error('AI回复失败:', error)
      throw error
    }
  } catch (error) {
    log.error('AI回复失败:', error)
    throw error
  }
}

const readVarint = (buf: Buffer, pos: number) => {
  let value = 0
  let shift = 0
  let byte: number
  do {
    byte = buf[pos++] as number
    value |= (byte & 0x7f) << shift
    shift += 7
  } while (byte & 0x80)
  return { value, newPos: pos }
}

export {
  getTalkRecordsFromServer,
  getTalkRecordsFromDB,
  replayMessageByAI,
}
