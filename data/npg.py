import os
import csv
import pickle
import gzip
import time
import numpy as np
import re
import json
import itertools

import redis
import rdflib
from SPARQLWrapper import SPARQLWrapper, JSON

subjects = 'http://ns.nature.com/subjects/'
dbr = 'http://dbpedia.org/resource/'

NPG_DIR = os.path.abspath('public-npg-domain-ontology')

g_npg_subjects = rdflib.Graph()
g_npg_subjects.parse(os.path.join(NPG_DIR, 'npg-subjects-ontology.ttl'), format='turtle')
g_npg_subjects.parse(os.path.join(NPG_DIR, 'npg-subjects-dbpedia-linkset.ttl'), format='turtle')

for row in g_npg_subjects.query("""
    SELECT DISTINCT ?subject ?dbpediaId
    WHERE {
        ?subject npg:isRoot true .
        ?subject skos:closeMatch ?dbpediaId
    }
"""):
    subjectId, dbpediaId = row
    print(subjectId.toPython(), dbpediaId)


npg_subjects_all = set()
npg_subjects_dbpedia = {}


for row in g_npg_subjects.query("""
    SELECT DISTINCT ?subject
    WHERE {
        ?subject a npg:Subject .
    }
"""):
    subjectURI = row[0].toPython()
    npg_subjects_all.add(subjectURI)



for row in g_npg_subjects.query("""
    SELECT DISTINCT ?subjectId ?dbpediaId
    WHERE {
        ?subjectId skos:closeMatch ?dbpediaId .
        FILTER(REGEX(STR(?dbpediaId), '^NAMESPACE'))
    }
""".replace('NAMESPACE', dbr)):
    subjectId, dbpediaId = row
    subjectURI = subjectId.toPython()
    dbpediaURI = dbpediaId.toPython()
    npg_subjects_dbpedia[subjectURI] = dbpediaURI


print('NPG Subjects:', len(npg_subjects_all))
print('NPG Subjects with DBpedia link:', len(npg_subjects_dbpedia.keys()))

dbpediaSPARQL = SPARQLWrapper("http://dbpedia.org/sparql")

npg_subjects_synonyms = {}

for i, subjectURI in enumerate(npg_subjects_dbpedia.keys()):
    time.sleep(0.05)
    if i % 100 == 0:
        print(i, end='...', flush=True)
    dbpediaURI = npg_subjects_dbpedia[subjectURI]
    dbpediaSPARQL.setQuery("""
        SELECT DISTINCT ?label
        WHERE {
            ?uri dbo:wikiPageRedirects <DBPEDIA_URI> .
            ?uri rdfs:label ?label
            FILTER langMatches(lang(?label), 'en')
        }
    """.replace('DBPEDIA_URI', dbpediaURI))
    dbpediaSPARQL.setReturnFormat(JSON)
    results = dbpediaSPARQL.query().convert()
    npg_subjects_synonyms[subjectURI] = [result['label']['value'] for result in results['results']['bindings']]

npg_subjects_pref_label = {}

for i, subjectURI in enumerate(npg_subjects_all):
    if i % 100 == 0:
        print(i, end='...', flush=True)
    for row in g_npg_subjects.query("""
        SELECT ?label
        WHERE {
            <SUBJECT_URI> skos:prefLabel ?label .
            FILTER langMatches(lang(?label), 'en')
        }
        LIMIT 1
    """.replace('SUBJECT_URI', subjectURI)):
        npg_subjects_pref_label[subjectURI] = row[0].toPython()


npg_subjects_all_terms = {}

for subjectURI in npg_subjects_all:
    try:
        pref_label = npg_subjects_pref_label[subjectURI]
    except:
        continue
    try:
        synonyms = npg_subjects_synonyms[subjectURI]
    except:
        synonyms = []
    npg_subjects_all_terms[subjectURI] = [pref_label] + synonyms


npg_subjects_tree_depth = {}

