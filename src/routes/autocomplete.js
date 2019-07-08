/**
 * Autocomplete
 *
 * Custom indexing based on weighted character n-grams is performed offline
 * on concepts and their synonyms. We use this strategy to better handle
 * autocomplete queries involving common entities such as chemicals, genes,
 * etc., in addition to regular words. This is saved in a format that can be
 * piped into redis.
 *
 * Current ontologies:
 * - subjects: <http://ns.nature.com/subjects/>
 *
 */

import { Router } from 'express';
import asyncSeq from 'async/seq';
import * as acQuery from '../lib/autocomplete-query';
import * as acPrepopulate from '../lib/autocomplete-prepopulate';

let router = new Router();

/**
 * Autocomplete route
 *
 * query params:
 * {string} q - autocomplete query string
 * {number} limit - restricts maximum number of results
 * {string} scope - restrict results to descendants of concept `@id` (URI) only
 * {string} ontology - restricts to ontology [`subjects`]
 */
router.get('/', (req, res, next) => {
  const { redis } = req.app.locals;

  const tokens = req.query.q
    .split(' ')
    .map(tok => tok.toLowerCase().replace(/[^a-z0-9_-]/gi, ''));
  const limit = parseInt(req.query && req.query.limit) || 100;
  const scope = req.query.scope || null;
  const ontology = req.query.ontology || null;

  const paramsObj = {
    redis,
    tokens,
    limit,
    scope,
    ontology
  };

  asyncSeq(
    acQuery.getMatches,
    acQuery.limitScope,
    acQuery.sortWithBoostScores,
    acQuery.createResultsList,
    acQuery.addName,
    acQuery.addSynonyms,
    acQuery.addDescriptions,
    acQuery.addBroadestConceptProp,
    acQuery.addMostSpecificConceptProp,
    acQuery.filterMatchSpans
  )(paramsObj, (err, resultsObj) => {
    if (err) {
      if (err.message === 'EMPTY_MATCH_LIST') {
        return res.json([]);
      } else {
        return next(err);
      }
    }
    const results = resultsObj.results.filter(x => x['@id'] && x.name);
    return res.json(results);
  });
});

/**
 * Route for prepopulating autocomplete results based on specific concept
 *
 * query params:
 * {number} limit - restricts maximum number of results
 * {string} scope - restrict results to descendants of concept `@id` (URI) only
 * {boolean} parents - [ true | false ] whether to populate based on concept parents (true) or concept children (false)
 * {string} ontology - restricts to ontology [ `subjects`]
 */
router.get('/prepopulate', (req, res, next) => {
  const { redis } = req.app.locals;

  const limit = parseInt(req.query && req.query.limit) || 1000;
  const scope = req.query.scope || null;
  const parents = String(req.query.parents) === 'true';
  const ontology = req.query.ontology || 'subjects';

  // determines which function to start with:
  // - getTopLevel
  // - getParents
  // - getChildren
  let initialFunc = acPrepopulate.getTopLevel;
  if (scope) {
    initialFunc = parents
      ? acPrepopulate.getParents
      : acPrepopulate.getChildren;
  }

  const paramsObj = {
    redis,
    limit,
    scope,
    ontology
  };

  asyncSeq(
    initialFunc,
    acPrepopulate.createResultsList,
    acPrepopulate.addName,
    acPrepopulate.addSynonyms,
    acPrepopulate.addDescriptions,
    acPrepopulate.addBroadestConceptProp,
    acPrepopulate.addMostSpecificConceptProp
  )(paramsObj, (err, resultsObj) => {
    if (err) {
      if (err.message === 'EMPTY_MATCH_LIST') {
        return res.json([]);
      } else {
        return next(err);
      }
    }
    const results = resultsObj.results.filter(x => x['@id'] && x.name);

    return res.json(results);
  });
});

export default router;
