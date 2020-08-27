FROM alpine:latest
COPY . /app
WORKDIR /app
RUN apk update
RUN apk add --no-cache nodejs npm
RUN npm install
RUN apk add --no-cache python3 ca-certificates py3-pip python3-dev
RUN apk add --no-cache build-base gcc g++ bash coreutils
RUN pip3 install pandas
RUN apk add --no-cache openjdk11
RUN apk add --no-cache php ruby go
RUN apk add --no-cache R R-dev sqlite
RUN addgroup -S repl && adduser -S repl -G repl -s /bin/bash
RUN chmod 555 /home/repl/
RUN mkdir /home/repl/.cache
RUN chown repl /home/repl/.cache
RUN mv /app/online-ide.pem /root/.
RUN mv /app/online-ide.crt /root/.
RUN update-ca-certificates
ENV JAVA_HOME=/usr/lib/jvm/java-11-openjdk
ENV PATH="$JAVA_HOME/bin:${PATH}"
CMD ["node", "server.js"]
