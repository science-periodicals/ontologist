import express from 'express';
import termRoutes from './routes/term';
import subtreeRoutes from './routes/subtree';
import autocompleteRoutes from './routes/autocomplete';
import { createRedisClient } from '@scipe/librarian';

export default function ontologist(config = {}) {
  var app = express();

  app.enable('case sensitive routing');

  app.locals.redis = createRedisClient(config, { prefix: 'ontologist:' });

  app.use('/ontologist/term', termRoutes);
  app.use('/ontologist/subtree', subtreeRoutes);
  app.use('/ontologist/autocomplete', autocompleteRoutes);

  return app;
}
