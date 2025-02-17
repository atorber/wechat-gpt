import ContactService from '../service/contact-service.js'

class ContactController {

  private service: ContactService = new ContactService()

  getUnreadNum = async (ctx: { body: any }) => {
    ctx.body = await this.service.getUnreadNum(ctx)
  }

}

export default new ContactController()
