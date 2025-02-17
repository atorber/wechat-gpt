/* eslint-disable sort-keys */
import { log } from 'wechaty'
import path from 'path'
import fs from 'fs'
import { CONFIG } from '../config.js'

export const ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJndWFyZCI6ImFwaSIsImlzcyI6ImltLndlYiIsImV4cCI6MTcyMTA3MDkwNCwiaWF0IjoxNjg1MDcwOTA0LCJqdGkiOiIyMDU0In0.-Mk4a20gur-QPxlYjgYc_eHWpWkDURJTawO0yBQ_b2g'
export type LoginRequest = {
  mobile: string;
  password: string;
  platform: string;
};

export type LoginResponse = {
  code: number;
  message: string;
  data: {
    access_token: string;
    expires_in: number;
    type: string;
  };
};
export async function authenticateUser (mobile: string, password: string) {

  if ((mobile === '18798272054' || mobile === '18798272055') && password === 'admin123') {
    return ACCESS_TOKEN
  } else {
    return false
  }

}

export function validateToken (token: string) {
  console.info('token:', token)
  if (token === ACCESS_TOKEN) {
    return true
  } else {
    return false
  }
}

export default class FileService {

  hello = () => {
    return new Promise(resolve => resolve('hello world,' + new Date().toLocaleString()))
  }

  uploadImage = (ctx: any) => {
    console.info('ctx.request:', ctx.request.files)
    const rootDir = CONFIG.ROOT_DIR
    try {
      const file = ctx.request.files.file
      if (!file) {
        ctx.throw(400, 'No file uploaded!')
      }
      log.info('file:', file)
      log.info('file:', JSON.stringify(file))
      const fileJson: any = JSON.parse(JSON.stringify(file))
      const fileExt = path.extname(fileJson.originalFilename).toLowerCase()
      if (![ '.jpg', '.jpeg', '.png', '.gif' ].includes(fileExt)) {
        ctx.throw(400, 'Only image files are allowed!')
      }

      const newFilename = `${Date.now()}${fileExt}`
      const newFilePath = path.join(rootDir, 'public/uploads', newFilename)

      const reader = fs.createReadStream(fileJson.filepath)
      const writer = fs.createWriteStream(newFilePath)
      reader.pipe(writer)
      log.info('uploading %s -> %s', file.name, writer.path)

      const response = {
        code: 200,
        message: 'success',
        data: {
          src: `${CONFIG.BASE_URL}/uploads/${newFilename}`,
        },
      }
      ctx.set('Content-Type', 'application/json; charset=utf-8')
      ctx.body = response
    } catch (err) {
      log.error('上传图片失败...', err)
      ctx.throw(400, '上传图片失败...')
    }
    return ctx
  }

}
