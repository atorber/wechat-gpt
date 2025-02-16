/* eslint-disable camelcase */
/* eslint-disable sort-keys */
import 'dotenv/config.js'
import * as fs from 'fs'
import { FileBox } from 'file-box'
import path from 'path'
import axios from 'axios'
import { v4 as uuid } from 'uuid'

// 设置超时时间
axios.defaults.timeout = 300000

export interface ChatMessage {
    /**
     * 标识发送消息的角色：用户或机器人
     * - user：用户输入内容
     * - assistant：返回内容
     */
    role: 'user' | 'assistant';

    /**
     * 标识消息类型，主要用于区分role=assistant时bot返回的消息：
     * - answer：bot最终返回给用户的消息内容
     * - function_call： bot对话过程中决定调用function_call的中间结果
     * - tool_response：function_call调用工具后返回的结果
     * - follow_up：如果在bot上配置打开了Auto-Suggestion开关，则会返回flow_up内容
     */
    type?: 'answer' | 'function_call' | 'tool_response' | 'follow_up';

    /**
     * 消息的内容
     */
    content: string;

    /**
     * 消息内容的类型
     * - text 文本类型，bot返回type=answer时采用markdown语法返回
     * - 其他类型目前暂未上线，后续扩展
     */
    content_type: 'text' | 'card';
}

export interface ChatMessageCard {
    card_type:number;
    template_url:string;
    template_id:number;
    response_for_model:any;
    content_type:number;
    data:any;
    response_type:string;
}

export interface CozeBotConfig {
    api_key: string;
    bot_id: string;
    endpoint: string;
}

export interface ChatV2ReqRaw {
    /**
     * 标识API背后的具体交互bot
     */
    bot_id: string;

    /**
 * 标识对话发生在哪一次会话中，使用方自行维护此字段
 */
    conversation_id?: string;

    /**
     * 标识当前与bot交互的用户，使用方自行维护此字段
     */
    user: string;

    /**
     * 发送给 Bot 的消息内容。
     */
    query: string;

    /**
     * 传递会话上下文
     */
    chat_history?: ChatMessage[];
}

export interface ChatV2Req {

    /**
 * 标识对话发生在哪一次会话中，使用方自行维护此字段
 */
    conversation_id?: string;

    /**
     * 标识当前与bot交互的用户，使用方自行维护此字段
     */
    user: string;

    /**
     * 发送给 Bot 的消息内容。
     */
    query: string;

    /**
     * 传递会话上下文
     */

    history_count?: number;

    /**
 * 是否采用流式返回，默认为 false
 */
    stream?: boolean;

    /**
     * 自定义变量，key=变量名，value=变量值
     */
    custom_variables?: Record<string, string>;
}

export interface ChatV2ReqWithUserDefinedChatHistory {
    /**
 * 标识对话发生在哪一次会话中，使用方自行维护此字段
 */
    conversation_id?: string;

    /**
     * 标识当前与bot交互的用户，使用方自行维护此字段
     */
    user: string;

    /**
     * 发送给 Bot 的消息内容。
     */
    query: string;

    /**
     * 传递会话上下文
     */
    chat_history: ChatMessage[];

    /**
 * 是否采用流式返回，默认为 false
 */
    stream?: boolean;

    /**
     * 自定义变量，key=变量名，value=变量值
     */
    custom_variables?: Record<string, string>;
}

/**
 * 非流式返回结构
 */
export interface ChatV2Resp {
    /**
     * 整个对话过程返回的消息
     */
    messages: ChatMessage[];

    /**
     * 当前对话的标识
     */
    conversation_id: string;

    /**
     * 状态码，非0标识对话过程出现错误
     * - 对于非流式返回，只有code=0才会返回messages
     */
    code: number;

    /**
     * 状态信息，成功请求为"success"，错误请求为error信息
     */
    msg: string;
}

/**
 * 流式返回结构
 */
export interface ChatV2StreamResp {

    event: string;
    /**
     * 增量返回的消息内容
     */
    message: ChatMessage;

    /**
     * 标识当前message是否结束
     *
     * message结束不一定代表整个流结束，bot返回的message会有不同的type，可见 ChatMessage 的介绍
     */
    is_finish?: boolean;

