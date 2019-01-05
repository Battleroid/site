---
title: Pandas Tidbits
date: 2016-04-11
---

Last semester and the beginning of this semester I picked up on some research work for my professor. Since the work involves heavy use of a somewhat large dataset I use Pandas quite frequently for manipulation of data.

During my last use of Pandas I was pulling my hair out attempting to do things that should be simple, especially with a library meant for dealing with this kind of data. Fortunately, some nice people on StackOverflow helped out and with some fiddling I solved my other issues. Anyways, onto the problems ...

First is just an easy, more convenient way to create a frequency table based off a pair of columns from our parent dataset.

```python
freq_table = pd.concat([df[a], df[b]]).value_counts().reset_index()
freq_table.columns = ['value', 'freq']
```

If you want the probability it's just one step more:

```python
freq_table.freq.divide(freq_table.freq.sum())
# or, for frequency squared
freq_table.freq.divide(freq_table.freq.sum()).apply(lambda x: pow(x, 2))
```

I needed to insert new blank (zero valued) rows between existing values in a table within a range. So, if the column I'm using has the range 2 through 23, but is missing half those values I need blank rows for 6, 9, 15, etc that are missing.

```python
df.index = df.column_name
df.reindex(
    numpy.arange(
        df.column_name.min(),
        df.column_name.max() + 1
    ),
    fill_value=0
)
```

Last, but not least, this is just a convenient way to randomly sample any number of rows from a given dataframe:

```python
df.ix[random.sample(df.index, n)]
```

Hope this helps some people out there.
