---
title: Building an endless rally source representative of an original cluster
date: 2020-02-28
---

_This is part of an ongoing effort to make use of Rally as a load generation tool for testing purposes to mimic our Logstash instance setup in our logging infrastructure._

_I don't have all the answers; feel free to call me out and tell me how I'm wrong, I probably am and don't know it. I mostly wrote this to remind myself on why I should never do this again._

Before ECK was a reality, I remember reading of Elastic's Rally. Rally is a tool, that Elastic uses to benchmark a variety of scenarios for new builds of ES. There's a plethora of scenarios, or "tracks" as they call them, testing everything from indexing, querying, simulated user activity, updates, ML jobs, etc. More complicated scenarios can be pieced together that run in parallel, either from a single instance of Rally or many load drivers in a cluster, driven by a single coordinator.

While evaluating ECK on GKE, I figured the easiest way to benchmark cluster performance would be to use Rally, both with the pre-existing tracks, and writing my own. Unfortunately, as far as I know, Elastic only details the basics on how to create a parameter source for querying. I'm not interested in the query performance. Rather, I'd like to simulate production logging data from a variety of sources. Especially with a boat load of rollover indices that our forked ES output of Logstash generates.

Fortunately, looking at their [eventdata](https://github.com/elastic/rally-eventdata-track) track we can get an idea of how to not only piece an endless bulk generation source together, but also runners that can setup rollover indices from the corpora. Their [official documentation](https://esrally.readthedocs.io/en/stable/adding_tracks.html) also covers a part of what we plan to do today.

# Collecting sample data

Before we get to piecing together a bulk source, we need to decide upon which data we want to simulate. In my case I wanted to simulate across all twenty individual Mailchimp shards as well as our Nginx logging data. The development logging data varies wildly, some logging channels contain single word events that have more metadata than actual substance, others can be practically an entire webpage of data.

Replicating this by randomly generating data would be a huge performance burden. I opted to instead take a sample based on a maximum doc count from each individual cluster backing the logging data. For each cluster I set a cap of 1000 documents, then based on the doc counts for each rollover alias pattern I sampled documents from each of the indices proportional to the limit.

So if a cluster has indices such as:

```
GET _cat/indices?v&h=index,docs.count&s=docs.count:desc
index  docs.count
abc-01         10
abc-02         10
def-01         10
xyz-01          5
```

We'll need to group these by the rollover aliases `abc`, `def`, and `xyz` with weights such as:

```
+---------+----------+
| index   | weight   |
|---------+----------|
| abc     | 57%      |
| def     | 29%      |
| xyz     | 14%      |
+---------+----------+
```

The grouping itself is fairly straightforward as all the rollover aliases follow the same pattern of `<index-name-{now/d}-000001>`. Using a regex pattern and `collections.Counter` built into Python's standard library, we can get the appropriate number of documents to sample from each.

After iterating over the aliases and building percentages for each alias, we can then shove those values into a counter via `random.choices` to sample the right number of documents from all our indices capped at the limit.

Code wise it ends up as:

```python
# Rollover pattern
ro_pattern = re.compile('\-\d{4}\.\d{2}\.\d{2}\-\d{6}$')

# Start with getting totals per alias group
counts = {}
for entry in indices:
    index = ro_pattern.sub('', entry['index'])
    docs = int(entry['docs.count'])
    # Skip any dot prefixed, es or kibana related indices ...
    counts[index] += docs

# Next we need to build the percentages based off our totals
total_docs = sum(counts.values())
dist = {}
for alias, total in counts.items():
    if total == 0:
        continue
    perc = total / total_docs
    dist[alias] = total / total_docs

# Now we go ahead and build a Counter with our weighted totals
sample_counts = Counter(random.choices(
    list(dist.keys()),
    weights=dist.values(),
    k=corpus_limit  # In my script's case we cap at 1000
))
```

So if we were to only grab 10 documents in total from our sample set, we'd end up with counts such as:

```
+---------+---------+
| index   |   count |
|---------+---------|
| abc     |       6 |
| def     |       3 |
| xyz     |       1 |
+---------+---------+
```

Reusing the `sample_counts` we can then cycle through each alias and issue a simple query against our target ES cluster for the number of documents we require. Like so:

```python
# For each alias and its respective proportion, do ...
for i, item in enumerate(sample_counts.items()):
    alias, n = item
    resp = requests.get(
        f'{api}/{alias}-*/_search',
        params={
            'size': n,
            'filter_path': ','.join([f'hits.hits._source.{field}' for field in keepers]),
            'expand_wildcards': 'open'
        }
    ).json()
```

{: .caption}
If you're doing fairly large counts, such as planning to grab 10k or more documents per alias, you might want to drop the plain old query for something that leverages the scroll API or you might run into issues.

While pulling we'll also do a bit of trimming via the `filter_path` parameter to remove everything but the few fields we're interested in. Nginx data for example we only care for a handful of fields, the remaining were generally static that can be simulated later on.

Application logs needed even less, usually just a couple fields that had the bulk of the data, some meta information about the context, the remaining like Nginx data could be simulated.

What we're left with after twenty some odd runs later is a relatively small dataset that when randomly used as our corpora for load generation is representative of the original data. Compressed they're even smaller:

```
$ du -sh *
 14M	app.json
1.4M	app.json.gz
 18M	nginx.json
2.2M	nginx.json.gz
```

If you have a need for this kind of process, you can make some modifications and reuse the script I created if you'd like, see [corpus_sample.py](https://gist.github.com/Battleroid/c80763dffc415814460d51c78450ce2e).

# Creating the runners

Before we can go ahead with indexing, we need to put together runners to establish our rollover indices, as well as our parameter sources that will supply our data.

Using the [eventdata][] track and the [rally documentation](https://esrally.readthedocs.io/en/1.3.0/adding_tracks.html#custom-runners) as a base, we just need a function or callable class that returns a tuple of two values indicating our performed operations. However, since we're going to be loading corpora data dynamically, we'll need to be a bit more cognizant about keeping this data around and avoid reloading it from disk if possible.

We can create an empty module known as `example.utils.acs`, within it we'll have a single dictionary `global_lookups = {}`. In the runners and parameter sources we'll leverage `global_lookups` to avoid reloading the same data set multiple times.

To do so within both the runners and parameter sources we need to confirm that the dataset **1)** exists, if not **2)** load the dataset after unarchiving into our `global_lookups` map. Afterwards, such as when indexing the data should be readily available.

