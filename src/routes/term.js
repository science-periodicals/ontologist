import { Router } from 'express';
import bodyParser from 'body-parser';
import getMetadata from '../lib/get-metadata';
import createError from '@scipe/create-error';
import asyncMap from 'async/map';

import NAMESPACES from '../namespaces';

const jsonParser = bodyParser.json();
const router = new Router();

router.post('/', jsonParser, (req, res, next) => {
  if (!Array.isArray(req.body)) {
    return next(createError(400, 'Bad request'));
  }

  const { redis } = req.app.locals;

  asyncMap(
    Object.keys(NAMESPACES),
    (ontology, cb) => {
      const nsIds = req.body.filter(uri => uri.startsWith(`${ontology}:`));
      if (nsIds.length) {
        getMetadata(
          {
            redis,
            nsIds,
            ontology
          },
          cb
        );
      } else {
        cb(null);
      }
    },
    (err, metadataMaps) => {
      if (err) return next(err);

      const body = metadataMaps
        .filter(metadataMap => metadataMap)
        .reduce((body, metadataMap) => {
          for (let [key, value] of metadataMap) {
            body[key] = value;
          }
          return body;
        }, {});

      res.json(body);
    }
  );
});

export default router;
