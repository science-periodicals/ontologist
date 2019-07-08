# Generating the data files

## Requirements

Raw data are available in this directory and were downloaded from
[Nature Subjects Ontology](https://github.com/nature/public-npg-domain-ontology)
(see also the [homepage](http://www.nature.com/ontologies/)).

Install python 3 and pip 3
Install required python dependencies:

```
pip install redis rdflib SPARQLWrapper numpy
```

Start redis and run:

```
python npg.py
```

This will create the required data files
