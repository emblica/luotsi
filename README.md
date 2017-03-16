# luotsi
Loadbalancer and load supervisor


### Run (production)

* warning: will overwrite HAPROXY_CONF file !

```
make run
```

* to try out production settings safely:

```
NODE_ENV=PROD HAPROXY_CONF=my_haproxy.cfg node luotsi.js
```


### Run without HAProxy (safe for dev)

```
make dev
```


### Run tests

```
make test
```