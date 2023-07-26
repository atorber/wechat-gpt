import HomeService from '../service/home-service.js'

class HomeController {

  private service: HomeService = new HomeService()

  hello = async (ctx: { body: any }) => {
    ctx.body = await this.service.hello()
  }

}

export default new HomeController()
