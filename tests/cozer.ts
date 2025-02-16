/* eslint-disable sort-keys */
import 'dotenv/config.js'
import { CozeBot, ChatV2Req } from '../src/bot/handlers/coze.js'

const bot = new CozeBot({
  api_key: process.env['COZE_TOKEN'] || '',
  endpoint: process.env['COZE_ENDPOINT'] || '',
  //   bot_id: process.env['BOT_ID'] || '',
  bot_id: '7366137814322724873',
})

const main = async () => {
  const chatReq: ChatV2Req = {
    query: '写一首春天的诗',
    conversation_id: 'test',
    user: 'test',
    history_count: 5,
  }
  const chatResp1 = await bot.chat(chatReq)
  console.info('answer content:', chatResp1.extractAnswer()[0]?.content)
  //   console.info('bot.history', JSON.stringify(bot.history, null, 2))

  chatReq.query = '生成一张海报'
  const chatResp2 = await bot.chat(chatReq)
  //   chatResp2.extractCards()
  const urls = chatResp2.extractImageUrls()
  const url = urls[0]
  console.info('url:', url)
  //   chatResp2.filterAnswer()
  //   const chatResp3 = await bot.chatStream(chatReq)

}

main().then((res) => {
  console.info('done at:', new Date().toISOString())
  return res
}).catch((e) => {
  console.error(e)
})