for i, subjectURI in enumerate(npg_subjects_all):
    if i % 100 == 0:
        print(i, end='...', flush=True)
    for row in g_npg_subjects.query("""
        SELECT ?treeDepth
        WHERE {
            <SUBJECT_URI> npg:treeDepth ?treeDepth .
        }
    """.replace('SUBJECT_URI', subjectURI)):
        if subjectURI in npg_subjects_tree_depth:
            npg_subjects_tree_depth[subjectURI].append(row[0].toPython())
        else:
            npg_subjects_tree_depth[subjectURI] = [row[0].toPython()]


npg_subjects_description = {}

for i, subjectURI in enumerate(npg_subjects_all):
    if i % 100 == 0:
        print(i, end='...', flush=True)
    for row in g_npg_subjects.query("""
        SELECT ?description
        WHERE {
            <SUBJECT_URI> skos:definition ?description .
        }
    """.replace('SUBJECT_URI', subjectURI)):
        npg_subjects_description[subjectURI] = row[0].toPython()


npg_subjects_parents = {}
npg_subjects_children = {}

for i, subjectURI in enumerate(npg_subjects_all):
    if i % 100 == 0:
        print(i, end='...', flush=True)
    for row in g_npg_subjects.query("""
        SELECT ?parents
        WHERE {
            <SUBJECT_URI> skos:broader ?parents .
        }
    """.replace('SUBJECT_URI', subjectURI)):
        if subjectURI in npg_subjects_parents:
            npg_subjects_parents[subjectURI].append(row[0].toPython())
        else:
            npg_subjects_parents[subjectURI] = [row[0].toPython()]
    for row in g_npg_subjects.query("""
        SELECT ?children
        WHERE {
            <SUBJECT_URI> skos:narrower ?children .
        }
    """.replace('SUBJECT_URI', subjectURI)):
        if subjectURI in npg_subjects_children:
            npg_subjects_children[subjectURI].append(row[0].toPython())
        else:
            npg_subjects_children[subjectURI] = [row[0].toPython()]


# add children of top level parent ('http://ns.nature.com/subjects/')
top_level = []
for row in g_npg_subjects.query("""
    SELECT DISTINCT ?id
    WHERE {
        ?id npg:isRoot true .
    }
"""):
    top_level.append(row[0].toPython())

npg_subjects_children[subjects] = top_level

[f.replace(subjects, '') for f in npg_subjects_children[subjects]]


def flatten(list_of_lists):
    return list(itertools.chain(*list_of_lists))

def create_tree_nums(subjectURI):
    if subjectURI in npg_subjects_parents:
        treenums = []
        for uri in npg_subjects_parents[subjectURI]:
            treenums.append(['{}.{}'.format(tnum, subjectURI.replace(subjects, '')) for tnum in flatten(create_tree_nums(uri))])
    else:
        treenums = [[subjectURI.replace(subjects, '')]]
    return treenums

npg_subjects_tree_nums = {}

for i, subjectURI in enumerate(npg_subjects_all):
    if i % 100 == 0:
        print(i, end='...', flush=True)
    npg_subjects_tree_nums[subjectURI] = flatten(create_tree_nums(subjectURI))

npg_subjects_tree_nums[list(npg_subjects_all)[19]]


# Redis

r = redis.StrictRedis(host='localhost', port=6379, db=0)
r.delete('ontologist:autocomplete')
r.delete('ontologist:treeDepth')
r.delete('ontologist:treeNums')
r.delete('ontologist:prefLabel')
r.delete('ontologist:synonyms')
r.delete('ontologist:description')


# autocomplete

def preprocess_term(term, label):
    return tuple([t.lower() for t in term.split(' ')]), label

npg_subjects_terms_preprocessed = set()
npg_subjects_pref_terms_preprocessed = set()
for uri in npg_subjects_all_terms.keys():
    for term in npg_subjects_all_terms[uri]:
        if ',' in term:
            if term == npg_subjects_pref_label[uri]:
                term_reordered = ' '.join(term.split(', ')[::-1])
                npg_subjects_pref_terms_preprocessed.add(preprocess_term(term_reordered, uri.replace(subjects, '')))
            else:
                term_reordered = ' '.join(term.split(', ')[::-1])
                npg_subjects_terms_preprocessed.add(preprocess_term(term_reordered, uri.replace(subjects, '')))
        else:
            if term == npg_subjects_pref_label[uri]:
                npg_subjects_pref_terms_preprocessed.add(preprocess_term(term, uri.replace(subjects, '')))
            else:
                npg_subjects_terms_preprocessed.add(preprocess_term(term, uri.replace(subjects, '')))

