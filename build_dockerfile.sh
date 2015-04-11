docker build -t slush/luotsi .
docker tag -f slush/luotsi 10.1.1.85:5000/slush-luotsi
docker push 10.1.1.85:5000/slush-luotsi
