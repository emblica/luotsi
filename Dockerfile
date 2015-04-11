#
# Slush Haproxy Dockerfile
#
# based on https://github.com/dockerfile/haproxy
#

# Pull base image.
FROM dockerfile/nodejs

# Install Haproxy.
RUN \
	sed -i 's/^# \(.*-backports\s\)/\1/g' /etc/apt/sources.list && \
	apt-get update && \
	apt-get install -y haproxy=1.5.3-1~ubuntu14.04.1 && \
	sed -i 's/^ENABLED=.*/ENABLED=1/' /etc/default/haproxy && \
	rm -rf /var/lib/apt/lists/*

ADD . /data/captain
WORKDIR /data/captain
RUN npm install

EXPOSE 80 443
CMD node captain.js