npg_subjects_terms_preprocessed = list(npg_subjects_terms_preprocessed)
npg_subjects_pref_terms_preprocessed = list(npg_subjects_pref_terms_preprocessed)
npg_subjects_substring_dict = {}

for i, (terms, ui) in enumerate(npg_subjects_terms_preprocessed):
    if i % 1000 == 0:
        print(i, end='...', flush=True)
    for term in list(terms):
        for substring, fraction in [(term[0:i], i / len(term)) for i in range(1, len(term) + 1)]:
            score = int(fraction * 5000 / len(terms))
            if substring in npg_subjects_substring_dict:
                npg_subjects_substring_dict[substring].append(['subjects:{}'.format(ui), score])
            else:
                npg_subjects_substring_dict[substring] = [['subjects:{}'.format(ui), score]]

for i, (terms, ui) in enumerate(npg_subjects_pref_terms_preprocessed):
    if i % 1000 == 0:
        print(i, end='...', flush=True)
    for term in list(terms):
        for substring, fraction in [(term[0:i], i / len(term)) for i in range(1, len(term) + 1)]:
            score = int(fraction * 10000 / len(terms))
            if substring in npg_subjects_substring_dict:
                npg_subjects_substring_dict[substring].append(['subjects:{}'.format(ui), score])
            else:
                npg_subjects_substring_dict[substring] = [['subjects:{}'.format(ui), score]]



for i, substring in enumerate(npg_subjects_substring_dict.keys()):
    if i % 1000 == 0:
        print(i, end='...', flush=True)
    r.hset('ontologist:autocomplete', substring, json.dumps(npg_subjects_substring_dict[substring]))



# tree depth

mean_depths = {}
for uri in npg_subjects_tree_depth.keys():
    mean_depths[uri] = np.mean(npg_subjects_tree_depth[uri])

print('NPG subjects mean tree depth:', np.mean(list(mean_depths.values())))

for uri in npg_subjects_tree_depth.keys():
    r.hset('ontologist:treeDepth', uri.replace(subjects, 'subjects:'), np.mean(npg_subjects_tree_depth[uri]))

# preferred terms and synonyms

def reorder_term(term):
    if ',' in term:
        return ' '.join(term.split(', ')[::-1])
    else:
        return term

for uri in npg_subjects_pref_label.keys():
    r.hset('ontologist:prefLabel', uri.replace(subjects, 'subjects:'), reorder_term(npg_subjects_pref_label[uri]))

for uri in npg_subjects_synonyms.keys():
    synonyms = npg_subjects_synonyms[uri]
    r.hset('ontologist:synonyms', uri.replace(subjects, 'subjects:'), json.dumps(list(set([reorder_term(syn) for syn in synonyms]))))

# description / scope notes

for uri in npg_subjects_description.keys():
    r.hset('ontologist:description', uri.replace(subjects, 'subjects:'), npg_subjects_description[uri])


# tree num

for ui in npg_subjects_tree_nums.keys():
    r.hset('ontologist:treeNums', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_tree_nums[ui]))

# test

test = r.hget('ontologist:autocomplete', 'cancer')

list(filter(lambda x: x[0] == 'subjects:cancer', eval(r.hget('ontologist:autocomplete', 'cancer'))))

list(filter(lambda x: x[0] == 'subjects:cancer', eval(r.hget('ontologist:autocomplete', 'neoplasm'))))


# create redis protocol file

autocomplete_dict = {}
for substring in npg_subjects_substring_dict.keys():
    if substring in autocomplete_dict:
        autocomplete_dict[substring].extend(npg_subjects_substring_dict[substring])
    else:
        autocomplete_dict[substring] = npg_subjects_substring_dict[substring]

conn = redis.Connection()

