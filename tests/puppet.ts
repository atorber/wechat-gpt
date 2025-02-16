import { WechatferryPuppet } from '@atorber/puppet'
import { WechatyBuilder } from 'wechaty'
import { useLogger } from '@atorber/logger'

const logger = useLogger('puppet-example')

const puppet = new WechatferryPuppet()
const bot = WechatyBuilder.build({ puppet: puppet as unknown as any })

bot.on('message', async (msg) => {
  logger.info(JSON.stringify(msg, null, 2))
  if (msg.text() === 'ding') { // 将逻辑表达式改为条件语句
    msg.say('dong')
  }
  if (msg.text() === 'CALL_SQLAPI') {
    const start = Date.now()
    const db = 'MSG0.db'
    const sql = 'select * from MSG WHERE StrTalker = \"ledongmao\" ORDER BY CreateTime DESC LIMIT 10;'
    const payload = { db, sql }
    const method = 'dbSqlQuery'
    const text = JSON.stringify({ payload, method })
    try {
      const result = await bot.puppet.messageSendText('@agent', text)
      logger.info(result)
    } catch (error) {
      logger.error(error)
    }
    const end = Date.now()
    logger.info(`查询时间：${end - start}ms`)
    msg.say(`查询时间：${end - start}ms`)
  }

  if (msg.text() === 'ALL_CONTACT') {
    const start = Date.now()
    const contactList = await bot.Contact.findAll()
    const end = Date.now()
    logger.info(JSON.stringify(contactList, null, 2))
    logger.info(`共有${contactList.length}个联系人，查询时间：${end - start}ms`)
    msg.say(`共有${contactList.length}个联系人，查询时间：${end - start}ms`)
  }

  if (msg.text() === 'ALL_ROOM') {
    const start = Date.now()
    const roomList = await bot.Room.findAll()
    const end = Date.now()
    logger.info(`共有${roomList.length}个群，查询时间：${end - start}ms`)
    msg.say(`共有${roomList.length}个群，查询时间：${end - start}ms`)
  }
})
  .start()
  .then(() => logger.info('Bot started'))
  .catch(console.error)
