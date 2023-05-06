#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
import 'dotenv/config.js'

import {
  Contact,
  Message,
  ScanStatus,
  WechatyBuilder,
  log,
}                  from 'wechaty'

import qrcodeTerminal from 'qrcode-terminal'
import { config } from './config.js'
import { gpt } from './callGpt.js'

log.info('config:', JSON.stringify(config, null, '\t'))

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

function onLogin (user: Contact) {
  log.info('StarterBot', '%s login', user)
}

function onLogout (user: Contact) {
  log.info('StarterBot', '%s logout', user)
}

async function onMessage (msg: Message) {
  log.info('StarterBot', msg.toString())

  const talker = msg.talker()
  const room = msg.room()
  const text = msg.text()

  let rePly:any = {}

  let curId = ''

  if (room) {
    curId = room.id
  } else {
    curId = talker.id
  }

  const curConfig = config[curId]

  if (curConfig) {
    curConfig.historyContext.push({ role: 'user', text })
    rePly = await gpt(curConfig, curConfig.historyContext.slice(curConfig.historyContextNum * (-1)))
    if (rePly['content']) {
      await msg.say(rePly['content'])
      curConfig.historyContext.push(rePly)
      config[curId] = curConfig
    }
  } else {
    await msg.say('当前用户或群未绑定key，请绑定后再开始对话')
  }

  if (msg.text() === 'ding') {
    await msg.say('dong')
  }
}
const bot = WechatyBuilder.build({
  name: 'WechatGPT',
  puppet: 'wechaty-puppet-wechat4u',
  // puppetOptions: {
  //   token: 'xxx',
  // },
})

bot.on('scan',    onScan)
bot.on('login',   onLogin)
bot.on('logout',  onLogout)
bot.on('message', onMessage)

bot.start()
  .then(() => log.info('StarterBot', 'Starter Bot Started.'))
  .catch(e => log.error('StarterBot', e))
