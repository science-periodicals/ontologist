import request from 'request';
import util from 'util';

export const host = process.env.HOST || '127.0.0.1';
export const portHttp = process.env.PORT_HTTP || 3084;
export const client = request.defaults({
  baseUrl: 'http://' + host + ':' + portHttp + '/ontologist'
});
