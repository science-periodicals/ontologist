export default function getMetadata(paramsObj, callback) {
  const { redis, nsIds } = paramsObj;

  redis
    .multi([
      ['HMGET', 'prefLabel', nsIds],
      ['HMGET', 'synonyms', nsIds],
      ['HMGET', 'description', nsIds],
      ['HMGET', 'parents', nsIds],
      ['HMGET', 'children', nsIds]
    ])
    .exec((err, resp) => {
      if (err) return callback(err);

      const [
        prefLabelList,
        synonymsList,
        descriptionList,
        parentsList,
        childrenList
      ] = resp;

      let metadataMap = new Map();
      nsIds.forEach((nsId, i) => {
        const parents = JSON.parse(parentsList[i]);
        const children = JSON.parse(childrenList[i]);
        metadataMap.set(nsId, {
          '@id': nsId,
          codingSystem: nsId.split(':')[0],
          codeValue: nsId.split(':')[1],
          name: JSON.parse(prefLabelList[i]) || '',
          synonyms: JSON.parse(synonymsList[i]) || '',
          description: JSON.parse(descriptionList[i]) || '',
          broadestConcept: !parents || !parents.length,
          mostSpecificConcept: !children || !children.length
        });
      });

      return callback(null, metadataMap);
    });
}
