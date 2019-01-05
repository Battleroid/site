---
title: Posts
---
<ul class="posts">
    {% for post in site.posts -%}
        <li><div><time pubdate="pubdate" datetime="{{ post.date | date: "%Y-%m-%d" }}">{{ post.date | date: "%Y-%m-%d" }}</time><a href="{{ post.url | prepend: site.baseurl }}">{{ post.title }}</a></div></li>
    {% endfor -%}
</ul>
