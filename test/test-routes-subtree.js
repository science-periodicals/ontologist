import http from 'http';
import assert from 'assert';
import ontologist from '../src';
import { client, portHttp } from './utils/config';

describe('Routes - subtree', function() {
  this.timeout(30000);

  let server;
  before(done => {
    const app = ontologist();
    server = http.createServer(app);
    server.listen(portHttp, done);
  });

  after(done => {
    server.close(done);
  });

  describe('NPG subjects ontology', () => {
    const ontology = 'subjects';

    it('should give valid subtrees', done => {
      client.post(
        {
          url: `/subtree/${ontology}`,
          json: [
            {
              ids: [
                'pancreatitis',
                'pancreas',
                'pancreatic-disease',
                'pancreatic-cancer',
                'gastrointestinal-cancer'
              ].map(id => `subjects:${id}`)
            }
          ]
        },
        (err, resp, body) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);

          assert.deepEqual(body[0], [
            {
              '@id': 'subjects:gastrointestinal-cancer',
              parent: null,
              mostSpecificConcept: false,
              children: [
                {
                  '@id': 'subjects:pancreatic-cancer',
                  parent: 'subjects:gastrointestinal-cancer',
                  mostSpecificConcept: true
                }
              ]
            },
            {
              '@id': 'subjects:pancreas',
              parent: null,
              mostSpecificConcept: true
            },
            {
              '@id': 'subjects:pancreatic-disease',
              parent: null,
              mostSpecificConcept: false,
              children: [
                {
                  '@id': 'subjects:pancreatic-cancer',
                  parent: 'subjects:pancreatic-disease',
                  mostSpecificConcept: true
                },
                {
                  '@id': 'subjects:pancreatitis',
                  parent: 'subjects:pancreatic-disease',
                  mostSpecificConcept: false
                }
              ]
            }
          ]);

          // top nodes should have no parents
          body[0].forEach(x => assert.strictEqual(x['parent'], null));
          // children nodes should have parent defined
          body[0].filter(x => 'children' in x).forEach(x => {
            x['children'].forEach(y =>
              assert.notStrictEqual(y['parent'], null)
            );
          });
          done();
        }
      );
    });

    it('should give valid subtrees with dedup option flag', done => {
      client.post(
        {
          url: `/subtree/${ontology}`,
          json: [
            {
              ids: [
                'pancreatitis',
                'pancreas',
                'pancreatic-disease',
                'pancreatic-cancer',
                'gastrointestinal-cancer'
              ].map(id => `subjects:${id}`),
              options: {
                dedup: true
              }
            }
          ]
        },
        (err, resp, body) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);

          // Note that pancreatic-cancer is a child of both pancreatic-disease and gastrointestinal-cancer within the ontology.
          // With { dedup: true }, pancreatic-cancer is separated out as its own root element.

          assert.deepEqual(body[0], [
            {
              '@id': 'subjects:gastrointestinal-cancer',
              parent: null,
              mostSpecificConcept: false
            },
            {
              '@id': 'subjects:pancreas',
              parent: null,
              mostSpecificConcept: true
            },
            {
              '@id': 'subjects:pancreatic-cancer',
              parent: null,
              mostSpecificConcept: true
            },
            {
              '@id': 'subjects:pancreatic-disease',
              parent: null,
              mostSpecificConcept: false,
              children: [
                {
                  '@id': 'subjects:pancreatitis',
                  parent: 'subjects:pancreatic-disease',
                  mostSpecificConcept: false
                }
              ]
            }
          ]);

          // top nodes should have no parents
          body[0].forEach(x => assert.strictEqual(x['parent'], null));
          // children nodes should have parent defined
          body[0].filter(x => 'children' in x).forEach(x => {
            x['children'].forEach(y =>
              assert.notStrictEqual(y['parent'], null)
            );
          });
          done();
        }
      );
    });

    it('should give embedded metadata with embed flag', done => {
      client.post(
        {
          url: `/subtree/${ontology}`,
          json: [
            {
              ids: [
                'pancreatitis',
                'pancreas',
                'pancreatic-disease',
                'pancreatic-cancer',
                'gastrointestinal-cancer'
              ].map(id => `subjects:${id}`),
              options: {
                dedup: false,
                embed: true
              }
            }
          ]
        },
        (err, resp, body) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);

          body[0].forEach(node => {
            (function checkProps(root) {
              const expectedProps = [
                '@id',
                'codingSystem',
                'codeValue',
                'name',
                'synonyms',
                'description',
                'broadestConcept',
                'mostSpecificConcept'
              ];
              expectedProps.forEach(k => assert(k in root));
              if (root.children && root.children.length) {
                root.children.forEach(node => checkProps(node));
              }
            })(node);
          });
          done();
        }
      );
    });
  });
});
