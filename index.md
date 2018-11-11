---
title: Posts
---
<ul class="posts">
    {% for post in site.posts -%}
        <li><div><a href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a><time pubdate="pubdate" datetime="{{ post.date | date: "%Y-%m-%d" }}">{{ post.date | date: "%Y-%m-%d" }}</time></div></li>
    {% endfor -%}
</ul>
