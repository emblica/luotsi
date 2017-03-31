.phony: test
.phony: run
.phony: dev
.phony: check

# the user and group are for syntax checking
# by `make check`
make dev:
	NODE_ENV=DEV \
	LOG_LEVEL=debug \
	HAPROXY_CONF=test_haproxy/haproxy.cfg \
	HAPROXY_RELOAD_CMD=: \
	HAPROXY_USER=root \
	HAPROXY_GROUP=root \
	node luotsi.js

make run:
	NODE_ENV=PROD node luotsi.js

make test:
	NODE_ENV=TEST HAPROXY_CONF=test_haproxy/haproxy.cfg tape tests/tests.js

make check:
	docker run -it --rm --name luotsi-haproxy-check \
		-v ${PWD}/test_haproxy:/etc/haproxy:ro \
		haproxy:1.7 \
		haproxy -c -f /etc/haproxy/haproxy.cfg
