docker build -t slush/captain .
docker tag -f slush/captain 10.1.1.85:5000/slush-captain
docker push 10.1.1.85:5000/slush-captain
