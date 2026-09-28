FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/public/ /usr/share/nginx/html/
EXPOSE 80
