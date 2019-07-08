import _ from 'lodash';
import natural from 'natural';

/**
 * Gets all potential matches, from array of input tokens
 * 'autocomplete' is a prepopulated redis hash map
 */
export function getMatches(
  { redis, tokens, limit, scope, ontology },
  callback
) {
  const namespaceRE = new RegExp(`^${ontology}:`);

  redis
    .multi(tokens.map(tok => ['HGET', 'autocomplete', tok]))
    .exec((err, results) => {
      if (err) return callback(err);

      let idSets = results.map(matchList => {
        const matchListFiltered = (JSON.parse(matchList) || []).filter(match =>
          namespaceRE.test(match[0])
        );
        return new Set(matchListFiltered.map(match => match[0]));
      });

      let allMatchesScores = new Map();
      let allMatchesSpans = new Map();

      results.forEach((matchList, i) => {
        const matchListFiltered = (JSON.parse(matchList) || []).filter(match =>
          namespaceRE.test(match[0])
        );

        let matchspan = tokens[i];

        matchListFiltered.forEach(match => {
          let id = match[0];
          let score = match[1];

          if (allMatchesScores.has(id)) {
            allMatchesScores.set(id, Math.max(allMatchesScores.get(id), score));
          } else {
            allMatchesScores.set(id, score);
          }

          if (allMatchesSpans.has(id)) {
            allMatchesSpans.get(id).push(matchspan);
          } else {
            allMatchesSpans.set(id, [matchspan]);
          }
        });
      });

      for (let id of allMatchesScores.keys()) {
        let intersections = idSets
          .map(idSet => idSet.has(id))
          .reduce((x, y) => x + y);
        if (intersections > 1) {
          allMatchesScores.set(
            id,
            Math.pow(allMatchesScores.get(id), intersections)
          );
        }
      }

      const resultsObj = {
        redis,
        allMatchesScores,
        allMatchesSpans,
        limit,
        scope,
        ontology
      };
      return callback(null, resultsObj);
    });
}

/**
 * Limit with scope, if present
 */
export function limitScope(
  { redis, allMatchesScores, allMatchesSpans, limit, scope, ontology },
  callback
) {
  if (!scope) {
    // if no scope, all entries are "descendants"
    let isDescendant = Array(allMatchesScores.size).fill(true);
    const resultsObj = {
      redis,
      isDescendant,
      allMatchesScores,
      allMatchesSpans,
      limit,
      ontology
    };
    return callback(null, resultsObj);
  }

  redis.hget('treeNums', scope, (err, scopeTreeNums) => {
    if (err) return callback(err);
    if (!scopeTreeNums) {
      // if scope tree nums unavailable, all entries are "descendants"
      let isDescendant = Array(allMatchesScores.size).fill(true);
      const resultsObj = {
        redis,
        isDescendant,
        allMatchesScores,
        allMatchesSpans,
        limit,
        ontology
      };
      return callback(null, resultsObj);
    }

    scopeTreeNums = JSON.parse(scopeTreeNums) || [];
    let matchIds = Array.from(allMatchesScores.keys());

    redis
      .multi(matchIds.map(id => ['HGET', 'treeNums', id]))
      .exec((err, results) => {
        if (err) return callback(err);

        let isDescendant = results.map(treeNums => {
          if (!treeNums) return false;
          treeNums = JSON.parse(treeNums) || [];
          return treeNums.some(tn => {
            return scopeTreeNums.some(scopeTN => tn.startsWith(scopeTN + '.'));
          });
        });

        const resultsObj = {
          redis,
          isDescendant,
          allMatchesScores,
          allMatchesSpans,
          limit,
          ontology
        };
        return callback(null, resultsObj);
      });
  });
}

/**
 * Boost scores based on reverse tree depth, then sort matches based on boosted scores
 * 'treeDepth' is a prepopulated redis hash map
 */
export function sortWithBoostScores(
  { redis, isDescendant, allMatchesScores, allMatchesSpans, limit, ontology },
  callback
) {
  // mean tree depth
  let meanDepth = 1;
  if (ontology === 'mesh') meanDepth = 5.1489;
  else if (ontology === 'subjects') meanDepth = 2.9216;

  let matchIds = Array.from(allMatchesScores.keys());
  let matchScores = Array.from(allMatchesScores.values());

  matchIds = matchIds.filter((id, i) => isDescendant[i]);
  matchScores = matchScores.filter((id, i) => isDescendant[i]);

  if (matchIds.length === 0) return callback(new Error('EMPTY_MATCH_LIST'));

  redis.hmget('treeDepth', matchIds, (err, depths) => {
    if (err) return callback(err);

    let scoresBoosted = matchIds.map((matchId, i) => {
      // use mean depth if depth info not available
      let depth = parseFloat(depths[i]) || meanDepth;
      return Math.round(matchScores[i] / Math.sqrt(depth));
    });

    let sortedMatches = _.sortBy(
      _.zip(matchIds, scoresBoosted),
      pair => pair[1]
    ).reverse();
    let sortedMatchesLimit = sortedMatches.slice(0, limit);

    let sortedMatchIdsLimit = sortedMatchesLimit.map(x => x[0]);
    let sortedMatchScoresLimit = sortedMatchesLimit.map(x => x[1]);
    let sortedMatchSpansLimit = sortedMatchIdsLimit.map(id =>
      _.uniq(allMatchesSpans.get(id))
    );

    const resultsObj = {
      redis,
      sortedMatchIdsLimit,
      sortedMatchScoresLimit,
      sortedMatchSpansLimit
    };
    return callback(null, resultsObj);
  });
}

/**
 * Create results array
 */
