/* eslint-disable sort-keys */
export default class ContactService {

  hello = () => {
    return new Promise(resolve => resolve('hello world,' + new Date().toLocaleString()))
  }

  getUnreadNum = async (ctx: any) => {
    const response = { code: 200, message: 'success', data: { unread_num: 0 } }
    ctx.set('Content-Type', 'application/json; charset=utf-8')
    ctx.body = response
    return ctx
  }

}
