.phony: test
.phony: run
.phony: dev

make dev:
	NODE_ENV=DEV node luotsi.js

make run:
	NODE_ENV=PROD node luotsi.js

make test:
	NODE_ENV=TEST tape tests.js
