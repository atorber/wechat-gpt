/* eslint-disable sort-keys */
import Api2d from 'api2d'
import {
  Contact,
  Message,
  ScanStatus,
  WechatyBuilder,
  log,
  types,
}                  from 'wechaty'
async function gpt (gptConfig: any, messages: any[]) {
  try {
    const api = new Api2d(gptConfig.key, gptConfig.endpoint, gptConfig.timeout * 1000)
    const body = {
      model: 'gpt-3.5-turbo',
      messages,
      temperature: gptConfig.temperature,
      n: 1,
      stream: false,
    }
    // log.info('body:', JSON.stringify(body))
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
    return {}
  }
}

export {
  gpt,
}
