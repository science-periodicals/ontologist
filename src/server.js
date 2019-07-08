import ontologist from './';
import {
  createExpressLoggerMiddleware,
  createExpressErrorLoggerMiddleware
} from '@scipe/express-logger';
import http from 'http';
import express from 'express';
import compression from 'compression';

const portHttp = 7777;

const config = {
  log: {
    level:
      process.env['NODE_ENV'] === 'development' ||
      process.env['NODE_ENV'] === 'test'
        ? 'debug'
        : 'info'
  }
};

var app = express();

app.use(createExpressLoggerMiddleware(config));

app.use(compression());

// enable CORS
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept'
  );
  next();
});

app.use(ontologist(config));

app.get('/', (req, res) => {
  res.status(200).send();
});

app.use(createExpressErrorLoggerMiddleware(config));
app.use(function(err, req, res, next) {
  res
    .set('Content-Type', 'application/json')
    .status(err.code || 400)
    .json({ message: err.message || '' });
});

var server = http.createServer(app);
server.listen(portHttp, function() {
  console.log(`listening on port ${portHttp}.`);
});