    /**
 * 返回message的标识，一个index唯一对应一条message
 */
    index: number;

    /**
     * 当前的会话id
     */
    conversation_id: string;
    code: number;
    msg: string;
}

class ChatResp {

  /**
     * 整个对话过程返回的消息
     */
  messages: ChatMessage[]

  /**
     * 当前对话的标识
     */
  conversation_id: string

  /**
     * 状态码，非0标识对话过程出现错误
     * - 对于非流式返回，只有code=0才会返回messages
     */
  code: number

  /**
     * 状态信息，成功请求为"success"，错误请求为error信息
     */
  msg: string
  data: ChatV2Resp
  constructor (chatResp: ChatV2Resp) {
    this.messages = chatResp.messages
    this.conversation_id = chatResp.conversation_id
    this.code = chatResp.code
    this.msg = chatResp.msg
    this.data = chatResp
  }

  // 提取出对话中的answer
  extractAnswer (): ChatMessage[] {
    const answers:ChatMessage[] = this.messages.filter((item) => item.role === 'assistant' && item.type === 'answer')
    // console.info('answers', JSON.stringify(answers, null, 2))
    return answers
  }

  // 提取出对话中的图片链接
  extractImageUrls (): string[] {
    const answers:ChatMessage[] = this.messages.filter((item) => item.role === 'assistant' && item.type === 'answer' && item.content_type === 'text')
    // console.info('answers', JSON.stringify(answers, null, 2))
    const imageUrls: string[] = []

    answers.forEach((item) => {
      const content = item.content
      // 匹配图片链接，正则表达式，匹配格式为 [.*](.*)
      const reg = /\[.*\]\((.*)\)/g
      let result:string[]|null = null
      while ((result = reg.exec(content)) !== null) {
        // console.info('result:', result)
        if (result[1]) {
          imageUrls.push(result[1])
        }
      }
    })
    // console.info('imageUrls:', JSON.stringify(imageUrls, null, 2))
    return imageUrls
  }

  // 提取出对话中的卡片消息
  extractCards (type = 'answer'): ChatMessageCard[] {
    const cardsList: ChatMessageCard[] = []
    const cards = this.messages.filter((item) => item.role === 'assistant' && item.content_type === 'card' && item.type === type)
    // console.info('cards:', JSON.stringify(cards, null, 2))
    if (cards.length > 0) {
      cards.forEach((item) => {
        const cardContent:ChatMessageCard = parseContent(JSON.parse(item.content))
        // console.info('cardContent:', JSON.stringify(cardContent, null, 2))

        // item.content = cardContent
        // cardsList.push(item)
        cardsList.push(cardContent)
      })
    }
    // console.info('cardsList:', JSON.stringify(cardsList, null, 2))
    return cardsList
  }

  // 按条件查找对话中的指定类型内容
  filterAnswer (filter?:{type?: 'answer' | 'function_call' | 'tool_response' | 'follow_up', content_type?:'text'|'card'}): ChatMessage[] {
    let answers:ChatMessage[] = []
    if (filter?.type && filter.content_type) {
      answers = this.messages.filter((item) =>  item.type === filter.type && item.content_type === filter.content_type)
    } else if (!filter?.type && filter?.content_type) {
      answers = this.messages.filter((item) =>  item.content_type === filter.content_type)
    } else if (!filter?.content_type && filter?.type) {
      answers = this.messages.filter((item) =>  item.type === filter.type)
    } else {
      answers = this.messages
    }
    // console.info('answers', JSON.stringify(answers, null, 2))
    return answers
  }

}

// 遍历cardContent的所有key及子key，将key对一个的value转换为JSON对象，如果不能转换则保持原样
const  parseContent = (content:any) => {
  Object.keys(content).forEach((key) => {
    try {
      let value = JSON.parse(content[key])
      //   console.info('value:', value)
      if (typeof value === 'object' && Object.keys(value).length > 0) {
        value = parseContent(value)
        content[key] = value
      }

    } catch (error) {
      // console.error('error:', error)
    }
  })
  return content
}

export class CozeBot {

  private readonly config: CozeBotConfig
  history: Record<string, ChatMessage[]> = {}
  private axios = axios

