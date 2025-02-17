import TalkService from '../service/talk-service.js'

class TalkController {

  private service: TalkService = new TalkService()

  sendMessage = async (ctx: { body: any }) => {
    ctx.body = await this.service.sendMessage(ctx)
  }

  sendFile = async (ctx: { body: any }) => {
    ctx.body = await this.service.sendFile(ctx)
  }

}

export default new TalkController()
