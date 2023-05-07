/* eslint-disable sort-keys */
import Api2d from 'api2d'
import {
  log,
} from 'wechaty'

/**
 * @param {any} gptConfig
 * @param {any[]} messages
 * @returns {object}
 */
async function getChatGPTReply (gptConfig: any, messages: any[]) {
  try {
    const api = new Api2d(gptConfig.key, gptConfig.endpoint, gptConfig.timeout * 1000)
    const body = {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: gptConfig.temperature,
      max_tokens:gptConfig.maxTokenNum,
      n: 1,
      stream: false,
    }
    log.info('body:', JSON.stringify(body))
    const completion: any = await api.completion(body)
    const responseMessage = completion

    // log.info('responseMessage', responseMessage)
    // answer = {
    //   messageType: types.Message.Text,
    //   text: responseMessage.choices[0].message.content,
    // }

    return responseMessage.choices[0].message
  } catch (err) {
    console.error(err)
    return {
      content: '发生了一些错误，请稍后再试~',
      role: 'err',
    }
  }
}

export {
  getChatGPTReply,
}
