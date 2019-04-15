#!/bin/bash
tmux new-session -d -s "jekyll" 'bundle exec jekyll serve -b "" -P 5000 -H 0.0.0.0 -w -l -D --future'
