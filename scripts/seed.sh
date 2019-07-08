#!/usr/bin/env bash

if [[ $(redis-cli --version | cut -b11) -ge 3 ]]; then
    echo ''
else
    if [[ $(redis-cli --version | cut -b11) -eq 2 ]] && [[ $(redis-cli --version | cut -b13) -ge 6 ]]; then
        echo ''
    else
        echo 'redis-cli needs to be at least version 2.6'
        exit 1
    fi
fi


if [[ $NODE_ENV == "test" ]]; then
    DATA='./data/redis_autocomplete_init_test.txt.gz'
    echo $DATA
else
    DATA='./data/redis_autocomplete_init.txt.gz'
    echo $DATA
fi


if [ -f $DATA ]; then
    echo 'Preparing redis for pre-population with:' $DATA '...'
    keys=('ontologist:subjects:subtree'
          'ontologist:autocomplete'
          'ontologist:treeDepth'
          'ontologist:treeNums'
          'ontologist:prefLabel'
          'ontologist:synonyms'
          'ontologist:description'
          'ontologist:parents'
          'ontologist:children')
    for key in "${keys[@]}"
    do
        echo "DEL $key" | redis-cli -h $REDIS_HOST -p $REDIS_PORT -a ${REDIS_PASSWORD:='none'} > /dev/null
    done
    echo '...done.'
    echo 'Pre-populating redis hashmaps...'
    gunzip -c $DATA | cat | redis-cli -h $REDIS_HOST -p $REDIS_PORT -a ${REDIS_PASSWORD:='none'} --pipe
    echo '...done.'
    echo ''
else
    echo 'Error: Cannot find redis data initialization file.'
    exit 1
fi