with gzip.open('redis_autocomplete_init.txt.gz', 'wb') as f:
    print('Autocomplete keys', end='...', flush=True)
    for i, substring in enumerate(autocomplete_dict.keys()):
        for item in conn.pack_command('HSET', 'ontologist:autocomplete', substring, json.dumps(autocomplete_dict[substring])):
            f.write(item)
    # NPG subjects
    print('NPG subjects tree depths', end='...', flush=True)
    for uri in npg_subjects_tree_depth.keys():
        for item in conn.pack_command('HSET', 'ontologist:treeDepth', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_tree_depth[uri])):
            f.write(item)
    print('NPG subjects tree nums', end='...', flush=True)
    for uri in npg_subjects_tree_nums.keys():
        for item in conn.pack_command('HSET', 'ontologist:treeNums', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_tree_nums[uri])):
            f.write(item)
    print('NPG subjects prefLabel', end='...', flush=True)
    for uri in npg_subjects_pref_label.keys():
        for item in conn.pack_command('HSET', 'ontologist:prefLabel', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_pref_label[uri])):
            f.write(item)
    print('NPG subjects synonyms', end='...', flush=True)
    for uri in npg_subjects_synonyms.keys():
        for item in conn.pack_command('HSET', 'ontologist:synonyms', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_synonyms[uri])):
            f.write(item)
    print('NPG subjects descriptions', end='...', flush=True)
    for uri in npg_subjects_description.keys():
        for item in conn.pack_command('HSET', 'ontologist:description', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_description[uri])):
            f.write(item)
    print('NPG subjects children', end='...', flush=True)
    for uri in npg_subjects_children.keys():
        for item in conn.pack_command('HSET', 'ontologist:children', uri.replace(subjects, 'subjects:'), json.dumps([x.replace(subjects, '') for x in npg_subjects_children[uri]])):
            f.write(item)
    print('NPG subjects parents', end='...', flush=True)
    for uri in npg_subjects_parents.keys():
        for item in conn.pack_command('HSET', 'ontologist:parents', uri.replace(subjects, 'subjects:'), json.dumps([x.replace(subjects, '') for x in npg_subjects_parents[uri]])):
            f.write(item)



# test data

with gzip.open('redis_autocomplete_init_test.txt.gz', 'wb') as f:
    print('Autocomplete keys', end='...', flush=True)
    test_keys = []
    for i, substring in enumerate(autocomplete_dict.keys()):
        if substring != 'cancer' and not re.match(r'^pancrea', substring):
            continue
        for item in conn.pack_command('HSET', 'ontologist:autocomplete', substring, json.dumps(autocomplete_dict[substring])):
            f.write(item)
            test_keys.extend([x[0] for x in autocomplete_dict[substring]])
    # NPG subjects
    test_keys += ['subjects:']
    test_keys += [x.replace(subjects, 'subjects:') for x in npg_subjects_children[subjects]]
    print('NPG subjects tree depths', end='...', flush=True)
    for uri in npg_subjects_tree_depth.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:treeDepth', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_tree_depth[uri])):
            f.write(item)
    print('NPG subjects tree nums', end='...', flush=True)
    for uri in npg_subjects_tree_nums.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:treeNums', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_tree_nums[uri])):
            f.write(item)
    print('NPG subjects prefLabel', end='...', flush=True)
    for uri in npg_subjects_pref_label.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:prefLabel', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_pref_label[uri])):
            f.write(item)
    print('NPG subjects synonyms', end='...', flush=True)
    for uri in npg_subjects_synonyms.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:synonyms', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_synonyms[uri])):
            f.write(item)
    print('NPG subjects descriptions', end='...', flush=True)
    for uri in npg_subjects_description.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:description', uri.replace(subjects, 'subjects:'), json.dumps(npg_subjects_description[uri])):
            f.write(item)
    print('NPG subjects children', end='...', flush=True)
    for uri in npg_subjects_children.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:children', uri.replace(subjects, 'subjects:'), json.dumps([x.replace(subjects, '') for x in npg_subjects_children[uri]])):
            f.write(item)
    print('NPG subjects parents', end='...', flush=True)
    for uri in npg_subjects_parents.keys():
        if uri.replace(subjects, 'subjects:') not in test_keys:
            continue
        for item in conn.pack_command('HSET', 'ontologist:parents', uri.replace(subjects, 'subjects:'), json.dumps([x.replace(subjects, '') for x in npg_subjects_parents[uri]])):
            f.write(item)