  constructor (config: CozeBotConfig) {
    this.config = {
      api_key: config.api_key,
      endpoint: config.endpoint || 'https://api.coze.cn/open_api/v2/chat',
      bot_id: config.bot_id!,
    }

    this.axios.defaults.headers.common = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + this.config.api_key,
    }
    this.axios.defaults.timeout = 300000
  }

  // 保存历史消息
  saveHistory (input: ChatV2Req, chatResp: ChatV2Resp): void {
    const answers:ChatMessage[] = chatResp.messages.filter((item) => item.role === 'assistant' && item.type === 'answer' && item.content_type === 'text')
    // console.info('answers', JSON.stringify(answers, null, 2))
    if (answers.length > 0) {
      const answer = answers[0] as ChatMessage
      const conversation_id = input.conversation_id
      if (conversation_id) {
        const queryMessage: ChatMessage = {
          content: input.query,
          content_type: 'text',
          role: 'user',
        }

        const curConversation = this.history[conversation_id] || []

        if (curConversation.length === 0) {
          this.history[conversation_id] = []
        }

        curConversation.push(queryMessage)
        curConversation.push(answer)

        this.history[conversation_id] = curConversation
      }
    }

  }

  async chat (chatReq: ChatV2Req): Promise<ChatResp> {
    let chat_history: ChatMessage[] = []
    chatReq.history_count = chatReq.history_count || 0
    if (chatReq.history_count > 0 && chatReq.conversation_id && this.history[chatReq.conversation_id]) {
      const curConversation = this.history[chatReq.conversation_id] || []
      chat_history = chatReq.history_count <= curConversation.length ? curConversation.slice(-chatReq.history_count) : curConversation
    }

    const data = {
      bot_id: this.config.bot_id,
      conversation_id: chatReq.conversation_id || uuid(),
      user: chatReq.user,
      query: chatReq.query,
      chat_history,
      stream: false,
      custom_variables: chatReq.custom_variables,
    }
    console.info('body data:', JSON.stringify(data))
    const res = await this.axios.post(this.config.endpoint, data)
    const resultData: ChatV2Resp = res.data
    this.saveHistory(data, resultData)
    // console.info('chat res:', JSON.stringify(resultData))
    return new ChatResp(resultData)
  };

  // 用户自定义历史消息
  async chatWithUserDefinedChatHistory (user: string, query: string, chatHistory: ChatMessage[] = []): Promise<ChatResp> {
    const data = {
      conversation_id: uuid(),
      bot_id: this.config.bot_id,
      user,
      query,
      chat_history: chatHistory,
      stream: false,
    }
    console.info('data:', JSON.stringify(data))
    const res = await this.axios.post(this.config.endpoint, data)
    console.info('res:', JSON.stringify(res.data))
    const resultData: ChatV2Resp = res.data
    const answers:ChatMessage[] = resultData.messages.filter((item) => item.role === 'assistant' && item.type === 'answer')
    console.info('answers:', JSON.stringify(answers, null, 2))
    return new ChatResp(resultData)
  };

  async chatStream (chatReq: ChatV2Req): Promise<any> {
    const data = {
      bot_id: this.config.bot_id,
      conversation_id: chatReq.conversation_id || uuid(),
      user: chatReq.user,
      query: chatReq.query,
      stream: true,
      custom_variables: chatReq.custom_variables,
    }
    console.info('body data:', JSON.stringify(data))
    const response = await this.axios.post(this.config.endpoint, data)
    console.info('response:', response.data)
    let resultData = response.data
    console.info('resultData:', resultData)

    // 移除resultData中的回车换行符
    resultData = resultData.replace(/[\r\n]/g, '')
    const events = resultData.split('data:')
    console.info('events:', JSON.stringify(events, null, 2))
    for (const i in events) {
      const event = events[i]
      if (event) {
        const data = JSON.parse(event)
        console.info('data:', JSON.stringify(data, null, 2))
        // console.info(data.message.content)
        events[i] = JSON.parse(event)
      }
    }
    console.info('events:', JSON.stringify(events, null, 2))
    return events
  }

}

export {
  uuid,
}
