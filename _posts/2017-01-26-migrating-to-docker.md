---
title: Migrating Everything to Docker
date: 2017-01-26
---

Over the past five years I've experimented and played with a few different virtualization technologies and hypervisors. Initially I used to run everything on bare metal. I didn't know any better and I felt this was optimal for everything I used.

This was problematic when I wanted more and more services. Finding a good way to manage a web server, a few game servers while deploying new applications for myself or friends was a hassle. Eventually I moved on from this (though I did return to this for a brief period later on).

# Proxmox

I came across Proxmox while I was searching for an easy way to get into virtualization without using my desktop. I liked that behind the fancy web UI it was just Debian with a different face. I had little trouble setting up new services, games, applications, web servers in OpenVZ containers. I even briefly played with a Windows VM or two under KVM. Overall it was great.

I wasn't too pleased with how poor I/O speed was with the Minecraft and Insurgency servers. Feeling adventurous I looked into read cache solutions. One that popped up was Flashcache. Used by Facebook and was compatible with Debian I downloaded it, compiled it, read some guides and picked through existing init scripts for it. With some perseverance and luck I managed to online a functional cache device for my RAID 1 setup.

The effects were apparent, performance alone in Minecraft was twofold and most of us no longer stalled exploring existing chunks, it was great.

Later down the road though it was apparent it had some issues as sequential reads would slow to a grinding halt, (e.g. from 330MB/s to about 20MB/s). I never did figure out why. I always assumed it was due to me misconfiguring it, but I'll never know for sure.

It's irrelevant now as I use ZFS with a L2ARC which is much easier to setup and configure.

# Xen

Seeking a new answer and better or comparable performance without the use of a web UI I found Xen. At the same time I was making use of LVM on my laptop and loved that it could use LVs as disks for the VMs. I ended up replacing all my existing services from the OpenVZ containers as Xen virtual machines.

Performance was solid, and setting up new VMs was easy as the process was the same as say my laptop. I'd install a few simple things or run a script that would install some packages and I'd ssh in for some finishing touches and I was done! Add LVM into the mix which made creating and managing disks for the VMs pretty. Overall the entire process was pretty simple, just more hands on.

# Docker

I stayed with Xen for roughly a year. After I was tired of managing Xen I started over again using bare metal. This was fine for a time, all the way up to December of 2016. I disliked the security risk that came with running everything on the same bare machine. I also did not like the tedious nature of managing everything.

Two years before I had a brief introduction with Docker in my E-Commerce course. I created a Docker container for the web application to test and present it without any hangups. I loved how straightforward creating a Dockerfile was and how quick it was to rebuild the project.

That was one of the deciding factors on why I moved onto Docker for my home server. Creating new services with docker-compose is a two step, fire & forget process which makes things even easier.

For example, my friends were itching to get back into Minecraft with a couple plugins. Setting this up myself isn't difficult, but it's tedious to get everything just right. Using Docker I cut what was a few hours into maybe five minutes of work. I even copied and changed a couple things to launch several servers with varying setups for them.

Here's one of the YAML files using an existing comprehensive image.

```
biome:
    image: itzg/minecraft-server
    ports:
        - "25566:25565"
        - "25566:25565/udp"
    volumes:
        - /tank/data/mc-biome:/data
    restart: always
    container_name: mc-biome
    environment:
        - TYPE=SPIGOT
        - VERSION=1.10.2
        - EULA=TRUE
        - ENABLE_COMMAND_BLOCK=true
        - JVM_OPTS=-Xmx1G -Xms512M
        - UID=1000
        - GID=1001
        - SKIP_OWNERSHIP_FIX=TRUE
    stdin_open: true
    mem_limit: 1G
```

Just like all the applications I use, updating is painless; I just remove the container, destroy it, pull and restart it. Or in the case of docker-compose, I just pull and restart.

What's great is I currently use ZFS in a striped mirror configuration and store the Docker volumes and images inside the ZFS pool. With LZ4 on I save a bit of space, combined with Docker's deduplication I save a bit more, so creating another Minecraft server doesn't end up duplicating shared data for the container's host. All of this with a L2ARC (read cache) helps with performance and makes management of new and existing applications easy.

One other bonus I didn't think of is how quick applications are to start (not just to rebuild). I mention this because in my area the power will briefly go out for a second or less, just enough to trigger a restart on my desktop or server. With Docker all the applications are up in less than 30 seconds of my server starting up. OpenVZ, Xen and the like took longer. Though I guess that's something that could be solved with even a basic UPS.

# ZFS and Snapshots

Currently any application with which I need access to on a regular basis (e.g. gitea, Minecraft, seafile) is kept on a separate ZFS dataset. Those that I need some sort of backup system I use zfSnap with.

The Minecraft servers are currently the only ones that have a regular snapshotting schedule via zfSnap. This is perfect as I can keep a backup of before & after an upgrade to avoid any flumups. Not to mention I can rollback to a backup staggered a couple months back in time without using too much extra disk space.

The only problem right now is I need a proper way to send either full or incremental backups to either another ZFS pool (think rsync.net) or gzip them and send them off to some other VPS. Though the last time I tried gzipping larger snapshots I had to split the dataset and compressing them took an awfully long time. That's not necessarily a process I'd like to automate unless the dataset sizes were small to begin with. Either way, once I find an affordable backup method it'll shouldn't be a huge hassle to work with.

# Conclusion

I enjoyed playing with each of these and am happy with Docker. It meets and exceeds my needs. I just need to research and play with an appropriate logging solution so finally once and for all I can collect and analyze my logs. In the meantime I guess I'll continue to do scour logs with grep, sed, and less.
