import http from 'http';
import assert from 'assert';
import ontologist from '../src';
import { client, portHttp } from './utils/config';

describe('Routes - autocomplete', function() {
  this.timeout(30000);

  const expectedProps = [
    '@id',
    'codingSystem',
    'codeValue',
    'score',
    'name',
    'matchSpans',
    'synonyms',
    'description',
    'mostSpecificConcept',
    'broadestConcept'
  ];

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

    it('should give decent ranked results', done => {
      client(
        {
          url: '/autocomplete',
          qs: {
            q: 'cancer',
            limit: 10,
            ontology: ontology
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);

          assert.equal(resp.statusCode, 200);
          assert.equal(results.length, 10);
          assert.equal(results[0].name, 'Cancer');
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should handle bad input', done => {
      client(
        {
          url: '/autocomplete',
          qs: {
            q: 'fapkegekhaweg',
            limit: 10,
            ontology: ontology
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          assert.equal(results.length, 0);
          done();
        }
      );
    });

    it('should allow results limit through query string', done => {
      client(
        {
          url: '/autocomplete',
          qs: {
            q: 'cancer',
            limit: 50,
            ontology: ontology
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          assert.equal(results.length, 50);
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should handle multiword queries', done => {
      client(
        {
          url: '/autocomplete',
          qs: {
            q: 'cancer pancreas',
            limit: 10,
            ontology: ontology
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          assert.equal(results[0].name, 'Pancreatic cancer');
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should limit scope if defined', done => {
      const scope = 'subjects:pancreatic-disease';
      client(
        {
          url: '/autocomplete',
          qs: {
            q: 'cancer',
            limit: 10,
            ontology: ontology,
            scope: scope
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          // scoped by subjects:pancreatic-disease
          const expectedConcepts = ['Pancreatic cancer'];
          results.forEach(x => assert.notEqual(x.name, 'Cancer'));
          results.forEach(x => assert.notEqual(x.name, 'Pancreatic disease'));
          assert.deepEqual(results.map(x => x.name), expectedConcepts);
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should allow prepopulating for scoped autocompletes', done => {
      client(
        {
          url: '/autocomplete/prepopulate',
          qs: {
            limit: 10,
            ontology: ontology,
            scope: 'subjects:pancreatic-disease'
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          assert(results.some(subj => subj.name === 'Pancreatitis'));
          assert(results.some(subj => subj.name === 'Pancreatic cancer'));
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should allow getting parents', done => {
      client(
        {
          url: '/autocomplete/prepopulate',
          qs: {
            limit: 10,
            ontology: ontology,
            scope: 'subjects:pancreatitis',
            parents: true
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);
          assert(results.some(subj => subj.name === 'Pancreatic disease'));
          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });

    it('should get top-level subjects when scope is not specified', done => {
      client(
        {
          url: '/autocomplete/prepopulate',
          qs: {
            ontology: ontology
          },
          json: true
        },
        (err, resp, results) => {
          if (err) return done(err);
          assert.equal(resp.statusCode, 200);

          const expectedResults = [
            'earth-and-environmental-sciences',
            'physical-sciences',
            'humanities',
            'scientific-community-and-society',
            'business-and-commerce',
            'social-science',
            'health-sciences',
            'biological-sciences'
          ]
            .sort()
            .map(id => `subjects:${id}`);

          assert.deepEqual(
            results.map(subj => subj['@id']).sort(),
            expectedResults
          );

          results.forEach(res => expectedProps.forEach(k => assert(k in res)));
          done();
        }
      );
    });
  });
});
