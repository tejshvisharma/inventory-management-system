export default class ApiResponse {
  constructor(statusCode, data = {}, message = "Success") {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }
}
