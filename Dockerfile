FROM ubuntu:14.04
MAINTAINER Nathan Fain "cyphunk@deadhacker.com"

# This file can be used to build a docker image or to determine OS/build
# dependencies.

### Setup OS ###

RUN apt-get update
RUN apt-get -y install nodejs
RUN apt-get -y install npm
RUN ln -s /usr/bin/nodejs /usr/bin/node # Handle npm ``/bin/sh: 1: node: not found``
RUN apt-get -y install libpcap-dev # for node_pcap
RUN apt-get -y install wget # to get GeoIP db

### Get sniffer.js code ###

# from remote:
RUN apt-get -y install git; git clone https://github.com/cyphunk/snifferjs.git /root/snifferjs
# from local:
#COPY . /root/snifferjs

### Install sniffer.js dependencies ###

RUN cd /root/snifferjs; npm install
RUN cd /root/snifferjs; wget http://geolite.maxmind.com/download/geoip/database/GeoLiteCountry/GeoIP.dat.gz; gzip -d GeoIP.dat.gz

### Run ###

EXPOSE 8080
# Optionally you could map the port on the execution host as well with:
# EXPOSE 8080:<port_such_as_8080>
# But this is not recommended, and instead:
# $ docker run -p 8080:8080 <image>

CMD cd /root/snifferjs; DEFAULTROUTE=$(route -n | head -3 | tail -1 | awk '{print $2}'); node sniffer.js eth0 'ip' ${DEFAULTROUTE}; /bin/bash

# build A: docker build -t snifferjs --rm .
# build B: docker build -t snifferjs https://raw.githubusercontent.com/cyphunk/snifferjs/master/Dockerfile
# run:     docker run -p 8080:8080 -it --rm snifferjs
