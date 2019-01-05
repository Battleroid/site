---
title: Shared sessions with tmux
date: 2017-02-11
---

I recently started as an intern at MailChimp and been getting used to using OS X all over again. I was provisioned a large enough monitor that a tiling window manager isn't necessary. That doesn't change my distaste of cluttering my entire desktop with individual windows. I don't like using iTerm's natural tabbing either for some reason.

So I've got to get back in the habit of using tmux consistently. On that topic I was interested and found that you can distribute sessions to other clients, *potentially even other users*. Seems like it'd be great if you needed some guidance from a coworker while editing something via ssh.

All you have to do is `tmux new-session -s shared` and (if on the same user) `tmux attach-session -r -t shared`. The new client will have read only view of your session. Pretty damn cool!

You can even distribute this to another user by creating a new socket for the session in `/tmp`. From what I gather something like `tmux -S /tmp/shared-session` for creating and `tmux -S /tmp/shared-session attach` would be sufficient.
