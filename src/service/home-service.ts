export default class HomeService {

  hello = () => {
    return new Promise(resolve => resolve('hello world,' + new Date().toLocaleString()))
  }

}