This process within my rollover runner looks like this:

```python
import gzip
import pathlib
import json
from app.utils import acs

cwd = pathlib.Path(__file__).parent.absolute()

class AppCreateAliases:
    def __call__(self, es, params):
        # Load aliases and dataset
        if '_app_aliases' in acs.global_lookups.keys():
            self._app_aliases = acs.global_lookups['_app_aliases']
        else:
            if '_app' not in mcs.global_lookups.keys():
                with gzip.open(cwd.joinpath('../parameter_sources/data/app.json.gz').resolve(), 'rt') as gf:
                    acs.global_lookups['_app'] = list(map(json.loads, gf.read().splitlines()))
                    self._app_aliases = set([d['elasticsearch_index'] for d in acs.global_lookups['_app']])
                    acs.global_lookups['_app_aliases'] = self._app_aliases
```

This should ensure that our dataset and the elasticsearch index names are readily available for use in our runners and parameter sources on first use. Now to create all our rollover aliases we just need to use our given es client to create an index with `is_write_index` set properly.

```python{% raw %}
# dataset loading prior ...
ops_count = 0
for index in self._app_aliases:
    es.indices.create(
        f'<{index}-{{now/d}}-000001>',
        {
            'aliases': {
                index: {
                    'is_write_index': True
                }
            }
        }
    )
    ops_count += 1

return ops_count, 'ops'{% endraw %}
```

With that done, voilà! We have 100+ aliases built directly from our corpora data.

```
health status index
green  open   app-sample-0-2020.02.17-000001
green  open   app-sample-1-2020.02.17-000001
green  open   app-sample-2-2020.02.17-000001
green  open   app-sample-4-2020.02.17-000001
green  open   app-sample-5-2020.02.17-000001
green  open   app-sample-6-2020.02.17-000001
green  open   app-sample-7-2020.02.17-000001
green  open   app-sample-8-2020.02.17-000001
green  open   app-sample-9-2020.02.17-000001
green  open   app-sample-10-2020.02.17-000001
green  open   app-sample-11-2020.02.17-000001
```

Of course we could have done this by leveraging some Jinja2 magic within our operation or challenge, but that means if we ever remade our corpora data we'd have to redo all of the aliases over.

# Creating the parameter source(s)

The parameter source is also relatively straightforward to implement, however, we'll need to split it into two pieces. The first being the source specific logic, i.e. loading the data, preparing it, and executing the bulks. The second is implementing the logic to populate the more static fields with semi-random content. We'll need to use the profiling option provided by Rally to see what methods inflict the most performance burden.

