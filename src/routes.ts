/* eslint-disable sort-keys */
import homeController from './controller/home-controller.js'
import userController from './controller/user-controller.js'

export interface Route {
    path: string;
    method: string;
    action: Function;
  }

export const AppRoutes: Route[] = [
  {
    path: '/',
    method: 'get',
    action: homeController.hello,
  },
  {
    path: '/hello',
    method: 'get',
    action: homeController.hello,
  },
  {
    path: '/api/v1/auth/login',
    method: 'post',
    action: userController.login,
  },
]
