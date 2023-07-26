import UserService from '../service/user-service.js'

class UserController {

  private service: UserService = new UserService()

  hello = async (ctx: { body: any }) => {
    ctx.body = await this.service.hello()
  }

  login = async (ctx: any) => {
    ctx.body = await this.service.login(ctx)
  }

}

export default new UserController()
