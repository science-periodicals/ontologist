import { uniqWith, isEqual } from 'lodash';

export default function pairsToTree(pairs) {
  // recursive function for clustering
  function treeCluster(relationsList = [], parent, tree) {
    if (typeof tree === 'undefined') {
      tree = [];
    }
    if (typeof parent === 'undefined') {
      parent = { '@id': null, parent: null };
    }

    let children = relationsList.filter(child => {
      return child.parent === parent['@id'];
    });

    if (children.length) {
      if (parent['@id'] === null) {
        tree = children;
      } else {
        parent['children'] = children;
      }

      children.forEach(child => {
        treeCluster(relationsList, child);
      });
    }

    return tree;
  }

  return treeCluster(uniqWith(pairs, isEqual));
}