export function createResultsList(
  { redis, sortedMatchIdsLimit, sortedMatchScoresLimit, sortedMatchSpansLimit },
  callback
) {
  let results = sortedMatchIdsLimit.map((id, i) => {
    return {
      '@id': id,
      codingSystem: id.split(':')[0],
      codeValue: id.split(':')[1],
      score: sortedMatchScoresLimit[i],
      fromSearch: true
    };
  });

  const resultsObj = {
    redis,
    sortedMatchIdsLimit,
    sortedMatchSpansLimit,
    results
  };
  return callback(null, resultsObj);
}

/**
 * Add name (preferred term in MeSH) to results object
 * 'prefLabel' is a prepopulated redis hash map
 */
export function addName(
  { redis, sortedMatchIdsLimit, sortedMatchSpansLimit, results },
  callback
) {
  redis.hmget('prefLabel', sortedMatchIdsLimit, (err, prefLabels) => {
    if (err) return callback(err);

    prefLabels.forEach((term, i) => {
      term = JSON.parse(term) || '';
      results[i]['name'] = term;

      let matchRe = new RegExp(
        `\\s(${sortedMatchSpansLimit[i].join('|')})`,
        'ig'
      );
      if (matchRe.test(` ${term}`)) {
        results[i]['matchSpans'] = [
          ` ${term}`.replace(matchRe, ' <span>$1</span>').trim()
        ];
      } else {
        results[i]['matchSpans'] = [];
      }

      return;
    });

    const resultsObj = {
      redis,
      sortedMatchIdsLimit,
      sortedMatchSpansLimit,
      results
    };
    return callback(null, resultsObj);
  });
}

/**
 * Add synonyms to results object
 * 'synonyms' is a prepopulated redis hash map
 */
export function addSynonyms(
  { redis, sortedMatchIdsLimit, sortedMatchSpansLimit, results },
  callback
) {
  redis.hmget('synonyms', sortedMatchIdsLimit, (err, listOfSynonyms) => {
    if (err) return callback(err);

    listOfSynonyms.forEach((synonyms, i) => {
      synonyms = JSON.parse(synonyms) || [];
      results[i]['synonyms'] = synonyms;

      let matchRe = new RegExp(
        `\\s(${sortedMatchSpansLimit[i].join('|')})`,
        'ig'
      );
      synonyms.forEach(syn => {
        if (matchRe.test(` ${syn}`)) {
          results[i]['matchSpans'].push(
            ` ${syn}`.replace(matchRe, ' <span>$1</span>').trim()
          );
        }
      });

      return;
    });

    const resultsObj = { redis, sortedMatchIdsLimit, results };
    return callback(null, resultsObj);
  });
}

/**
 * Add description / scope notes
 * 'description' is a prepopulated redis hash map
 */
export function addDescriptions(
  { redis, sortedMatchIdsLimit, results },
  callback
) {
  redis.hmget('description', sortedMatchIdsLimit, (err, descriptions) => {
    if (err) return callback(err);

    descriptions.forEach((desc, i) => {
      desc = JSON.parse(desc) || '';
      results[i]['description'] = desc;
      return;
    });

    const resultsObj = { redis, sortedMatchIdsLimit, results };
    return callback(null, resultsObj);
  });
}

/**
 * addBroadestConceptProp
 * 'parents' is a prepopulated redis hash map
 */
export function addBroadestConceptProp(
  { redis, sortedMatchIdsLimit, results },
  callback
) {
  redis.hmget('parents', sortedMatchIdsLimit, (err, parentsLists) => {
    if (err) return callback(err);

    parentsLists.forEach((parents, i) => {
      parents = JSON.parse(parents) || [];
      results[i]['broadestConcept'] = !parents || !parents.length;
      return;
    });

    const resultsObj = { redis, sortedMatchIdsLimit, results };
    return callback(null, resultsObj);
  });
}

/**
 * addMostSpecificConceptProp
 * 'children' is a prepopulated redis hash map
 */
export function addMostSpecificConceptProp(
  { redis, sortedMatchIdsLimit, results },
  callback
) {
  redis.hmget('children', sortedMatchIdsLimit, (err, childrenLists) => {
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

/**
 * Filters match spans so that only the most representative term/synonym matches are included
 */
export function filterMatchSpans({ redis, results }, callback) {
  const topK = 3;

  results.forEach((result, idx) => {
    let matchSpans = result['matchSpans'];
    if (matchSpans.length < 2) return;

    let pairwise = new Map();
    let filtered = new Set(matchSpans);

    // pairwise Jaro-Winkler distances
    let terms = matchSpans.map(t => t.replace(/<\/?span>/g, ''));
    matchSpans.forEach((match, i) => {
      let t1 = terms[i];
      for (let j = i + 1; j < terms.length; j++) {
        let t2 = terms[j];
        let dist = natural.JaroWinklerDistance(t1, t2);

        let pair = [matchSpans[i], matchSpans[j]];
        if (dist > 0.9) {
          let idxKeep = terms[i].length < terms[j].length ? 0 : 1;
          filtered.add(pair[idxKeep]);
          filtered.delete(pair[+!idxKeep]);
        }
        pairwise.set(pair, dist);
      }
    });

    // create set of samples from topK most divergent pairwise distances
    let matchSpansRep = _([...pairwise])
      .sort((pair1, pair2) => pair1[1] > pair2[1])
      .map(pair => pair[0])
      .slice(0, topK)
      .flatten()
      .uniq()
      .value();

    matchSpansRep = matchSpansRep.filter(x => filtered.has(x));
    results[idx]['matchSpans'] = matchSpansRep;
  });

  const resultsObj = { redis, results };
  return callback(null, resultsObj);
}
