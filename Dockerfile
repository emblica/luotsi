#
# Slush Haproxy Dockerfile
#
# based on https://github.com/dockerfile/haproxy
#

# Pull base image.
FROM node

# Install Haproxy.
RUN \
	sed -i 's/^# \(.*-backports\s\)/\1/g' /etc/apt/sources.list && \
	apt-get update && \
	apt-get install -y haproxy && \
	sed -i 's/^ENABLED=.*/ENABLED=1/' /etc/default/haproxy && \
	rm -rf /var/lib/apt/lists/*

ADD . /data/luotsi
WORKDIR /data/luotsi
RUN npm install

EXPOSE 80 443
CMD node luotsi.js