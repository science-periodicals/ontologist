import _ from 'lodash';
import NAMESPACES from '../namespaces';

/**
 * Gets id of all top-level concepts
 */
export function getTopLevel({ redis, limit, ontology }, callback) {
  redis.hget('children', `${ontology}:`, (err, topLevel) => {
    if (err) return callback(err);

    topLevel = _.uniq(JSON.parse(topLevel) || []);
    let sampledIds = topLevel.map(id => `${ontology}:${id}`);

    if (topLevel.length > limit) {
      sampledIds = _.sampleSize(sampledIds, limit);
    }
    if (sampledIds.length === 0) {
      return callback(new Error('EMPTY_MATCH_LIST'));
    }

    const resultsObj = { redis, sampledIds };
    return callback(null, resultsObj);
  });
}

/**
 * Gets id of all parents of scope
 * 'parents' is a prepopulated redis hash map
 */
export function getParents({ redis, limit, scope, ontology }, callback) {
  const [curiePrefix] = (scope || '').split(':');
  const ns = curiePrefix in NAMESPACES ? curiePrefix : ontology;

  redis.hget('parents', scope, (err, parents) => {
    if (err) return callback(err);

    parents = _.uniq(JSON.parse(parents) || []);
    let sampledIds = parents.map(id => `${ns}:${id}`);
    if (parents.length > limit) {
      sampledIds = _.sampleSize(sampledIds, limit);
    }
    if (sampledIds.length === 0) {
      return callback(new Error('EMPTY_MATCH_LIST'));
    }

    const resultsObj = { redis, sampledIds };
    return callback(null, resultsObj);
  });
}

/**
 * Gets id of all children of scope
 * 'children' is a prepopulated redis hash map
 */
export function getChildren({ redis, limit, scope, ontology }, callback) {
  const [curiePrefix] = (scope || '').split(':');
  const ns = curiePrefix in NAMESPACES ? curiePrefix : ontology;

  redis.hget('children', scope, (err, children) => {
    if (err) return callback(err);

    children = _.uniq(JSON.parse(children) || []);
    let sampledIds = children.map(id => `${ns}:${id}`);
    if (children.length > limit) {
      sampledIds = _.sampleSize(sampledIds, limit);
    }
    if (sampledIds.length === 0) {
      return callback(new Error('EMPTY_MATCH_LIST'));
    }

    const resultsObj = { redis, sampledIds };
    return callback(null, resultsObj);
  });
}

/**
 * Create results array
 */
export function createResultsList({ redis, sampledIds }, callback) {
  let results = sampledIds.map((id, i) => {
    let ns = id.split(':')[0];
    let val = id.split(':')[1];
    return {
      '@id': id,
      codingSystem: ns,
      codeValue: val,
      score: 1,
      matchSpans: [],
      fromSearch: false
    };
  });

  const resultsObj = { redis, sampledIds, results };
  return callback(null, resultsObj);
}

/**
 * Add name (preferred term in MeSH) to results object
 * 'prefLabel' is a prepopulated redis hash map
 */
export function addName({ redis, sampledIds, results }, callback) {
  redis.hmget('prefLabel', sampledIds, (err, prefLabels) => {
    if (err) return callback(err);

    prefLabels.forEach((term, i) => {
      term = JSON.parse(term) || '';
      results[i]['name'] = term;
    });

    const resultsObj = { redis, sampledIds, results };
    return callback(null, resultsObj);
  });
}

/**
 * Add synonyms to results object
 * 'synonyms' is a prepopulated redis hash map
 */
export function addSynonyms({ redis, sampledIds, results }, callback) {
  redis.hmget('synonyms', sampledIds, (err, listOfSynonyms) => {
    if (err) return callback(err);

    listOfSynonyms.forEach((synonyms, i) => {
      synonyms = JSON.parse(synonyms) || [];
      results[i]['synonyms'] = synonyms;
    });

    const resultsObj = { redis, sampledIds, results };
    return callback(null, resultsObj);
  });
}

/**
 * Add description / scope notes
 * 'description' is a prepopulated redis hash map
 */
export function addDescriptions({ redis, sampledIds, results }, callback) {
  redis.hmget('description', sampledIds, (err, descriptions) => {
    if (err) return callback(err);

    descriptions.forEach((desc, i) => {
      desc = JSON.parse(desc) || '';
      results[i]['description'] = desc;
      return;
    });

    const resultsObj = { redis, sampledIds, results };
    return callback(null, resultsObj);
  });
}

/**
 * addBroadestConceptProp
 * 'parents' is a prepopulated redis hash map
 */
export function addBroadestConceptProp(
  { redis, sampledIds, results },
  callback
) {
  redis.hmget('parents', sampledIds, (err, parentsLists) => {
    if (err) return callback(err);

    parentsLists.forEach((parents, i) => {
      parents = JSON.parse(parents) || [];
      results[i]['broadestConcept'] = !parents || !parents.length;
      return;
    });

    const resultsObj = { redis, sampledIds, results };
    return callback(null, resultsObj);
  });
}

/**
 * addMostSpecificConceptProp
 * 'children' is a prepopulated redis hash map
 */
export function addMostSpecificConceptProp(
  { redis, sampledIds, results },
  callback
) {
  redis.hmget('children', sampledIds, (err, childrenLists) => {
    if (err) return callback(err);

    childrenLists.forEach((children, i) => {
      children = JSON.parse(children) || [];
      results[i]['mostSpecificConcept'] = !children || !children.length;
      return;
    });

    const resultsObj = { redis, results };
    return callback(null, resultsObj);
  });
}
