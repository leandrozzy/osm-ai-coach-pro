FROM nginx:1.27-alpine
COPY . /usr/share/nginx/html
RUN printf 'server { listen 8080; server_name _; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } location = /health { add_header Content-Type text/plain; return 200 "ok"; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 8080