The parameter source is based off the [elasticlogs_bulk_source.py](https://github.com/elastic/rally-eventdata-track/blob/master/eventdata/parameter_sources/elasticlogs_bulk_source.py), we don't need to be nearly as complex as the eventdata equivalent. For starters, we don't need the ID management, we'll just use autogenerated IDs like Logstash would.

We also do not need to manually build a bulk payload based on probabilities like most of the built-in Rally tracks. Our data is pre-proportioned based off the original data, so we can use `random.choices` with the `k` number of documents in our bulk size.

Start by instantiating your source like so:

```python
class AppBulkSource:
    def __init__(self, track, params, **kwargs):
        self.infinite = False
        self.orig_args = [track, params, kwargs]
        self._bulk_size = params['bulk-size']
        self._type = params.get('type', '_doc')
        # If you intend to use data from the track or params, you
        # should set them here as well

        # Load our data just like we did so in our runner
        self._app = acs.global_lookups['_app']

    @property
    def percent_completed(self):
        return None
```

Note we set `infinite` to `False`. Technically our parameter source is infinite, but to Rally it is treated as finite. Since our progress with our infinite bulk source is determined by time spent or iterations spent triggering `params()`, `percent_completed` can return `None`.

To build the actual bulk payload we can use `random.choices` to make our selections for us.

```python{% raw %}
def params(self):
    bulk_array = []

    events = random.choices(self._app, k=self._bulk_size)
    for evt in events:
        index = evt['elasticsearch_index']
        bulk_array.append(f'{{"index":{{"_index":"{index}","_type":"{self._type}"}}}}')
        bulk_array.append(json.dumps({**evt, **common.random_app_common()}, separators=(',', ':')))

    response = {
        'body': '\n'.join(bulk_array),
        'action-metadata-present': True,
        'bulk-size': len(bulk_array) // 2
    }

    return response{% endraw %}
```

For the partitioning, I'll admit, I'm not entirely sure how to interpret what this should do in our case, so we'll just go ahead and reuse the eventdata partitioning function.

```python
def partition(self, partition_index, total_partitions):
    new_params = copy.deepcopy(self.orig_args[1])
    new_params['cient_id'] = partition_index
    new_params['client_count'] = total_partitions
    return AppBulkSource(self.orig_args[0], new_params, **self.orig_args[2])
```

The randomized portion of our data, is produced by `random_app_common()`. Let's take a look at 

Our base for application data is a set of completely static values within the `common` module:

```python
SHA_CHARS = string.digits + string.ascii_lowercase
STATIC_APP = {
    '@version': '1',
    'env': 'prod',
    'level': 200,
    'level_name': 'INFO',
    'project': 'app',
    'role': 'app',
    'source': '/path/to/default.log',
    'statsd_app': 'app_kafka',
    'timing': {}
}
```

The remainder of the more dynamic values were derived from a counter built off a random range on initialization.

```python
_COUNTER = cycle(list(range(random.randint(0, 100), random.randint(1000, 10000))))
```

From this counter I derive the majority of my values simply by adding or multiplying. I split out each portion into a separate function so I could reuse them amongst the nginx data as well, but the application data has the most varied data.

Then our `random_app_common()` function would populate the remamining values.

```python
def random_subproject():
    return 'us' + str(random.randint(1, 21))

def random_dc():
    return random.choice(['atl99', 'sea99'])

def random_sha256():
    return str(hashlib.sha256(str(next(_COUNTER)).encode('utf-8')).hexdigest())[:40]

def random_datetime(ts):
    ts_str = ts.strftime('%Y-%m-%dT%H:%M:%S.000Z')
    return {
        'timestamp': ts_str,
        '@timestamp': ts_str,
        'datetime': {
            'date': ts.strftime('%Y-%m-%d %H:%M:%S.000000'),
            'timezone': 'GMT',
            'timezone_type': 2
        }
    }

def random_metadata_and_kafka(ts, dc, sp, src):
    n = next(_COUNTER)
    origin_epoch = int(ts.timestamp() * 1000)
    return {
        'metadata': {
            'timing': {
                'ts_01_event': origin_epoch + n,
                'ts_02_filebeat': origin_epoch + n + 10,
                'ts_03_kafka': origin_epoch + n + 20,
                'ts_04_logstash': origin_epoch + n + 30,
                'ts_03_elasticsearch': origin_epoch + n + 40,
            }
        },
        'kafka': {
            'consumer_group': f'{src}-{sp}-{dc}-es' if src == 'app' else f'{src}-{dc}-es',
            'partition': random.randint(0, 32),
            'offset': n * 10000,
            'topic': f'{src}-{sp}' if src == 'app' else src,
            'key': None,
            'timestamp': origin_epoch
        },
        'offset': next(_COUNTER) * 10000
    }

def random_app_common():
    n = str(next(_COUNTER))[-2:]
    sp = random_subproject()
    dc = random_dc()
    ts = datetime.datetime.utcnow()
    host = f'app{n}.{sp}.prod.{dc}.example.com'

    return {
        'document_id': random_sha256(),
        'subproject': sp,
        'subproject_numeric': int(sp[2:]),
        'tags': ['app', dc, 'example', 'prod', sp],
        'host': host,
        'beat': {
            'hostname': host,
            'name': host,
            'version': '6.7.1'
        },
        **random_datetime(ts),
        **random_metadata_and_kafka(ts, dc, sp, 'app'),
        **STATIC_APP
    }
```

These set of functions get us a decent approximation of what a real event might look like after making its way through the pipeline. The correctness of the data itself matters not, as we're load testing with highly variable data, not how valid that data is. We want to approximate what it'd be light to blast a cluster with data as if it were coming from Logstash itself.

On my first pass I tried to use `randint` wherever it seemed appropriate. This ended up costing me, as each call for my `random_app_common()` was a few tenths of a second. Removing the copious `randint` and opting for a singular counter that I iterated over was enough to get it down to under a few milliseconds per call on average which was much better.

A primitive demonstration makes this evident:

```
>>> timeit.timeit(
... '[randint(0, 10000) for _ in range(0, 20)]',
... 'from random import randint', number=100000)
1.9321501590000025

>>> timeit.timeit('[next(a) for _ in range(0, 20)]',
... setup='''
... from itertools import cycle;
... from random import randint;
... a = cycle(list(range(randint(0, 1000), randint(10000, 1000000))))
... ''', number=100000)
0.1808537970000117
```

# Bringing everything together

Now that our track has begun to take shape. We need to register the runners and parameter sources, then write a challenge to make use of our new bulk source.

```
.
├── __init__.py
├── parameter_sources
│   ├── __init__.py
│   ├── common.py
│   ├── data
│   │   ├── app.json.gz
│   │   └── nginx.json.gz
│   ├── app.py
│   └── nginx.py
├── runners
│   ├── __init__.py
│   ├── app_aliases_runner.py
│   └── nginx_aliases_runner.py
└── utils
    ├── __init__.py
    └── acs.py
```

{: .caption}
Sample structure of our track so far.

At the root of our track we need to create `track.py` that registers our runners and parameter sources to make them usable.

```python
from app.parameter_sources.app import AppBulkSource
from app.parameter_sources.nginx import NginxBulkSource
from app.runners.app_aliases_runner import AppCreateAliases
from app.runners.nginx_aliases_runner import NginxCreateAliases

def register(registry):
    registry.register_param_source("app-bulk", AppBulkSource)
    registry.register_runner("app-aliases", AppCreateAliases())
    registry.register_param_source("nginx-bulk", NginxBulkSource)
    registry.register_runner("nginx-aliases", NginxCreateAliases())
```

Now, within any of our challenges, if we issue a bulk we can now specify the runner to premake our rollover aliases:

```json
{
  "name": "setup-rollover-aliases",
  "operation": {
    "operation-type": "app-aliases"
  }
}
```

Then to start pushing data, we can issue a new bulk operation with a time period set.

```json
{
  "name": "app-bulk-10m-5000",
  "operation": {
      "operation-type": "bulk",
      "param-source": "app-bulk",
      "bulk-size": 5000
  },
  "time-period": 600,
  "warmup-time-period": 60,
  "clients": 4
}
```

This would index in bulks of 5000 events for a continuous 10 minutes, with a 60 second warm up period within a challenge.

Assuming you have the challenge written up to make use of either, running rally against your target can be done manually by specifying the `--track-path`.

```
$ esrally race \
  --track-path=$(pwd) \
  --target-hosts=localhost:9200 \
  --pipeline=benchmark-only \
  --challenge=my-endless-challenge ...
  # Optionally adding --enable-driver-profiling to generate a
  # performance report in ~/.rally/logs/profile.log 
```

If you withstood my rambling this far, go ahead and take a nap like I'm about to do.

[eventdata]: https://github.com/elastic/rally-eventdata-track
