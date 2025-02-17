import FileService from '../service/file-service.js'

class FileController {

  private service: FileService = new FileService()

  uploadImage = async (ctx: { body: any }) => {
    ctx.body = await this.service.uploadImage(ctx)
  }

}

export default new FileController()
