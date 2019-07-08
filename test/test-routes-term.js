import http from 'http';
import assert from 'assert';
import ontologist from '../src';
import { client, portHttp } from './utils/config';

describe('Routes - term', function() {
  this.timeout(30000);

  let server;
  before(done => {
    const app = ontologist();
    server = http.createServer(app);
    server.listen(portHttp, done);
  });

  it('should return the metadata for a list of URIs', done => {
    const curis = ['pancreatitis', 'pancreas'].map(id => `subjects:${id}`);

    client.post(
      {
        url: '/term',
        json: curis
      },
      (err, resp, body) => {
        curis.forEach(curi => {
          assert(body[curi].description);
        });
        done();
      }
    );
  });

  after(done => {
    server.close(done);
  });
});
