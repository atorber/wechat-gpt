/**
 * Author: Huan LI https://github.com/huan
 * Date: Apr 2020
 */
/* eslint-disable sort-keys */
import {
  Wechaty,
  WechatyPlugin,
  // Message,
  log,
  types,
}                   from 'wechaty'

function isMatch (message:any) {
  if (message) {
    return true
  } else {
    return true
  }
}

function OperationManagement (config: any): WechatyPlugin {
  log.verbose('DingDong', 'DingDong(%s)',
    typeof config === 'undefined' ? ''
      : typeof config === 'function' ? 'function'
        : JSON.stringify(config),
  )

  return function DingDongPlugin (wechaty: Wechaty) {
    log.verbose('DingDong', 'installing on %s ...', wechaty)

    wechaty.on('message', async message => {
      if (message.type() !== types.Message.Text) {
        return
      }

      if (!await isMatch(message)) {
        return
      }

      await message.say(message)
    })
  }

}

export {
  OperationManagement,
}
