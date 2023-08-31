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
export async function authenticateUser (mobile:string, password:string) {

  if (mobile === '18798272054' && password === 'admin123') {
    return true
  } else {
    return false
  }

}

export function validateToken (token: string) {
  if (token === ACCESS_TOKEN) {
    return true
  } else {
    return false
  }
}

export default class UserService {

  hello = () => {
    return new Promise(resolve => resolve('hello world,' + new Date().toLocaleString()))
  }

  login = async (ctx: { request: { body: LoginRequest; }; body: { code: number; message: string; data: { access_token: string; expires_in: number; type: string; } | {}; }; }) => {
    const requestBody: LoginRequest = ctx.request.body
    const {
      mobile,
      password,
      // platform,
    } = requestBody

    // Check credentials and generate access token
    // 假设存在一个根据手机号和密码验证用户的异步函数 authenticateUser
    const isAuthenticated = await authenticateUser(mobile, password)

    if (isAuthenticated) {
      const response: LoginResponse = {
        code: 200,
        data: {
          access_token: ACCESS_TOKEN,
          expires_in: 36000000,
          type: 'Bearer',
        },
        message: 'success',
      }
      ctx.body = response
    } else {
      const response = {
        code: 401,
        data: {},
        message: 'Invalid credentials',
      }
      ctx.body = response
    }
  }

}
