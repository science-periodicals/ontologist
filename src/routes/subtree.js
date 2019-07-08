import asyncMap from 'async/map';
import { Router } from 'express';
import bodyParser from 'body-parser';
import pairsToTree from '../lib/pairs-to-tree';
import getMetadata from '../lib/get-metadata';
import { uniq } from 'lodash';

const jsonParser = bodyParser.json();
const urlEncodedParser = bodyParser.urlencoded({ extended: true });

const router = new Router();

router.get('/:ontology', (req, res) => {
  const ontology = req.params.ontology.toLowerCase();
  let msg = '';
  if (ontology === 'mesh') {
    msg = 'Medical Subject Headings (MeSH)';
  } else if (ontology === 'subjects') {
    msg = 'Nature Publishing Group subjects ontology';
  }
  res.status(200).send(msg);
});

router.post('/:ontology', jsonParser, urlEncodedParser, (req, res) => {
  const ontology = req.params.ontology.toLowerCase();
  const { redis } = req.app.locals;

  function getSubtrees(nsIds, options = {}, callback) {
    const key = nsIds.sort().toString();

    // { dedup: true } prevents duplication of nodes with multiple parents
    // { embed: true } adds in metadata with `@id`s
    const { dedup, embed } = options;

    redis.hexists(`${ontology}:subtree`, key, (err, exists) => {
      if (err) return callback(err);
      if (exists) {
        redis.hget(`${ontology}:subtree`, key, (err, subtree) => {
          if (err) return callback(err);
          return callback(null, JSON.parse(subtree));
        });
      } else {
        redis
          .multi([
            ['HMGET', 'treeNums'].concat(nsIds),
            ['HMGET', 'children'].concat(nsIds)
          ])
          .exec((err, results) => {
            if (err) return callback(err);

            const [treeNumsArray, childrenArray] = results;

            let treeNumsMap = new Map();
            let childrenMap = new Map();
            for (let i = 0; i < nsIds.length; i++) {
              treeNumsMap.set(nsIds[i], JSON.parse(treeNumsArray[i]));
              childrenMap.set(nsIds[i], JSON.parse(childrenArray[i]));
            }

            let pairs = [];
            for (let i = 0; i < nsIds.length; i++) {
              const noChildren = !childrenMap.get(nsIds[i]);
              let parents = [];
              (treeNumsMap.get(nsIds[i]) || []).forEach(treeNum => {
                const lineage = treeNum
                  .split('.')
                  .map(id => `${ontology}:` + id)
                  .slice(0, -1);
                for (let i = lineage.length - 1; i >= 0; i--) {
                  if (~nsIds.indexOf(lineage[i])) {
                    parents.push(lineage[i]);
                    break;
                  }
                }
              });

              parents = uniq(parents);
              if (parents.length === 0 || (parents.length > 1 && dedup)) {
                pairs.push({
                  '@id': nsIds[i],
                  parent: null,
                  mostSpecificConcept: noChildren
                });
              } else {
                parents.forEach(parent => {
                  pairs.push({
                    '@id': nsIds[i],
                    parent: parent,
                    mostSpecificConcept: noChildren
                  });
                });
              }
            }

            if (embed) {
              getMetadata({ redis, nsIds, ontology }, (err, metadataMap) => {
                if (err) return callback(err);
                pairs.forEach(pair => {
                  Object.assign(pair, metadataMap.get(pair['@id']));
                });
                callback(null, pairsToTree(pairs));
              });
            } else {
              callback(null, pairsToTree(pairs));
            }
          });
      }
    });
  }

  asyncMap(
    req.body,
    (data, callback) => {
      const { ids, options } = data;
      getSubtrees(ids, options, (err, result) => {
        if (err) return callback(null, null);
        return callback(null, result);
      });
    },
    (err, results) => {
      if (err) return res.status(500).send(err);
      return res.json(results);
    }
  );
});

export default router;
